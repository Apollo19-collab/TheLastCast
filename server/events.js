// Live map events on the lake (see shared/events.js for the schedule and
// tuning). Follows the clock: begins the scheduled event when its time comes,
// tracks progress and who helped, applies its fishing bonuses, and pays out.

import { EVENT_TUNING, EVENT_TYPES, eventsAround, haulGoal, inEvent, shoalBite, tideMeter } from '../shared/events.js';
import { FishingState } from '../shared/constants.js';

export class WorldEvents {
  constructor(game, { now = () => Date.now() } = {}) {
    this.game = game;
    this.now = now;
    this.active = null;
  }

  tick(dt) {
    const t = this.now() / 1000;
    const a = this.active;
    if (a?.rush) {
      a.rush -= dt;
      if (a.rush <= 0) {
        a.rush = 0;
        this.game.emitAll({ kind: 'mapEvent', phase: 'rushEnd', type: a.type, name: EVENT_TYPES[a.type].name });
      }
    }
    if (a && t >= a.end) this.finish();
    if (!this.active) {
      const { current } = eventsAround(this.game.world, t, 0);
      if (current && current.id !== this.lastId) this.begin(current);
    }
  }

  begin(ev) {
    const anglers = this.game.players.size;
    this.lastId = ev.id;
    this.active = {
      ...ev,
      progress: 0,
      goal: ev.type === 'haul' ? haulGoal(anglers) : ev.type === 'tide' ? tideMeter(anglers) : 0,
      rush: 0,
      rushes: 0,
      done: false,
      helpers: new Map(), // player id -> { name, fish }
    };
    const T = EVENT_TYPES[ev.type];
    this.game.emitAll({ kind: 'mapEvent', phase: 'start', type: ev.type, name: T.name, place: ev.place.name, desc: T.desc, x: ev.place.x, y: ev.place.y });
  }

  /** Fishing bonuses for a bobber at (x, y): { bite, rare, points, ignoreCrowd } or null. */
  modsAt(player, x, y) {
    const a = this.active;
    if (!a || a.done || player.duel || !inEvent(a, x, y)) return null;
    if (a.type === 'shoal') {
      const t = EVENT_TUNING.shoal;
      return { bite: shoalBite(this.anglersIn(a)), rare: t.rare, ignoreCrowd: true };
    }
    if (a.type === 'haul') return { bite: EVENT_TUNING.haul.bite };
    if (a.type === 'tide' && a.rush > 0) return { points: EVENT_TUNING.tide.points, rare: EVENT_TUNING.tide.rare };
    return null;
  }

  /** Anglers with a line in the event's water right now. */
  anglersIn(a) {
    let n = 0;
    for (const p of this.game.players.values()) {
      if (p.line.state !== FishingState.IDLE && p.line.state !== FishingState.CASTING && inEvent(a, p.line.x, p.line.y)) n++;
    }
    return Math.max(1, n);
  }

  onCatch(player, c) {
    const a = this.active;
    if (!a || a.done || !inEvent(a, c.x, c.y)) return;
    const h = a.helpers.get(player.id) ?? { name: player.name, fish: 0 };
    h.fish += 1;
    a.helpers.set(player.id, h);
    if (a.type === 'haul') {
      a.progress += 1;
      if (a.progress >= a.goal) this.finish(true);
    } else if (a.type === 'tide' && !a.rush) {
      a.progress += c.points;
      if (a.progress >= a.goal) {
        a.progress = 0;
        a.rushes += 1;
        a.rush = EVENT_TUNING.tide.rush;
        this.game.emitAll({ kind: 'mapEvent', phase: 'rush', type: 'tide', name: EVENT_TYPES.tide.name, seconds: a.rush, by: player.name });
      }
    }
  }

  /** End the event (early for a completed Great Haul) and pay everyone who helped. */
  finish(completed = false) {
    const a = this.active;
    if (!a || a.done) return;
    a.done = true;
    const T = EVENT_TYPES[a.type];
    const group = a.helpers.size;
    const success = a.type !== 'haul' || completed;
    for (const [id, h] of a.helpers) {
      const player = this.game.players.get(id);
      if (!player) continue;
      let coins = 0;
      let xp = 0;
      if (a.type === 'shoal') {
        const t = EVENT_TUNING.shoal;
        coins = Math.min(h.fish, t.maxFish) * t.coinsPerFish * Math.min(group, t.maxGroup);
      } else if (a.type === 'haul') {
        const t = EVENT_TUNING.haul;
        if (completed) {
          coins = t.coins + Math.min(h.fish, t.maxFish) * t.coinsPerFish;
          xp = t.xp;
        } else coins = Math.min(h.fish, t.maxFish) * t.failCoinsPerFish;
      } else {
        const t = EVENT_TUNING.tide;
        coins = t.coins + a.rushes * t.coinsPerRush;
      }
      const profile = player.profile;
      profile.coins += coins;
      profile.counters.coinsEarned += coins;
      profile.counters.mapEvents = (profile.counters.mapEvents || 0) + 1;
      if (xp) this.game.gainXp(player, xp);
      this.game.checkAchievements(player);
      this.game.profileChanged(player);
      this.game.emitTo(player, { kind: 'mapEventReward', type: a.type, name: T.name, coins, xp, fish: h.fish, group, success });
    }
    this.game.emitAll({
      kind: 'mapEvent', phase: 'end', type: a.type, name: T.name, place: a.place.name,
      success, completed, helpers: group, rushes: a.rushes, progress: a.progress, goal: a.goal,
    });
    // A completed Great Haul ends early; the next event follows the schedule.
    this.active = null;
  }

  /** For the lake snapshot. */
  snapshot() {
    const a = this.active;
    if (!a) return undefined;
    return {
      id: a.id, type: a.type, end: a.end, px: a.place.x, py: a.place.y, pn: a.place.name, r: a.radius,
      pg: Math.round(a.progress), gl: a.goal, ru: Math.ceil(a.rush), n: a.helpers.size,
      in: a.type === 'shoal' ? this.anglersIn(a) : undefined,
    };
  }
}
