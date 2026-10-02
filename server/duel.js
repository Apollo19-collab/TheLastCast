// Fishing duels at the lake (rules and numbers in shared/duel.js).
//
// challenge -> (accept | decline | expire) -> countdown -> live -> result
//
// While a duel runs, both anglers fish with DUEL.loadout: `player.gear` and
// `player.stats` are overridden and `profile.equipped` is left alone, so
// their own tackle simply comes back afterwards. Their catches only count on
// the duel scoreboard (fishing.js calls recordCatch). The winner gets the prize.

import { DUEL } from '../shared/duel.js';
import { computeStats } from '../shared/gear.js';
import { newLine } from './fishing.js';

export class Duels {
  constructor(game) {
    this.game = game;
    this.time = 0; // seconds, advanced by tick()
    this.challenges = new Map(); // challenger id -> { to, expires }
    this.active = new Set();
    this.prizeLog = new Map(); // "profileA|profileB" -> time the prize was last won
    this.declined = new Map(); // "challenger|target" -> time they may ask again (no invite spam)
  }

  handle(player, msg) {
    switch (msg.op) {
      case 'challenge':
        this.challenge(player, String(msg.target ?? ''));
        break;
      case 'accept':
      case 'decline':
        this.respond(player, String(msg.from ?? ''), msg.op === 'accept');
        break;
      case 'forfeit':
        if (player.duel) this.end(player.duel, player);
        break;
    }
  }

  /** Why these two can't start a duel, or null. */
  problem(a, b) {
    if (!b || b === a || !this.game.players.has(b.id)) return 'That angler is no longer here.';
    if (a.duel) return 'You are already in a duel.';
    if (b.duel) return `${b.name} is already in a duel.`;
    if (a.aboard) return 'You are aboard the boat.';
    if (b.aboard) return `${b.name} is aboard the boat.`;
    return null;
  }

  challenge(player, targetId) {
    const target = this.game.players.get(targetId);
    const problem = this.problem(player, target)
      ?? (Math.hypot(target.x - player.x, target.y - player.y) > DUEL.range ? `Get closer to ${target.name} to challenge them.` : null);
    if (problem) {
      this.game.emitTo(player, { kind: 'duelInfo', message: problem });
      return;
    }
    if ((this.declined.get(`${player.id}|${target.id}`) ?? 0) > this.time) {
      this.game.emitTo(player, { kind: 'duelInfo', message: `${target.name} just turned you down. Give them a moment.` });
      return;
    }
    const existing = this.challenges.get(player.id);
    if (existing && existing.to === target.id && existing.expires > this.time) {
      this.game.emitTo(player, { kind: 'duelInfo', message: `You already challenged ${target.name}. Waiting for an answer...` });
      return;
    }
    this.challenges.set(player.id, { to: target.id, expires: this.time + DUEL.challengeTime });
    this.game.emitTo(target, {
      kind: 'duelInvite', from: player.id, name: player.name, seconds: DUEL.challengeTime,
      duration: DUEL.duration, prize: DUEL.prize, loadout: DUEL.loadout,
    });
    this.game.emitTo(player, { kind: 'duelInfo', message: `You challenged ${target.name} to a duel. Waiting for them to accept...` });
  }

  respond(player, fromId, accept) {
    const ch = this.challenges.get(fromId);
    if (!ch || ch.to !== player.id || ch.expires <= this.time) {
      if (accept) this.game.emitTo(player, { kind: 'duelInfo', message: 'That challenge has expired.' });
      return;
    }
    this.challenges.delete(fromId);
    const challenger = this.game.players.get(fromId);
    if (!accept) {
      this.declined.set(`${fromId}|${player.id}`, this.time + DUEL.declineCooldown);
      if (challenger) this.game.emitTo(challenger, { kind: 'duelInfo', message: `${player.name} declined your duel.` });
      return;
    }
    const problem = this.problem(player, challenger);
    if (problem) {
      this.game.emitTo(player, { kind: 'duelInfo', message: problem });
      return;
    }
    this.start(challenger, player);
  }

  start(a, b) {
    const duel = { a, b, phase: 'countdown', timer: DUEL.countdown, scores: new Map([[a.id, 0], [b.id, 0]]), catches: new Map([[a.id, 0], [b.id, 0]]) };
    this.active.add(duel);
    for (const id of [a.id, b.id]) this.challenges.delete(id);
    for (const [p, other] of [[a, b], [b, a]]) {
      p.line = newLine();
      p.duel = duel;
      p.gear = { ...DUEL.loadout };
      p.stats = computeStats(DUEL.loadout);
      this.game.emitTo(p, { kind: 'duelStart', opponent: other.name, opponentId: other.id, countdown: DUEL.countdown, duration: DUEL.duration, loadout: DUEL.loadout });
      this.game.profileChanged(p); // clients read their tackle stats from here
    }
    this.game.emitAll({ kind: 'duelAnnounce', a: a.name, b: b.name });
  }

  /** A duelist landed a fish (called by fishing.js instead of rewarding it). */
  recordCatch(player, points) {
    const duel = player.duel;
    if (!duel || duel.phase !== 'live') return;
    duel.scores.set(player.id, duel.scores.get(player.id) + points);
    duel.catches.set(player.id, duel.catches.get(player.id) + 1);
  }

  tick(dt) {
    this.time += dt;
    for (const [id, ch] of this.challenges) if (ch.expires <= this.time) this.challenges.delete(id);
    for (const [key, until] of this.declined) if (until <= this.time) this.declined.delete(key);
    for (const duel of [...this.active]) {
      duel.timer -= dt;
      if (duel.timer > 0) continue;
      if (duel.phase === 'countdown') {
        duel.phase = 'live';
        duel.timer = DUEL.duration;
        for (const p of [duel.a, duel.b]) this.game.emitTo(p, { kind: 'duelGo' });
      } else this.end(duel);
    }
  }

  /** Finish a duel. `forfeited`: the player who gave up or left, if any. */
  end(duel, forfeited = null) {
    if (!this.active.has(duel)) return;
    this.active.delete(duel);
    const { a, b } = duel;
    for (const p of [a, b]) {
      p.duel = null;
      p.gear = null;
      p.stats = computeStats(p.profile.equipped);
      p.line = newLine(); // a fish still on the line when time runs out doesn't count
    }

    const score = (p) => duel.scores.get(p.id);
    let winner = null;
    if (forfeited) winner = forfeited === a ? b : a;
    else if (score(a) !== score(b)) winner = score(a) > score(b) ? a : b;
    const loser = winner && (winner === a ? b : a);

    // The prize needs at least one fish, and the same pair can't farm it.
    let prize = 0;
    let noPrize = null;
    if (winner) {
      const key = [a.profile.id, b.profile.id].sort().join('|');
      const last = this.prizeLog.get(key);
      if (duel.catches.get(winner.id) === 0) noPrize = 'No prize: the winner has to land at least one fish.';
      else if (last != null && this.time - last < DUEL.rematchCooldown) {
        noPrize = `No prize: you two already played for one in the last ${Math.round(DUEL.rematchCooldown / 60)} minutes.`;
      } else {
        prize = DUEL.prize;
        this.prizeLog.set(key, this.time);
        winner.profile.coins += prize;
        winner.profile.counters.coinsEarned += prize;
      }
      winner.profile.counters.duelsWon += 1;
    }
    for (const p of [a, b]) {
      p.profile.counters.duels += 1;
      const other = p === a ? b : a;
      this.game.emitTo(p, {
        kind: 'duelEnd',
        result: !winner ? 'draw' : p === winner ? 'win' : 'lose',
        forfeit: forfeited ? (forfeited === p ? 'you' : 'them') : null,
        myScore: score(p),
        theirScore: score(other),
        opponent: other.name,
        prize: p === winner ? prize : 0,
        noPrize: p === winner ? noPrize : null,
      });
      this.game.checkAchievements(p);
      this.game.profileChanged(p); // also saves it, even if they just left
    }
    this.game.emitAll({
      kind: 'duelResult', winner: winner?.name ?? null, loser: loser?.name ?? null,
      a: a.name, b: b.name, scoreA: score(a), scoreB: score(b), forfeit: !!forfeited, prize,
    });
  }

  /** A player left the lake: cancel their challenges and forfeit their duel. */
  playerLeft(player) {
    this.challenges.delete(player.id);
    if (player.duel) this.end(player.duel, player);
  }

  /** Per-player snapshot fields while in a duel. */
  snapshotFor(p) {
    const duel = p.duel;
    const other = duel.a === p ? duel.b : duel.a;
    return { du: other.id, ds: duel.scores.get(p.id), dt: Math.ceil(duel.timer), dp: duel.phase === 'live' ? 1 : 0 };
  }
}
