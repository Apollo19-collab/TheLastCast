// One boat voyage: its own room (a Game on the sea world) that runs through
//
//   outbound -> [fishing at stop 1..4, sailing between stops] -> results -> home
//
// Each stop is one of the SEA_LOCATIONS (shared/voyage.js) with its own fish
// and one special event that starts at a random moment during the stop.
// Fish caught at sea are rewarded as normal; on top of that the voyage keeps
// a points table and crew missions, and pays bonus coins at the end.

import {
  BOSS, BOSSES, BOSS_ATTACKS, SEA_BOAT, SEA_EVENTS, SEA_LOCATIONS, MISSIONS, TIMES_OF_DAY, VOYAGE,
  bossHp, bossZone, deckSlot, makeSeaWorld, missionGoal, missionText, seaZone,
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
  constructor({ crew, ids, rng = Math.random, onProfileChange = () => {}, timing = VOYAGE, onEnd = () => {} }) {
    this.rng = rng;
    this.timing = timing;
    this.onEnd = onEnd;
    this.game = new Game({
      world: makeSeaWorld(),
      kind: 'voyage',
      ids,
      rng,
      maxPlayers: Infinity,
      onProfileChange,
      hooks: {
        onCatch: (p, c) => this.onCatch(p, c),
        onLeave: (p) => this.onLeave(p),
        snapshot: () => ({ vy: this.snapshot() }),
        playerExtras: (p) => ({ vp: this.scores.get(p.id)?.points ?? 0, bd: this.scores.get(p.id)?.damage || undefined }),
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
      this.scores.set(p.id, { name: p.name, points: 0, catches: 0, damage: 0 });
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

  startBoss() {
    const b = BOSSES[this.boss.id];
    this.phase = 'boss';
    this.timer = this.timing.boss;
    this.boss.max = this.boss.hp = bossHp(this.boss.id, this.game.players.size);
    this.boss.attack = null; // { id, warn } while an attack is coming
    this.boss.effect = null; // { id, timer } while an attack's effect lasts
    this.boss.nextAttack = this.attackDelay();
    this.boss.weakTimer = 0;
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

  attackDelay() {
    const [lo, hi] = this.boss.hp <= this.boss.max * BOSS.enrageAt ? BOSS.enragedEvery : BOSS.attackEvery;
    return lo + this.rng() * (hi - lo);
  }

  /** Put the glowing weak spot somewhere new within casting reach of the deck. */
  moveWeakSpot() {
    const side = this.rng() < 0.5 ? -1 : 1;
    const x = SEA_BOAT.x - 220 + this.rng() * 440;
    const y = SEA_BOAT.y + side * (SEA_BOAT.beam / 2 + 90 + this.rng() * 130);
    this.game.hotspots = [{ id: this.game.nextHotspotId++, x, y, r: BOSS.weakSpotRadius, life: BOSS.weakSpotMove + 1, boss: true }];
    this.boss.weakTimer = BOSS.weakSpotMove;
  }

  updateBoss(dt) {
    const boss = this.boss;
    boss.weakTimer -= dt;
    if (boss.weakTimer <= 0) this.moveWeakSpot();
    if (boss.effect) {
      boss.effect.timer -= dt;
      if (boss.effect.timer <= 0) {
        boss.effect = null;
        this.game.mods = {};
      }
    }
    if (boss.attack) {
      boss.attack.warn -= dt;
      if (boss.attack.warn <= 0) this.bossAttack(boss.attack.id);
      return;
    }
    boss.nextAttack -= dt;
    if (boss.nextAttack <= 0) {
      const options = BOSSES[boss.id].attacks;
      const id = options[Math.floor(this.rng() * options.length)];
      boss.attack = { id, warn: BOSS.warning };
      const a = BOSS_ATTACKS[id];
      this.game.emitAll({ kind: 'bossWarn', attack: id, name: a.name, desc: a.desc, seconds: BOSS.warning });
    }
  }

  bossAttack(id) {
    const a = BOSS_ATTACKS[id];
    this.boss.attack = null;
    this.boss.nextAttack = this.attackDelay();
    if (a.tension) {
      for (const p of this.game.players.values()) {
        if (p.line.state === FishingState.REELING) p.line.tension += a.tension / (p.line.lineStrength || 1);
      }
    }
    if (a.mods) {
      this.boss.effect = { id, timer: a.seconds };
      this.game.mods = { ...a.mods };
    }
    this.game.emitAll({ kind: 'bossAttack', attack: id, name: a.name });
  }

  /** Every fish landed hurts the boss; fish from the weak spot hurt twice as much. */
  damageBoss(player, c, score) {
    const damage = c.points * (c.hotspot ? 2 : 1);
    this.boss.hp = Math.max(0, this.boss.hp - damage);
    score.damage += damage;
    this.game.emitAll({ kind: 'bossHit', playerId: player.id, name: player.name, damage, weak: c.hotspot, hp: this.boss.hp, max: this.boss.max });
    if (this.boss.hp <= 0) this.endBoss(true);
  }

  endBoss(won) {
    if (this.phase !== 'boss') return;
    this.boss.result = won ? 'won' : 'lost';
    this.game.mods = {};
    this.game.world.hotspots = this.savedHotspots;
    this.game.hotspots = [];
    for (const p of this.game.players.values()) {
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
    if (this.phase === 'boss') this.damageBoss(player, c, score);
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
    if (c.rarity === 'rare' || c.rarity === 'legendary') bump('rare');
    if (c.event) bump('event');
    if (c.kg >= 10) bump('heavy');
    bump('variety');
    if (c.rarity === 'legendary') bump('legend');
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
    const mvp = won ? [...ranking].sort((a, b) => b.damage - a.damage)[0] : null;
    ranking.forEach((r, rank) => {
      const player = this.game.players.get(r.id);
      if (!player) return;
      const breakdown = {
        points: Math.round(r.points * t.pointsBonus),
        missions: missionsDone * t.missionReward,
        rank: r.points > 0 ? (t.rankBonus[rank] ?? 0) : 0,
        boss: won
          ? BOSS.win.coins + Math.round(r.damage * BOSS.win.damageCoins) + (mvp?.id === r.id && r.damage > 0 ? BOSS.win.mvpCoins : 0)
          : this.boss.result ? BOSS.lose.coins : 0,
      };
      r.bonus = breakdown.points + breakdown.missions + breakdown.rank + breakdown.boss;
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
        boss: { name: BOSSES[this.boss.id].name, result: this.boss.result, mvp: mvp?.damage ? mvp.name : null },
        ranking: ranking.slice(0, 10).map((x, i) => ({ rank: i + 1, name: x.name, points: x.points, catches: x.catches, damage: x.damage, me: x.id === r.id })),
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
          id: this.boss.id, hp: Math.ceil(this.boss.hp), mx: this.boss.max,
          w: this.boss.attack?.id ?? null, wl: this.boss.attack ? Math.ceil(this.boss.attack.warn) : 0,
          e: this.boss.effect?.id ?? null, r: this.boss.result,
        }
        : undefined,
    };
  }
}
