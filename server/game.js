// Authoritative game state for one fishing location (a "room").
// Clients send intentions (inputs, cast, hook, reel); everything that matters
// for scoring is decided here.

import { FishingState, MAX_NAME_LENGTH, MSG, PLAYER_SPEED } from '../shared/constants.js';
import { isWater, stepMovement } from '../shared/world.js';
import { ITEMS, computeStats } from '../shared/gear.js';
import { ACHIEVEMENTS, ACHIEVEMENT_BY_ID, progressOf, unlocksFor } from '../shared/achievements.js';
import { cancel, hook, newLine, setReel, tryCast, updateLine } from './fishing.js';
import { newProfile } from './profiles.js';

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

export class Game {
  /**
   * onProfileChange(player) is called whenever a player's persistent profile
   * changes (catch, purchase) so the caller can save it.
   */
  constructor({ world, maxPlayers = 50, rng = Math.random, onProfileChange = () => {} }) {
    this.world = world;
    this.onProfileChange = onProfileChange;
    this.maxPlayers = maxPlayers;
    this.rng = rng;
    this.players = new Map();
    this.hotspots = [];
    this.events = [];
    this.nextPlayerId = 1;
    this.nextHotspotId = 1;
    this.fillHotspots();
  }

  // ---- players -------------------------------------------------------------

  addPlayer(rawName, send, profile = newProfile()) {
    if (this.players.size >= this.maxPlayers) return null;
    const id = String(this.nextPlayerId++);
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
    this.players.delete(id);
    this.emitAll({ kind: 'leave', playerId: id, name: player.name });
  }

  handleMessage(player, msg) {
    switch (msg.t) {
      case MSG.INPUT:
        player.input = { up: !!msg.up, down: !!msg.down, left: !!msg.left, right: !!msg.right };
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
      case MSG.BUY:
        this.buy(player, msg.item);
        break;
      case MSG.EQUIP:
        this.equip(player, msg.item);
        break;
    }
  }

  // ---- progression -------------------------------------------------------------

  /** Whether a player may buy an item (owned items and locked items can't be bought). */
  canBuy(profile, itemId) {
    const it = ITEMS[itemId];
    if (!it) return { ok: false };
    if (profile.inventory.includes(itemId)) return { ok: false, message: `You already own the ${it.name}.` };
    if (it.unlock && !profile.achievements[it.unlock]) {
      return { ok: false, message: `The ${it.name} unlocks with the "${ACHIEVEMENT_BY_ID[it.unlock].name}" achievement.` };
    }
    if (profile.coins < it.price) return { ok: false, message: `You need ${it.price - profile.coins} more coins for the ${it.name}.` };
    return { ok: true };
  }

  /** Buy an item by id; it is equipped straight away. */
  buy(player, itemId) {
    if (typeof itemId !== 'string' || !Object.hasOwn(ITEMS, itemId)) return;
    const { profile } = player;
    const check = this.canBuy(profile, itemId);
    if (!check.ok) {
      if (check.message) this.emitTo(player, { kind: 'shop', ok: false, message: check.message });
      return;
    }
    const it = ITEMS[itemId];
    profile.coins -= it.price;
    profile.counters.coinsSpent += it.price;
    profile.inventory.push(itemId);
    profile.equipped[it.slot] = itemId;
    player.stats = computeStats(profile.equipped);
    this.emitTo(player, { kind: 'shop', ok: true, message: `You bought the ${it.name}!` });
    this.checkAchievements(player);
    this.profileChanged(player);
  }

  /** Equip an owned item in its slot. */
  equip(player, itemId) {
    if (typeof itemId !== 'string' || !Object.hasOwn(ITEMS, itemId)) return;
    const { profile } = player;
    if (!profile.inventory.includes(itemId)) return;
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
      equipped: p.equipped,
      achievements: p.achievements,
      counters: p.counters,
      index: p.index,
      history: p.history,
    });
  }

  // ---- simulation ----------------------------------------------------------

  tick(dt) {
    this.updateHotspots(dt);
    for (const p of this.players.values()) {
      // Players stand still while their line is out.
      if (p.line.state === FishingState.IDLE) {
        const next = stepMovement(this.world, p, p.input, PLAYER_SPEED, dt);
        if (next.moved) {
          p.facing = Math.atan2(next.y - p.y, next.x - p.x);
          p.x = next.x;
          p.y = next.y;
        }
      }
      updateLine(this, p, dt);
    }
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
    for (let i = 0; i < 100; i++) {
      const x = this.rng() * this.world.width;
      const y = this.rng() * this.world.height;
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
        g: [p.profile.equipped.rod, p.profile.equipped.reel, p.profile.equipped.line, p.profile.equipped.bait], // drawn on their angler
      };
      if (line.state !== FishingState.IDLE) {
        s.bx = r1(line.x);
        s.by = r1(line.y);
      }
      if (line.state === FishingState.REELING) {
        s.tn = r2(line.tension);
        s.pg = r2(line.progress);
        s.pl = line.pulling;
      }
      players.push(s);
    }
    return {
      t: MSG.STATE,
      players,
      hotspots: this.hotspots.map((h) => ({ id: h.id, x: r1(h.x), y: r1(h.y), r: h.r, life: r1(h.life) })),
    };
  }
}
