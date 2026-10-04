// Authoritative game state for one fishing location (a "room"): the lake, or
// one boat voyage out at sea. Clients send intentions (inputs, cast, hook,
// reel); everything that matters for scoring is decided here. The Hub
// (hub.js) owns all rooms and moves players between them.

import { FishingState, MAX_NAME_LENGTH, MSG, PLAYER_SPEED, SPRINT, WORLD_MAP } from '../shared/constants.js';
import { isWater, stepMovement } from '../shared/world.js';
import { BULK_PACKS, ITEMS, STARTER, baitCount, computeStats, isConsumable, packPrice } from '../shared/gear.js';
import { ACHIEVEMENTS, ACHIEVEMENT_BY_ID, progressOf, unlocksFor } from '../shared/achievements.js';
import { ARMOUR, NO_ARMOUR, SETS, computeArmour } from '../shared/armour.js';
import { levelFor, levelUpCoins } from '../shared/levels.js';
import { CHUM, rollChum } from '../shared/chum.js';
import { PETS, ZOO, combineBonuses, petPrice, zooAt } from '../shared/pets.js';
import { isWalkable } from '../shared/world.js';
import { cancel, hook, newLine, setReel, tryCast, updateLine } from './fishing.js';
import { newProfile } from './profiles.js';
import { Duels } from './duel.js';

const PLAYER_COLORS = [
  '#e4572e', '#f3a712', '#a8c686', '#669bbc', '#c77dff',
  '#ff8fab', '#43aa8b', '#f9c74f', '#90be6d', '#577590',
];

export function sanitizeName(raw) {
  const name = String(raw ?? '')
    .replace(/[^\p{L}\p{N} _.'-]/gu, '')
    .trim()
    .slice(0, MAX_NAME_LENGTH);
  return name || null;
}

/** Player ids, shared by every room so a player keeps theirs when moving. */
export function idSource() {
  let next = 1;
  return () => String(next++);
}

export class Game {
  /**
   * onProfileChange(player) is called whenever a player's persistent profile
   * changes (catch, purchase) so the caller can save it.
   * kind: 'lake' (duels allowed) or 'voyage'.
   * hooks (all optional):
   *   onCatch(player, catchInfo)  after a fish is landed and rewarded
   *   onLeave(player)             a player left this room or the game
   *   snapshot()                  extra fields for every state snapshot
   *   playerExtras(player)        extra fields for a player's snapshot entry
   * records: the Hall of Records (server/records.js), shared by every room.
   */
  constructor({ world, kind = 'lake', ids = idSource(), maxPlayers = 50, rng = Math.random, onProfileChange = () => {}, hooks = {}, now = () => Date.now(), records = null }) {
    this.now = now;
    this.records = records;
    this.world = world;
    this.kind = kind;
    this.ids = ids;
    this.onProfileChange = onProfileChange;
    this.maxPlayers = maxPlayers;
    this.rng = rng;
    this.hooks = hooks;
    this.players = new Map();
    this.hotspots = [];
    this.chums = []; // placed chum buckets: { id, ownerId, name, x, y, life, fish }
    this.nextChumId = 1;
    this.events = [];
    this.nextHotspotId = 1;
    // Fishing modifiers from special events at sea (see SEA_EVENTS in voyage.js).
    this.mods = {};
    // When set, nobody can cast and this is the reason (e.g. the boat is sailing).
    this.fishingClosed = null;
    this.duels = kind === 'lake' ? new Duels(this) : null;
    this.fillHotspots();
  }

  // ---- players -------------------------------------------------------------

  addPlayer(rawName, send, profile = newProfile()) {
    if (this.players.size >= this.maxPlayers) return null;
    const id = this.ids();
    const { spawn } = this.world;
    // Accounts always play under their username; guests pick a name each time.
    profile.name = profile.username || sanitizeName(rawName) || profile.name || `Angler ${id}`;
    const player = {
      id,
      name: profile.name,
      color: PLAYER_COLORS[(Number(id) - 1) % PLAYER_COLORS.length],
      x: spawn.x + (this.rng() - 0.5) * 120,
      y: spawn.y + (this.rng() - 0.5) * 40,
      facing: -Math.PI / 2,
      input: { up: false, down: false, left: false, right: false },
      line: newLine(),
      profile, // persistent: score, coins, tackle, achievements, index, history
      stats: computeStats(profile.equipped),
      armourStats: combineBonuses(computeArmour(profile.armour), profile.pet),
      gear: null, // tackle override (duels); profile.equipped is never changed by it
      duel: null,
      aboard: false, // waiting on the boat at the lake
      room: this,
      send,
    };
    this.players.set(id, player);
    this.emitAll({ kind: 'join', playerId: id, name: player.name });
    this.checkAchievements(player); // e.g. progress counted from an older save
    this.profileChanged(player);
    return player;
  }

  removePlayer(id) {
    const player = this.players.get(id);
    if (!player) return;
    this.detach(player);
    this.emitAll({ kind: 'leave', playerId: id, name: player.name });
  }

  /** Take a player out of this room (they may be moving to another one). */
  detach(player) {
    if (!this.players.has(player.id)) return;
    this.duels?.playerLeft(player);
    this.hooks.onLeave?.(player);
    this.chums = this.chums.filter((c) => c.ownerId !== player.id); // packed away when you leave
    this.players.delete(player.id);
    player.line = newLine();
    player.input = { up: false, down: false, left: false, right: false };
  }

  /** Bring a player who was in another room into this one, at (x, y). */
  attach(player, x, y) {
    player.room = this;
    player.x = x;
    player.y = y;
    player.line = newLine();
    player.aboard = false;
    this.players.set(player.id, player);
  }

  /** Why this player can't cast right now, or null if they can. */
  castBlocked(player) {
    if (this.fishingClosed) return this.fishingClosed;
    if (player.aboard) return 'You are aboard the boat. Wait for it to sail, or press E to step off.';
    if (player.duel?.phase === 'countdown') return 'The duel is about to start!';
    if (player.dazed > 0) return 'You\'re dazed! Wait a moment.';
    return null;
  }

  handleMessage(player, msg) {
    switch (msg.t) {
      case MSG.INPUT:
        player.input = { up: !!msg.up, down: !!msg.down, left: !!msg.left, right: !!msg.right, sprint: !!msg.sprint };
        break;
      case MSG.CAST:
        tryCast(this, player, Number(msg.angle), Number(msg.power));
        break;
      case MSG.HOOK:
        hook(this, player);
        break;
      case MSG.REEL:
        setReel(player, msg.on);
        break;
      case MSG.CANCEL:
        cancel(this, player);
        break;
      case MSG.CHUM:
        this.placeChum(player);
        break;
      case MSG.STRIKE:
        this.hooks.onStrike?.(player);
        break;
      case MSG.BUY:
        if (msg.item === 'chum') { this.buyChum(player, msg.packs === 5 ? 5 : 1); return; }
        if (msg.item === 'map') { this.buyMap(player); return; }
        if (Object.hasOwn(PETS, String(msg.item))) { this.buyPet(player, msg.item); return; }
        if (Object.hasOwn(ARMOUR, String(msg.item))) { this.buyArmour(player, msg.item); return; }
        if (this.tackleLocked(player)) return;
        this.buy(player, msg.item, msg.packs === BULK_PACKS ? BULK_PACKS : 1);
        break;
      case MSG.EQUIP:
        if (Object.hasOwn(ARMOUR, String(msg.item))) { this.wearArmour(player, msg.item); return; }
        if (Object.hasOwn(PETS, String(msg.item))) { this.choosePet(player, msg.item); return; }
        if (this.tackleLocked(player)) return;
        this.equip(player, msg.item);
        break;
      case MSG.DUEL:
        this.duels?.handle(player, msg);
        break;
      case MSG.RECORDS:
        this.emitTo(player, { kind: 'records', ...(this.records?.view(player.profile.id) ?? { species: {} }) });
        break;
    }
  }

  /** Duelists fish with matched tackle, so they can't change theirs. */
  tackleLocked(player) {
    if (!player.duel) return false;
    this.emitTo(player, { kind: 'shop', ok: false, message: "You can't change tackle during a duel." });
    return true;
  }

  // ---- progression -------------------------------------------------------------

  /**
   * Whether a player may buy an item. Rods, reels and lines are bought once;
   * bait comes in packs and can be bought again and again (packs: 1 or BULK_PACKS).
   */
  canBuy(profile, itemId, packs = 1) {
    const it = ITEMS[itemId];
    if (!it) return { ok: false };
    const consumable = isConsumable(itemId);
    if (!consumable && profile.inventory.includes(itemId)) return { ok: false, message: `You already own the ${it.name}.` };
    if (it.unlock && !profile.achievements[it.unlock]) {
      return { ok: false, message: `The ${it.name} unlocks with the "${ACHIEVEMENT_BY_ID[it.unlock].name}" achievement.` };
    }
    if (it.level && levelFor(profile.xp) < it.level) return { ok: false, message: `The ${it.name} needs level ${it.level}.` };
    const price = consumable ? packPrice(itemId, packs) : it.price;
    if (profile.coins < price) return { ok: false, message: `You need ${price - profile.coins} more coins for that.` };
    return { ok: true, price };
  }

  /** Where bait can be bought: at the lake's Bait Shop, or anywhere on a voyage (the deckhand). */
  atBaitShop(player) {
    if (this.kind === 'voyage') return true;
    return !!this.world.shops?.some((s) => s.id === 'bait' && Math.hypot(player.x - s.x, player.y - s.y) <= s.range);
  }

  /** Whether a player is standing at one of the travelling tackle shops. */
  atShop(player, shopId) {
    const shop = this.world.shops?.find((s) => s.id === shopId);
    return !!shop && Math.hypot(player.x - shop.x, player.y - shop.y) <= shop.range;
  }

  /** Buy an item by id; it is equipped straight away. */
  buy(player, itemId, packs = 1) {
    if (typeof itemId !== 'string' || !Object.hasOwn(ITEMS, itemId)) return;
    const { profile } = player;
    const consumable = isConsumable(itemId);
    const sold = ITEMS[itemId].shop;
    if (sold && !this.atShop(player, sold)) {
      const shop = this.world.shops?.find((s) => s.id === sold);
      this.emitTo(player, { kind: 'shop', ok: false, message: `The ${ITEMS[itemId].name} is only sold at ${shop?.name ?? 'a travelling tackle shop'}.` });
      return;
    }
    if (consumable && !sold && !this.atBaitShop(player)) {
      this.emitTo(player, { kind: 'shop', ok: false, message: 'Bait is sold at the Bait Shop on South Beach.' });
      return;
    }
    const check = this.canBuy(profile, itemId, packs);
    if (!check.ok) {
      if (check.message) this.emitTo(player, { kind: 'shop', ok: false, message: check.message });
      return;
    }
    const it = ITEMS[itemId];
    profile.coins -= check.price;
    profile.counters.coinsSpent += check.price;
    let message;
    if (consumable) {
      const uses = it.pack * packs;
      profile.bait[itemId] = (profile.bait[itemId] || 0) + uses;
      message = `You bought ${uses} ${it.name} (${profile.bait[itemId]} in your bag).`;
    } else {
      profile.inventory.push(itemId);
      message = `You bought the ${it.name}!`;
    }
    profile.equipped[it.slot] = itemId;
    player.stats = computeStats(profile.equipped);
    this.emitTo(player, { kind: 'shop', ok: true, message });
    this.checkAchievements(player);
    this.profileChanged(player);
  }

  // ---- levels and armour ---------------------------------------------------------

  /** Armour bonuses in effect right now (switched off in duels). */
  armourOf(player) {
    return player.duel ? NO_ARMOUR : player.armourStats ?? NO_ARMOUR;
  }

  /** Add XP; announces level ups and pays a small coin reward for each. */
  gainXp(player, amount) {
    if (!(amount > 0)) return;
    const { profile } = player;
    const before = levelFor(profile.xp);
    profile.xp += Math.round(amount);
    const after = levelFor(profile.xp);
    for (let level = before + 1; level <= after; level++) {
      const coins = levelUpCoins(level);
      profile.coins += coins;
      profile.counters.coinsEarned += coins;
      const unlocks = Object.values(SETS).filter((s) => s.level === level).map((s) => s.name);
      this.emitTo(player, { kind: 'levelUp', level, coins, unlocks });
      this.emitAll({ kind: 'levelUpAll', playerId: player.id, name: player.name, level });
    }
  }

  /** Buy an armour piece (needs the level and the coins); it's worn straight away. */
  buyArmour(player, pieceId) {
    const it = ARMOUR[pieceId];
    const { profile } = player;
    let message = null;
    if (profile.armourOwned.includes(pieceId)) message = `You already own the ${it.name}.`;
    else if (levelFor(profile.xp) < it.level) message = `The ${it.name} needs level ${it.level}.`;
    else if (profile.coins < it.price) message = `You need ${it.price - profile.coins} more coins for the ${it.name}.`;
    if (message) {
      this.emitTo(player, { kind: 'shop', ok: false, message });
      return;
    }
    profile.coins -= it.price;
    profile.armourOwned.push(pieceId);
    profile.armour[it.slot] = pieceId;
    this.armourChanged(player);
    this.emitTo(player, { kind: 'shop', ok: true, message: `You bought the ${it.name}!` });
  }

  /** Put on an owned piece, or take it off if it's already worn. */
  wearArmour(player, pieceId) {
    const it = ARMOUR[pieceId];
    const { profile } = player;
    if (!profile.armourOwned.includes(pieceId)) return;
    profile.armour[it.slot] = profile.armour[it.slot] === pieceId ? null : pieceId;
    this.armourChanged(player);
  }

  // ---- pets and the Travelling Zoo -------------------------------------------------

  /** The zoo right now (only at the lake). */
  zoo() {
    return this.kind === 'lake' ? zooAt(this.now() / 1000) : null;
  }

  buyPet(player, petId) {
    const { profile } = player;
    const zoo = this.zoo();
    const pet = PETS[petId];
    const price = petPrice(petId);
    let message = null;
    if (!zoo || Math.hypot(player.x - zoo.x, player.y - zoo.y) > ZOO.range) message = 'Pets are sold at the Travelling Zoo.';
    else if (!zoo.stock.includes(petId)) message = `The zoo doesn't have a ${pet.name} right now.`;
    else if (profile.pets.includes(petId)) message = `You already have a ${pet.name}.`;
    else if (profile.coins < price) message = `You need ${price - profile.coins} more coins for the ${pet.name}.`;
    if (message) {
      this.emitTo(player, { kind: 'shop', ok: false, message });
      return;
    }
    profile.coins -= price;
    profile.pets.push(petId);
    profile.pet = petId;
    this.emitTo(player, { kind: 'shop', ok: true, message: `You adopted a ${pet.name}! ${pet.ability}: ${pet.desc}` });
    this.emitAll({ kind: 'petAdopted', playerId: player.id, name: player.name, pet: pet.name, rarity: pet.rarity });
    this.armourChanged(player);
    this.checkAchievements(player);
    this.profileChanged(player);
  }

  /** Take a pet you own along (or send it home if it's already with you). */
  choosePet(player, petId) {
    const { profile } = player;
    if (!profile.pets.includes(petId)) return;
    profile.pet = profile.pet === petId ? null : petId;
    this.armourChanged(player);
  }

  armourChanged(player) {
    const before = player.armourStats?.set;
    player.armourStats = combineBonuses(computeArmour(player.profile.armour), player.profile.pet);
    const set = player.armourStats.set;
    if (set && set !== before) {
      const e = SETS[set].effect;
      this.emitTo(player, { kind: 'setBonus', set: SETS[set].name, effect: e.name, desc: e.desc });
    }
    this.profileChanged(player);
  }

  // ---- chum buckets ------------------------------------------------------------

  buyChum(player, count) {
    const { profile } = player;
    const price = CHUM.price * count;
    let message = null;
    if (!this.atBaitShop(player)) message = 'Chum buckets are sold at the Bait Shop on South Beach.';
    else if (profile.chum + count > CHUM.maxOwned) message = `You can carry at most ${CHUM.maxOwned} chum buckets.`;
    else if (profile.coins < price) message = `You need ${price - profile.coins} more coins for that.`;
    if (message) {
      this.emitTo(player, { kind: 'shop', ok: false, message });
      return;
    }
    profile.coins -= price;
    profile.counters.coinsSpent += price;
    profile.chum += count;
    this.emitTo(player, { kind: 'shop', ok: true, message: `You bought ${count} chum bucket${count > 1 ? 's' : ''}. Press C to put one down.` });
    this.checkAchievements(player);
    this.profileChanged(player);
  }

  /** Buy the Angler's Map at the Bait Shop: once, and it's yours for good. */
  buyMap(player) {
    const { profile } = player;
    let message = null;
    if (profile.worldMap) message = 'You already have the Angler\'s Map. Press B to open it.';
    else if (this.kind !== 'lake' || !this.atBaitShop(player)) message = 'The Angler\'s Map is sold at the Bait Shop on South Beach.';
    else if (profile.coins < WORLD_MAP.price) message = `You need ${WORLD_MAP.price - profile.coins} more coins for that.`;
    if (message) {
      this.emitTo(player, { kind: 'shop', ok: false, message });
      return;
    }
    profile.coins -= WORLD_MAP.price;
    profile.counters.coinsSpent += WORLD_MAP.price;
    profile.worldMap = true;
    this.emitTo(player, { kind: 'shop', ok: true, message: 'You bought the Angler\'s Map! Press B to see the whole world.' });
    this.checkAchievements(player);
    this.profileChanged(player);
  }

  /** Put a chum bucket down at your feet (one out at a time). */
  placeChum(player) {
    const { profile } = player;
    let message = null;
    if (profile.chum <= 0) message = 'You have no chum buckets. Buy them at the Bait Shop.';
    else if (player.duel) message = 'No chum in duels!';
    else if (player.aboard) message = 'Wait until the boat is out at sea.';
    else if (this.chums.some((c) => c.ownerId === player.id)) message = 'You already have a chum bucket out.';
    else if (!isWalkable(this.world, player.x, player.y)) message = 'You can\'t put a bucket down here.';
    if (message) {
      this.emitTo(player, { kind: 'info', message });
      return;
    }
    profile.chum -= 1;
    this.chums.push({ id: this.nextChumId++, ownerId: player.id, name: player.name, x: player.x, y: player.y, life: CHUM.duration, fish: 0 });
    this.emitTo(player, { kind: 'chumPlaced', seconds: CHUM.duration, fish: CHUM.maxFish });
    this.emitAll({ kind: 'chumAll', playerId: player.id, name: player.name });
    this.profileChanged(player);
  }

  /** Bobbers near any chum bucket bite faster. */
  chumBiteBonus(x, y) {
    return this.chums.some((c) => Math.hypot(c.x - x, c.y - y) <= CHUM.attractRadius) ? CHUM.biteBonus : 1;
  }

  /** You landed a fish near your own bucket: maybe it becomes bait. */
  chumCatch(player, rarity) {
    const bucket = this.chums.find((c) => c.ownerId === player.id && Math.hypot(c.x - player.x, c.y - player.y) <= CHUM.radius);
    if (!bucket || player.duel) return;
    bucket.fish += 1;
    const { profile } = player;
    const unlocked = (id) => !ITEMS[id].unlock || !!profile.achievements[ITEMS[id].unlock];
    const got = rollChum(this.rng, rarity, unlocked);
    if (got) {
      profile.bait[got.bait] = (profile.bait[got.bait] || 0) + got.uses;
      this.emitTo(player, { kind: 'chummed', bait: got.bait, name: ITEMS[got.bait].name, uses: got.uses });
    }
    if (bucket.fish >= CHUM.maxFish) this.removeChum(bucket, 'full');
  }

  removeChum(bucket, why) {
    this.chums = this.chums.filter((c) => c !== bucket);
    const owner = this.players.get(bucket.ownerId);
    if (owner) this.emitTo(owner, { kind: 'chumDone', why, fish: bucket.fish });
  }

  updateChums(dt) {
    for (const c of [...this.chums]) {
      c.life -= dt;
      if (c.life <= 0) this.removeChum(c, 'time');
    }
  }

  /** A fish took the bait: use one up. Out of it? Back to the free starter bait. */
  useBait(player) {
    if (player.gear) return; // duels use matched tackle, on the house
    if (this.rng() < this.armourOf(player).baitSave) return; // a pet saved it
    const { profile } = player;
    const id = profile.equipped.bait;
    if (!isConsumable(id)) return;
    const left = Math.max(0, (profile.bait[id] || 0) - 1);
    const it = ITEMS[id];
    if (left > 0) {
      profile.bait[id] = left;
      if (left === 5) this.emitTo(player, { kind: 'baitLow', message: `Only 5 ${it.name} left.` });
    } else {
      delete profile.bait[id];
      profile.equipped.bait = STARTER.bait;
      player.stats = computeStats(profile.equipped);
      this.emitTo(player, { kind: 'baitOut', message: `You're out of ${it.name}! Back to ${ITEMS[STARTER.bait].name}. Restock at the Bait Shop.` });
    }
    this.profileChanged(player);
  }

  /** Equip an owned item (or bait you have some of) in its slot. */
  equip(player, itemId) {
    if (typeof itemId !== 'string' || !Object.hasOwn(ITEMS, itemId)) return;
    const { profile } = player;
    const have = ITEMS[itemId].slot === 'bait' ? baitCount(profile, itemId) > 0 : profile.inventory.includes(itemId);
    if (!have) return;
    profile.equipped[ITEMS[itemId].slot] = itemId;
    player.stats = computeStats(profile.equipped);
    this.profileChanged(player);
  }

  /** Award any achievements whose goals are now met: coins, unlocks, announcement. */
  checkAchievements(player) {
    const { profile } = player;
    for (const a of ACHIEVEMENTS) {
      if (profile.achievements[a.id] || !progressOf(profile, a).done) continue;
      profile.achievements[a.id] = Date.now();
      profile.coins += a.coins;
      const unlocks = unlocksFor(a.id).map((id) => ITEMS[id].name);
      this.emitTo(player, { kind: 'achievement', id: a.id, name: a.name, coins: a.coins, unlocks });
      this.emitAll({ kind: 'achievementAll', playerId: player.id, name: player.name, achievement: a.name });
    }
  }

  /** News saved for you while you were away (e.g. a weekly records prize). */
  deliverNotices(player) {
    const notices = player.profile.notices;
    if (!notices?.length) return;
    for (const n of notices) this.emitTo(player, n);
    player.profile.notices = [];
    this.profileChanged(player);
  }

  profileChanged(player) {
    this.onProfileChange(player);
    const p = player.profile;
    player.send({
      t: MSG.PROFILE,
      username: p.username,
      score: p.score,
      coins: p.coins,
      catches: p.catches,
      inventory: p.inventory,
      bait: p.bait,
      chum: p.chum,
      worldMap: p.worldMap,
      equipped: p.equipped,
      xp: p.xp,
      armourOwned: p.armourOwned,
      armour: p.armour,
      pets: p.pets,
      pet: p.pet,
      achievements: p.achievements,
      counters: p.counters,
      index: p.index,
      history: p.history,
      trophies: p.trophies,
    });
  }

  // ---- simulation ----------------------------------------------------------

  tick(dt) {
    this.updateHotspots(dt);
    this.updateChums(dt);
    this.duels?.tick(dt);
    for (const p of this.players.values()) {
      if (p.dazed > 0) p.dazed = Math.max(0, p.dazed - dt);
      // Players stand still while their line is out, or while aboard the boat.
      let sprinting = false;
      if (p.line.state === FishingState.IDLE && !p.aboard) {
        sprinting = this.canSprint(p);
        const next = stepMovement(this.world, p, p.input, PLAYER_SPEED * (sprinting ? SPRINT.speed : 1), dt);
        if (next.moved) {
          p.facing = Math.atan2(next.y - p.y, next.x - p.x);
          p.x = next.x;
          p.y = next.y;
        } else sprinting = false;
      }
      this.updateStamina(p, sprinting, dt);
      updateLine(this, p, dt);
    }
  }

  // ---- sprinting ----------------------------------------------------------------

  canSprint(p) {
    const i = p.input;
    if (!i?.sprint || !(i.up || i.down || i.left || i.right)) return false;
    if (p.stamina === undefined) p.stamina = 1;
    if (p.winded && p.stamina < SPRINT.recover) return false;
    p.winded = false;
    return p.stamina > 0;
  }

  updateStamina(p, sprinting, dt) {
    if (p.stamina === undefined) p.stamina = 1;
    if (sprinting) {
      p.stamina = Math.max(0, p.stamina - SPRINT.drain * dt);
      p.restFor = SPRINT.delay;
      if (p.stamina === 0) p.winded = true;
    } else if ((p.restFor = Math.max(0, (p.restFor ?? 0) - dt)) === 0) {
      p.stamina = Math.min(1, p.stamina + SPRINT.regen * dt);
    }
    p.sprinting = sprinting;
  }

  /** Map-event bonuses for a bobber at (x, y), or null. */
  eventMods(player, x, y) {
    return this.worldEvents?.modsAt(player, x, y) ?? null;
  }

  // ---- hotspots: visible, temporary areas with better fishing --------------

  updateHotspots(dt) {
    for (const h of this.hotspots) h.life -= dt;
    this.hotspots = this.hotspots.filter((h) => h.life > 0);
    this.fillHotspots();
  }

  fillHotspots() {
    const cfg = this.world.hotspots;
    while (this.hotspots.length < cfg.count) {
      const pos = this.randomOpenWater(cfg.radius * 0.6);
      if (!pos) break;
      this.hotspots.push({
        id: this.nextHotspotId++,
        x: pos.x,
        y: pos.y,
        r: cfg.radius,
        life: cfg.minLife + this.rng() * (cfg.maxLife - cfg.minLife),
      });
    }
  }

  randomOpenWater(margin) {
    const area = this.world.hotspots.area ?? { x: 0, y: 0, w: this.world.width, h: this.world.height };
    for (let i = 0; i < 100; i++) {
      const x = area.x + this.rng() * area.w;
      const y = area.y + this.rng() * area.h;
      const clear = [[0, 0], [margin, 0], [-margin, 0], [0, margin], [0, -margin]]
        .every(([ox, oy]) => isWater(this.world, x + ox, y + oy));
      if (clear) return { x, y };
    }
    return null;
  }

  hotspotAt(x, y) {
    return this.hotspots.find((h) => Math.hypot(h.x - x, h.y - y) <= h.r) || null;
  }

  countBobbersNear(self, x, y, radius) {
    let n = 0;
    for (const p of this.players.values()) {
      if (p === self || p.line.state === FishingState.IDLE || p.line.state === FishingState.CASTING) continue;
      if (Math.hypot(p.line.x - x, p.line.y - y) <= radius) n++;
    }
    return n;
  }

  // ---- outgoing messages ---------------------------------------------------

  emitTo(player, event) {
    player.send({ t: MSG.EVENT, ...event });
  }

  emitAll(event) {
    this.events.push(event);
  }

  drainEvents() {
    const out = this.events;
    this.events = [];
    return out;
  }

  snapshot() {
    const r1 = (v) => Math.round(v * 10) / 10;
    const r2 = (v) => Math.round(v * 100) / 100;
    const players = [];
    for (const p of this.players.values()) {
      const line = p.line;
      const s = {
        id: p.id,
        name: p.name,
        color: p.color,
        x: r1(p.x),
        y: r1(p.y),
        f: r2(p.facing),
        s: line.state,
        sc: p.profile.score,
        c: p.profile.catches,
        best: p.profile.best,
        g: (({ rod, reel, line, bait }) => [rod, reel, line, bait])(p.gear ?? p.profile.equipped), // drawn on their angler
        ...this.hooks.playerExtras?.(p),
      };
      s.lv = levelFor(p.profile.xp);
      const worn = p.profile.armour;
      if (worn.head || worn.body || worn.legs || worn.feet) s.ar = [worn.head, worn.body, worn.legs, worn.feet];
      if (p.profile.pet && !p.duel) s.pt = p.profile.pet;
      if (p.aboard) s.ab = 1;
      if (p.stamina !== undefined && p.stamina < 1) s.st = r2(p.stamina);
      if (p.sprinting) s.sr = 1;
      if (p.duel) Object.assign(s, this.duels.snapshotFor(p));
      if (line.state !== FishingState.IDLE) {
        s.bx = r1(line.x);
        s.by = r1(line.y);
      }
      if (line.state === FishingState.REELING) {
        s.tn = r2(line.tension);
        s.pg = r2(line.progress);
        s.pl = line.pulling;
        s.fd = line.tier; // fish strength tier, for the fight bars
      }
      players.push(s);
    }
    return {
      t: MSG.STATE,
      players,
      hotspots: this.hotspots.map((h) => ({ id: h.id, x: r1(h.x), y: r1(h.y), r: h.r, life: r1(h.life), ...(h.boss ? { b: 1 } : {}) })),
      chums: this.chums.map((c) => ({ id: c.id, o: c.ownerId, n: c.name, x: r1(c.x), y: r1(c.y), l: Math.ceil(c.life), f: c.fish })),
      ...(this.kind === 'lake' ? { zoo: (({ stock, x, y, area, left }) => ({ stock, x, y, area, tl: Math.ceil(left) }))(this.zoo()) } : {}),
      ...this.hooks.snapshot?.(),
    };
  }
}
