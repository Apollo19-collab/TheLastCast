// One boat voyage: its own room (a Game on the sea world) that runs through
//
//   outbound -> [fishing at stop 1..3, sailing between stops] -> boss -> results -> home
//
// Each stop is one of the SEA_LOCATIONS (shared/voyage.js) with its own fish
// and one special event that starts at a random moment during the stop.
// Fish caught at sea are rewarded as normal; on top of that the voyage keeps
// a points table and crew missions, and pays bonus coins at the end.

import {
  BOSS, BOSSES, BOSS_ATTACKS, DECK_AREAS, SEA_BOAT, SEA_EVENTS, SEA_LOCATIONS, MISSIONS, TIMES_OF_DAY, VOYAGE,
  bossHp, bossPhase, bossPool, bossZone, deckSlot, inDeckArea, makeSeaWorld, missionGoal, missionText, seaZone, splitPool,
} from '../shared/voyage.js';
import { Game } from './game.js';
import { XP } from '../shared/levels.js';
import { cancel } from './fishing.js';
import { FishingState } from '../shared/constants.js';

function shuffled(list, rng) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export class Voyage {
  /**
   * crew: players coming from the lake (already detached from it).
   * timing: VOYAGE, or shorter values for tests.
   * onEnd(voyage): called once the voyage is over and it's time to go home.
   */
  constructor({ crew, ids, rng = Math.random, onProfileChange = () => {}, timing = VOYAGE, onEnd = () => {}, records = null }) {
    this.rng = rng;
    this.timing = timing;
    this.onEnd = onEnd;
    this.game = new Game({
      world: makeSeaWorld(),
      kind: 'voyage',
      ids,
      rng,
      records,
      maxPlayers: Infinity,
      onProfileChange,
      hooks: {
        onCatch: (p, c) => this.onCatch(p, c),
        onLeave: (p) => this.onLeave(p),
        onLand: (p, line) => this.onLand(p, line),
        onStrike: (p) => this.onStrike(p),
        snapshot: () => ({ vy: this.snapshot() }),
        playerExtras: (p) => ({
          vp: this.scores.get(p.id)?.points ?? 0,
          bd: this.scores.get(p.id)?.damage || undefined,
          bc: this.scores.get(p.id)?.contribution || undefined,
          dz: p.dazed > 0 ? 1 : undefined,
        }),
      },
    });

    this.stops = shuffled(Object.keys(SEA_LOCATIONS), rng).slice(0, timing.stops).map((loc, i) => ({
      loc,
      time: TIMES_OF_DAY[Math.min(i, TIMES_OF_DAY.length - 1)],
      // When this stop's special event begins, in seconds after arriving.
      eventAt: timing.eventEarliest + rng() * Math.max(0, timing.fishing - timing.eventLength - timing.eventEarliest - 5),
    }));
    this.missions = shuffled(MISSIONS, rng).slice(0, timing.missions).map((m) => {
      const goal = missionGoal(m, crew.length);
      return { id: m.id, text: missionText(m, goal), goal, progress: 0, done: false };
    });
    this.species = new Set();
    this.scores = new Map(); // player id -> { name, points, catches }
    this.crewTotal = 0;
    this.phase = 'outbound';
    this.timer = timing.outbound;
    this.stopIndex = -1;
    this.event = null; // { id, timer } while a special event is on
    this.eventDone = false;
    // The boss waiting at the end of the voyage.
    this.boss = { id: shuffled(Object.keys(BOSSES), rng)[0], hp: 0, max: 0, result: null };
    this.game.fishingClosed = 'The boat is heading out to sea. Get ready!';
    this.game.world.zones[0] = seaZone(null);

    crew.forEach((p, i) => {
      const pos = deckSlot(i);
      this.game.attach(p, pos.x, pos.y);
      p.facing = i % 2 ? Math.PI / 2 : -Math.PI / 2;
      this.scores.set(p.id, { name: p.name, points: 0, catches: 0, damage: 0, contribution: 0, harpoons: 0, grabHits: 0, dazed: 0 });
    });
  }

  get stop() {
    return this.stops[this.stopIndex] ?? null;
  }

  /** Sent to each passenger when they come aboard (MSG.ROOM). */
  describe() {
    return {
      room: 'voyage',
      stops: this.stops.map((s) => ({ loc: s.loc, time: s.time })),
      missions: this.missions.map((m) => ({ id: m.id, text: m.text, goal: m.goal })),
    };
  }

  tick(dt) {
    if (this.phase === 'done') return;
    if (this.game.players.size === 0) {
      // Everyone disconnected: nothing left to sail for.
      this.phase = 'done';
      this.onEnd(this);
      return;
    }
    this.game.tick(dt);
    this.timer -= dt;
    if (this.phase === 'fishing') this.updateEvent(dt);
    if (this.phase === 'boss') this.updateBoss(dt);
    if (this.timer > 0) return;
    if (this.phase === 'outbound' || this.phase === 'sailing') this.arrive(this.stopIndex + 1);
    else if (this.phase === 'fishing') this.leaveStop();
    else if (this.phase === 'bossIntro') this.startBoss();
    else if (this.phase === 'boss') this.endBoss(false);
    else if (this.phase === 'results') {
      this.phase = 'done';
      this.onEnd(this);
    }
  }

  arrive(index) {
    this.stopIndex = index;
    this.phase = 'fishing';
    this.timer = this.timing.fishing;
    this.event = null;
    this.eventDone = false;
    this.game.world.zones[0] = seaZone(this.stop.loc);
    this.game.fishingClosed = null;
    this.game.mods = {};
    const loc = SEA_LOCATIONS[this.stop.loc];
    this.game.emitAll({ kind: 'voyageStop', loc: this.stop.loc, name: loc.name, time: this.stop.time, index, of: this.stops.length });
  }

  updateEvent(dt) {
    const elapsed = this.timing.fishing - this.timer;
    if (!this.event && !this.eventDone && elapsed >= this.stop.eventAt) {
      const loc = SEA_LOCATIONS[this.stop.loc];
      const ev = SEA_EVENTS[loc.event];
      this.event = { id: loc.event, timer: this.timing.eventLength };
      this.game.mods = { ...ev.mods, event: loc.event };
      this.game.world.zones[0] = seaZone(this.stop.loc, true);
      this.game.emitAll({ kind: 'seaEvent', id: loc.event, name: ev.name, desc: ev.desc, seconds: this.timing.eventLength });
    } else if (this.event) {
      this.event.timer -= dt;
      if (this.event.timer <= 0) this.endEvent();
    }
  }

  endEvent() {
    if (!this.event) return;
    const ev = SEA_EVENTS[this.event.id];
    this.event = null;
    this.eventDone = true;
    this.game.mods = {};
    this.game.world.zones[0] = seaZone(this.stop.loc);
    this.game.emitAll({ kind: 'seaEventEnd', name: ev.name });
  }

  leaveStop() {
    this.endEvent();
    // Lines in: a fish still on the line gets away, like the bell in FFXIV.
    for (const p of this.game.players.values()) {
      if (p.line.state !== FishingState.IDLE) cancel(this.game, p);
    }
    const last = this.stopIndex >= this.stops.length - 1;
    if (last) {
      // Not home yet: something big is coming.
      this.phase = 'bossIntro';
      this.timer = this.timing.bossIntro;
      this.game.fishingClosed = 'Lines in! Something huge is rising from the deep...';
      this.game.world.zones[0] = seaZone(null);
      const b = BOSSES[this.boss.id];
      this.game.emitAll({ kind: 'bossIncoming', boss: this.boss.id, name: b.name, desc: b.desc, seconds: this.timing.bossIntro });
    } else {
      this.phase = 'sailing';
      this.timer = this.timing.sailing;
      const next = this.stops[this.stopIndex + 1];
      this.game.fishingClosed = `Lines in! Sailing to ${SEA_LOCATIONS[next.loc].name}...`;
      this.game.world.zones[0] = seaZone(null);
      this.game.emitAll({ kind: 'voyageSail', next: next.loc, name: SEA_LOCATIONS[next.loc].name });
    }
  }

  // ---- the boss fight ------------------------------------------------------------
  //
  // See the BOSS notes in shared/voyage.js. this.boss holds the fight's state:
  //   phase       index into BOSS.phases
  //   attack      { id, warn, area? } while an attack is coming
  //   effect      { id, timer } while an attack's effect lasts
  //   breach      { x, y, r, timer, struck: Set } while the boss is breaching
  //   grabs       [{ id, x, y, hp, max, timer, hits: Map(playerId -> strikes) }]

  startBoss() {
    const b = BOSSES[this.boss.id];
    this.phase = 'boss';
    this.timer = this.timing.boss;
    Object.assign(this.boss, {
      max: bossHp(this.boss.id, this.game.players.size),
      phase: 0,
      attack: null,
      effect: null,
      breach: null,
      grabs: [],
      nextBreach: BOSS.breach.first,
      nextGrab: BOSS.grab.first,
      weakTimer: 0,
      clock: 0,
    });
    this.boss.hp = this.boss.max;
    this.boss.nextAttack = this.attackDelay();
    this.game.world.zones[0] = bossZone(this.boss.id);
    this.game.fishingClosed = null;
    this.game.mods = {};
    // The boss's weak spot replaces the normal hotspots.
    this.savedHotspots = this.game.world.hotspots;
    this.game.world.hotspots = { ...this.savedHotspots, count: 0 };
    this.game.hotspots = [];
    this.moveWeakSpot();
    this.game.emitAll({ kind: 'bossStart', boss: this.boss.id, name: b.name, hp: this.boss.max, seconds: this.timing.boss });
  }

  get phaseInfo() {
    return BOSS.phases[this.boss.phase];
  }

  attackDelay() {
    const [lo, hi] = this.phaseInfo.attackEvery;
    return lo + this.rng() * (hi - lo);
  }

  /** A random spot in the water within casting reach of the deck. */
  spotOffDeck() {
    const side = this.rng() < 0.5 ? -1 : 1;
    return {
      x: SEA_BOAT.x - 220 + this.rng() * 440,
      y: SEA_BOAT.y + side * (SEA_BOAT.beam / 2 + 90 + this.rng() * 130),
    };
  }

  /** Put the glowing weak spot somewhere new. */
  moveWeakSpot() {
    const { x, y } = this.spotOffDeck();
    const life = this.phaseInfo.weakSpotMove;
    this.game.hotspots = [{ id: this.game.nextHotspotId++, x, y, r: BOSS.weakSpotRadius, life: life + 1, boss: true }];
    this.boss.weakTimer = life;
  }

  updateBoss(dt) {
    const boss = this.boss;
    boss.clock += dt;
    boss.weakTimer -= dt;
    if (boss.weakTimer <= 0) this.moveWeakSpot();

    const phase = bossPhase(boss.hp / boss.max);
    if (phase > boss.phase) {
      boss.phase = phase;
      boss.nextAttack = Math.min(boss.nextAttack, this.attackDelay());
      this.moveWeakSpot();
      this.game.emitAll({ kind: 'bossPhase', phase, name: this.phaseInfo.name, boss: BOSSES[boss.id].name });
    }

    if (boss.effect) {
      boss.effect.timer -= dt;
      if (boss.effect.timer <= 0) {
        boss.effect = null;
        this.game.mods = {};
      }
    }
    this.updateBreach(dt);
    this.updateGrabs(dt);

    if (boss.attack) {
      boss.attack.warn -= dt;
      if (boss.attack.warn <= 0) this.bossAttack(boss.attack);
      return;
    }
    boss.nextAttack -= dt;
    if (boss.nextAttack <= 0) {
      const options = BOSSES[boss.id].attacks;
      const id = options[Math.floor(this.rng() * options.length)];
      const a = BOSS_ATTACKS[id];
      boss.attack = { id, warn: BOSS.warning };
      let name = a.name;
      let desc = a.desc;
      if (a.area) {
        const areas = Object.keys(DECK_AREAS);
        boss.attack.area = areas[Math.floor(this.rng() * areas.length)];
        name = BOSSES[boss.id].slam;
        desc = `Get away from ${DECK_AREAS[boss.attack.area].name}! Anyone caught there is dazed and loses their fish.`;
      }
      this.game.emitAll({ kind: 'bossWarn', attack: id, name, desc, area: boss.attack.area ?? null, seconds: BOSS.warning });
    }
  }

  bossAttack(attack) {
    const a = BOSS_ATTACKS[attack.id];
    this.boss.attack = null;
    this.boss.nextAttack = this.attackDelay();
    if (a.tension) {
      for (const p of this.game.players.values()) {
        if (p.line.state === FishingState.REELING) p.line.tension += a.tension / (p.line.lineStrength || 1);
      }
    }
    if (a.mods) {
      this.boss.effect = { id: attack.id, timer: a.seconds };
      this.game.mods = { ...a.mods };
    }
    const hit = [];
    if (a.area) {
      for (const p of this.game.players.values()) {
        if (!inDeckArea(attack.area, p.x, p.y)) continue;
        if (p.line.state !== FishingState.IDLE) cancel(this.game, p);
        p.dazed = BOSS.slam.stun;
        hit.push(p.name);
        const score = this.scores.get(p.id);
        if (score) score.dazed += 1;
        this.game.emitTo(p, { kind: 'dazed', seconds: BOSS.slam.stun, by: BOSSES[this.boss.id].slam });
      }
    }
    this.game.emitAll({ kind: 'bossAttack', attack: attack.id, name: a.area ? BOSSES[this.boss.id].slam : a.name, area: attack.area ?? null, hit });
  }

  // -- breaches: harpoon the boss by landing your bobber in the ring --

  updateBreach(dt) {
    const boss = this.boss;
    if (boss.breach) {
      boss.breach.timer -= dt;
      if (boss.breach.timer <= 0) {
        this.game.emitAll({ kind: 'breachEnd', strikes: boss.breach.struck.size });
        boss.breach = null;
      }
      return;
    }
    boss.nextBreach -= dt;
    if (boss.nextBreach > 0) return;
    const [lo, hi] = BOSS.breach.every;
    boss.nextBreach = lo + this.rng() * (hi - lo);
    const { x, y } = this.spotOffDeck();
    boss.breach = { x, y, r: BOSS.breach.radius, timer: BOSS.breach.window, struck: new Set() };
    this.game.emitAll({ kind: 'breach', name: BOSSES[boss.id].name, x, y, seconds: BOSS.breach.window });
  }

  /** A bobber landed: inside a breach ring, that's a harpoon strike (once per breach each). */
  onLand(player, line) {
    const breach = this.phase === 'boss' && this.boss.breach;
    if (!breach || breach.struck.has(player.id)) return;
    if (Math.hypot(line.x - breach.x, line.y - breach.y) > breach.r) return;
    breach.struck.add(player.id);
    const score = this.scores.get(player.id);
    if (score) score.harpoons += 1;
    this.damageBoss(player, BOSS.breach.damage, { harpoon: true });
  }

  // -- grabs: walk over and mash E to beat them off --

  updateGrabs(dt) {
    const boss = this.boss;
    for (const g of [...boss.grabs]) {
      g.timer -= dt;
      if (g.timer > 0) continue;
      // It held on: the boss heals and the boat lurches.
      boss.grabs = boss.grabs.filter((x) => x !== g);
      const before = boss.hp;
      boss.hp = Math.min(boss.max, boss.hp + Math.round(boss.max * BOSS.grab.heal));
      const heal = boss.hp - before;
      for (const p of this.game.players.values()) {
        if (p.line.state === FishingState.REELING) p.line.tension += BOSS.grab.lurch / (p.line.lineStrength || 1);
      }
      this.game.emitAll({ kind: 'grabFail', name: BOSSES[boss.id].grab, boss: BOSSES[boss.id].name, heal, hp: boss.hp, max: boss.max });
    }
    if (boss.grabs.length) return;
    boss.nextGrab -= dt;
    if (boss.nextGrab > 0) return;
    const [lo, hi] = BOSS.grab.every;
    boss.nextGrab = lo + this.rng() * (hi - lo);
    const crew = this.game.players.size;
    const count = boss.phase >= 1 && crew >= 3 ? 2 : 1;
    const hits = Math.max(3, Math.round((BOSS.grab.hits + BOSS.grab.hitsPerAngler * crew) / count));
    const rails = this.rng() < 0.5 ? [566, 634] : [634, 566];
    for (let i = 0; i < count; i++) {
      boss.grabs.push({
        id: this.game.nextHotspotId++,
        x: 720 + this.rng() * 340,
        y: rails[i],
        hp: hits,
        max: hits,
        timer: BOSS.grab.time,
        hits: new Map(),
      });
    }
    this.game.emitAll({ kind: 'grab', name: BOSSES[boss.id].grab, count, seconds: BOSS.grab.time });
  }

  /** E near a grab: strike it. */
  onStrike(player) {
    if (this.phase !== 'boss' || player.dazed > 0 || player.line.state !== FishingState.IDLE) return;
    const now = this.boss.clock;
    if (now - (player.lastStrike ?? -Infinity) < BOSS.grab.cooldown) return;
    let best = null;
    for (const g of this.boss.grabs) {
      const d = Math.hypot(g.x - player.x, g.y - player.y);
      if (d <= BOSS.grab.range && (!best || d < best.d)) best = { g, d };
    }
    if (!best) return;
    player.lastStrike = now;
    const { g } = best;
    g.hp -= 1;
    g.hits.set(player.id, (g.hits.get(player.id) || 0) + 1);
    const score = this.scores.get(player.id);
    if (score) {
      score.grabHits += 1;
      score.contribution += BOSS.grabHitValue;
    }
    this.game.emitTo(player, { kind: 'strike', left: g.hp, x: g.x, y: g.y });
    if (g.hp > 0) return;
    // Beaten off: it hurts the boss, credited to everyone who struck it.
    this.boss.grabs = this.boss.grabs.filter((x) => x !== g);
    const names = [];
    for (const [id, n] of g.hits) {
      const s = this.scores.get(id);
      if (!s) continue;
      names.push(s.name);
      const share = Math.round((BOSS.grab.damage * n) / g.max);
      s.damage += share;
      s.contribution += share;
    }
    this.boss.hp = Math.max(0, this.boss.hp - BOSS.grab.damage);
    this.game.emitAll({ kind: 'grabCleared', name: BOSSES[this.boss.id].grab, by: names, damage: BOSS.grab.damage, hp: this.boss.hp, max: this.boss.max });
    if (this.boss.hp <= 0) this.endBoss(true);
  }

  /** Damage from a fish or a harpoon, credited to a player. */
  damageBoss(player, damage, { weak = false, harpoon = false } = {}) {
    const score = this.scores.get(player.id);
    this.boss.hp = Math.max(0, this.boss.hp - damage);
    if (score) {
      score.damage += damage;
      score.contribution += damage;
    }
    this.game.emitAll({ kind: 'bossHit', playerId: player.id, name: player.name, damage, weak, harpoon, hp: this.boss.hp, max: this.boss.max });
    if (this.boss.hp <= 0) this.endBoss(true);
  }

  endBoss(won) {
    if (this.phase !== 'boss') return;
    this.boss.result = won ? 'won' : 'lost';
    this.boss.attack = null;
    this.boss.breach = null;
    this.boss.grabs = [];
    this.game.mods = {};
    this.game.world.hotspots = this.savedHotspots;
    this.game.hotspots = [];
    for (const p of this.game.players.values()) {
      p.dazed = 0;
      if (p.line.state !== FishingState.IDLE) cancel(this.game, p);
    }
    const b = BOSSES[this.boss.id];
    this.game.emitAll({ kind: 'bossEnd', won, name: b.name });
    this.phase = 'results';
    this.timer = this.timing.results;
    this.game.fishingClosed = 'The voyage is over. Heading home!';
    this.game.world.zones[0] = seaZone(null);
    this.payOut();
  }

  onCatch(player, c) {
    const score = this.scores.get(player.id);
    if (!score) return;
    if (this.phase === 'boss') this.damageBoss(player, c.points * (c.hotspot ? 2 : 1), { weak: c.hotspot });
    score.points += c.points;
    score.catches += 1;
    this.crewTotal += c.points;
    this.species.add(c.species);
    const counters = player.profile.counters;
    counters.seaCatches += 1;
    if (c.event) counters.eventCatches += 1;

    const bump = (id, by = 1) => {
      const m = this.missions.find((x) => x.id === id);
      if (!m || m.done) return;
      m.progress = id === 'variety' ? this.species.size : m.progress + by;
      if (m.progress >= m.goal) {
        m.progress = m.goal;
        m.done = true;
        this.game.emitAll({ kind: 'mission', text: m.text, reward: this.timing.missionReward });
      }
    };
    bump('haul');
    if (c.rarity === 'rare' || c.rarity === 'legendary' || c.rarity === 'mythic') bump('rare');
    if (c.event) bump('event');
    if (c.kg >= 10) bump('heavy');
    bump('variety');
    if (c.rarity === 'legendary' || c.rarity === 'mythic') bump('legend');
  }

  onLeave(player) {
    this.scores.delete(player.id);
  }

  /** End of the voyage: rank everyone and pay the bonuses. */
  payOut() {
    const ranking = [...this.scores.entries()]
      .map(([id, s]) => ({ id, ...s }))
      .sort((a, b) => b.points - a.points || b.catches - a.catches);
    const missionsDone = this.missions.filter((m) => m.done).length;
    const t = this.timing;
    const won = this.boss.result === 'won';
    const fought = !!this.boss.result;
    const mvp = fought ? [...ranking].sort((a, b) => b.contribution - a.contribution)[0] : null;
    // The prize pool, split by contribution to the fight.
    const pool = fought ? bossPool(this.boss.id, ranking.length, won) : 0;
    const shares = splitPool(pool, ranking.map((r) => r.contribution));
    ranking.forEach((r, i) => { r.share = shares[i]; });
    ranking.forEach((r, rank) => {
      const player = this.game.players.get(r.id);
      if (!player) return;
      const breakdown = {
        points: Math.round(r.points * t.pointsBonus),
        missions: missionsDone * t.missionReward,
        rank: r.points > 0 ? (t.rankBonus[rank] ?? 0) : 0,
        boss: (won ? BOSS.win.coins : fought ? BOSS.lose.coins : 0)
          + (won && mvp?.id === r.id && r.contribution > 0 ? BOSS.win.mvpCoins : 0),
        pool: r.share,
      };
      r.bonus = breakdown.points + breakdown.missions + breakdown.rank + breakdown.boss + breakdown.pool;
      const { profile } = player;
      profile.coins += r.bonus;
      profile.counters.coinsEarned += r.bonus;
      profile.counters.voyages += 1;
      if (won) profile.counters.bossKills += 1;
      r.xp = XP.voyage + Math.round(r.points * t.pointsBonus) + (won ? BOSS.win.xp : this.boss.result ? BOSS.lose.xp : 0);
      this.game.gainXp(player, r.xp);
      this.game.checkAchievements(player);
      this.game.profileChanged(player);
      this.game.emitTo(player, {
        kind: 'voyageResults',
        rank: rank + 1,
        bonus: r.bonus,
        xp: r.xp,
        breakdown,
        crewTotal: this.crewTotal,
        missions: this.missions.map((m) => ({ text: m.text, done: m.done })),
        boss: { name: BOSSES[this.boss.id].name, result: this.boss.result, mvp: mvp?.contribution ? mvp.name : null, pool },
        ranking: ranking.slice(0, 10).map((x, i) => ({
          rank: i + 1, name: x.name, points: x.points, catches: x.catches, damage: x.damage,
          contribution: x.contribution, share: x.share, me: x.id === r.id,
        })),
        seconds: t.results,
      });
    });
  }

  snapshot() {
    return {
      ph: this.phase,
      st: this.stopIndex,
      loc: this.stop?.loc ?? null,
      next: this.phase === 'sailing' || this.phase === 'outbound' ? this.stops[this.stopIndex + 1]?.loc ?? null : null,
      tl: Math.max(0, Math.ceil(this.timer)),
      ev: this.event?.id ?? null,
      evl: this.event ? Math.ceil(this.event.timer) : 0,
      crew: this.crewTotal,
      ms: this.missions.map((m) => m.progress),
      bs: this.phase === 'boss' || this.phase === 'bossIntro' || this.boss.result
        ? {
          id: this.boss.id, hp: Math.ceil(this.boss.hp), mx: this.boss.max, p: this.boss.phase ?? 0,
          w: this.boss.attack?.id ?? null, wl: this.boss.attack ? Math.ceil(this.boss.attack.warn) : 0,
          wa: this.boss.attack?.area ?? null,
          e: this.boss.effect?.id ?? null, r: this.boss.result,
          bk: this.boss.breach ? {
            x: Math.round(this.boss.breach.x), y: Math.round(this.boss.breach.y), r: this.boss.breach.r,
            t: Math.round(this.boss.breach.timer * 10) / 10,
          } : null,
          gr: (this.boss.grabs ?? []).map((g) => ({ id: g.id, x: Math.round(g.x), y: g.y, hp: g.hp, mx: g.max, t: Math.ceil(g.timer) })),
          pool: bossPool(this.boss.id, this.game.players.size, true),
        }
        : undefined,
    };
  }
}
