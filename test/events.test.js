// Map events and sprinting.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Hub } from '../server/hub.js';
import { Game } from '../server/game.js';
import { FishingState, MSG, PLAYER_SPEED, SPRINT } from '../shared/constants.js';
import { LOCATIONS, isWater, zoneAt } from '../shared/world.js';
import {
  EVENT_IDS, EVENT_SLOT, EVENT_TUNING, EVENT_TYPES, eventForSlot, eventPlaces, eventsAround, haulGoal, inEvent, shoalBite, tideMeter,
} from '../shared/events.js';

const world = LOCATIONS.mirrorLake;

function seeded(seed = 1) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const BASE_SLOT = Math.floor(1_800_000_000 / EVENT_SLOT);

/** A hub whose clock sits a few seconds into the next event of `type`. */
function hubAt(type) {
  let slot = BASE_SLOT;
  while (eventForSlot(world, slot).type !== type) slot++;
  const ev = eventForSlot(world, slot);
  const clock = { ms: (ev.start + 5) * 1000 };
  const hub = new Hub({ rng: seeded(3), now: () => clock.ms });
  const join = (name) => {
    const inbox = [];
    const p = hub.addPlayer(name, (m) => inbox.push(typeof m === 'string' ? JSON.parse(m) : m));
    return { p, inbox };
  };
  const step = (seconds, dt = 0.05) => {
    for (let t = 0; t < seconds; t += dt) {
      clock.ms += dt * 1000;
      hub.tick(dt);
    }
  };
  return { hub, ev, clock, join, step, events: hub.lake.worldEvents };
}

/** Land a fish for `player` with their bobber at (x, y). */
function catchAt(game, player, x, y, species = 'bluegill', kg = 0.4) {
  player.line = {
    state: FishingState.REELING, x, y, zoneId: zoneAt(world, x, y)?.id ?? 'open', fish: { species, kg },
    progress: 0.999, tension: 0, reeling: true, pulling: false, pullTimer: 99, fight: 0.2, reelSpeed: 1, lineStrength: 1, drag: 1,
  };
  game.tick(0.05);
}

test('schedule: one event every 10 minutes, the same for everyone, the three types taking turns', () => {
  const places = eventPlaces(world);
  assert.ok(places.length >= 15, `${places.length} places`);
  for (const p of places) assert.ok(isWater(world, p.x, p.y), `${p.name} is water`);
  const seen = new Set();
  let last = null;
  for (let s = BASE_SLOT; s < BASE_SLOT + 60; s++) {
    const ev = eventForSlot(world, s);
    assert.deepEqual(eventForSlot(world, s), ev, 'deterministic');
    assert.notEqual(ev.type, last);
    last = ev.type;
    seen.add(ev.type);
    assert.ok(ev.end - ev.start === EVENT_TYPES[ev.type].duration && ev.end <= (s + 1) * EVENT_SLOT, 'fits its slot');
  }
  assert.deepEqual([...seen].sort(), [...EVENT_IDS].sort(), 'all three types come up');
  const t = BASE_SLOT * EVENT_SLOT + 10;
  const { current, upcoming } = eventsAround(world, t, 5);
  assert.equal(current, null, 'nothing in the first minute of a slot');
  assert.equal(upcoming.length, 5);
  assert.ok(upcoming.every((e, i) => e.start > t && (!i || e.start > upcoming[i - 1].start)));
  assert.ok(eventsAround(world, upcoming[0].start + 1).current, 'it starts on time');
});

test('Feeding Shoal: bites faster with more anglers in it, and a bigger bonus for a bigger group', () => {
  const { hub, ev, join, step, events } = hubAt('shoal');
  const a = join('Alice');
  const b = join('Bob');
  step(0.1);
  assert.ok(events.active?.type === 'shoal', 'the shoal arrives');
  assert.ok(hub.lake.events.some((m) => m.kind === 'mapEvent' && m.phase === 'start'), 'everyone is told');
  const { x, y } = ev.place;
  // Alone in the shoal, then with company.
  a.p.line = { state: FishingState.WAITING, x, y, timer: 99, zoneId: 'x' };
  const alone = hub.lake.eventMods(a.p, x, y).bite;
  b.p.line = { state: FishingState.WAITING, x: x + 20, y, timer: 99, zoneId: 'x' };
  const together = hub.lake.eventMods(a.p, x, y).bite;
  assert.equal(alone, shoalBite(1));
  assert.equal(together, shoalBite(2));
  assert.ok(together > alone);
  assert.equal(hub.lake.eventMods(a.p, x + 2000, y), null, 'only inside the shoal');

  const coins = [a.p.profile.coins, b.p.profile.coins];
  for (let i = 0; i < 4; i++) catchAt(hub.lake, a.p, x, y);
  catchAt(hub.lake, b.p, x, y);
  const fishCoins = [a.p.profile.coins - coins[0], b.p.profile.coins - coins[1]];
  step(EVENT_TYPES.shoal.duration);
  const reward = a.inbox.find((m) => m.kind === 'mapEventReward');
  const t = EVENT_TUNING.shoal;
  assert.equal(reward.group, 2);
  assert.equal(reward.coins, 4 * t.coinsPerFish * 2, 'per fish, times the group size');
  assert.equal(a.p.profile.coins - coins[0] - fishCoins[0], reward.coins);
  assert.equal(a.p.profile.counters.mapEvents, 1);
  assert.equal(events.active, null);
});

test('The Great Haul: a shared goal; hitting it pays everyone who helped, early', () => {
  const { hub, ev, join, step, events } = hubAt('haul');
  const a = join('Alice');
  const b = join('Bob');
  step(0.1);
  const goal = events.active.goal;
  assert.equal(goal, haulGoal(2));
  const { x, y } = ev.place;
  for (let i = 0; i < goal - 3; i++) catchAt(hub.lake, a.p, x, y);
  assert.equal(events.active.progress, goal - 3);
  assert.equal(hub.lake.snapshot().we.pg, goal - 3, 'everyone sees the progress');
  catchAt(hub.lake, a.p, x + 5000, y + 5000 > world.height ? y : y); // far away: doesn't count
  for (let i = 0; i < 3; i++) catchAt(hub.lake, b.p, x, y);
  assert.equal(events.active, null, 'done as soon as the goal is hit');
  const ra = a.inbox.find((m) => m.kind === 'mapEventReward');
  const rb = b.inbox.find((m) => m.kind === 'mapEventReward');
  const t = EVENT_TUNING.haul;
  assert.ok(ra.success && rb.success);
  assert.equal(ra.coins, t.coins + Math.min(goal - 3, t.maxFish) * t.coinsPerFish);
  assert.equal(rb.coins, t.coins + 3 * t.coinsPerFish);
  assert.equal(ra.xp, t.xp);
  step(1);
  assert.equal(events.active, null, 'and it does not restart in the same slot');
});

test('The Great Haul: running out of time still pays a little for each fish', () => {
  const { hub, ev, join, step } = hubAt('haul');
  const a = join('Alice');
  step(0.1);
  catchAt(hub.lake, a.p, ev.place.x, ev.place.y);
  step(EVENT_TYPES.haul.duration);
  const r = a.inbox.find((m) => m.kind === 'mapEventReward');
  assert.equal(r.success, false);
  assert.equal(r.coins, EVENT_TUNING.haul.failCoinsPerFish);
});

test('Golden Tide: catches fill a shared meter; a full meter starts a Golden Rush of double points', () => {
  const { hub, ev, join, step, events } = hubAt('tide');
  const a = join('Alice');
  const b = join('Bob');
  step(0.1);
  assert.equal(events.active.goal, tideMeter(2));
  const { x, y } = ev.place;
  catchAt(hub.lake, a.p, x, y, 'carp', 9);
  const normal = hub.lake.events.filter((m) => m.kind === 'catch').at(-1).points;
  while (!events.active.rush) catchAt(hub.lake, b.p, x, y, 'carp', 9);
  assert.ok(hub.lake.events.some((m) => m.kind === 'mapEvent' && m.phase === 'rush'), 'everyone hears about it');
  catchAt(hub.lake, a.p, x, y, 'carp', 9);
  const rushed = hub.lake.events.filter((m) => m.kind === 'catch').at(-1).points;
  assert.equal(rushed, normal * EVENT_TUNING.tide.points, 'double points in the rush');
  step(EVENT_TUNING.tide.rush + 0.5);
  assert.equal(events.active.rush, 0);
  step(EVENT_TYPES.tide.duration);
  const r = a.inbox.find((m) => m.kind === 'mapEventReward');
  assert.equal(r.coins, EVENT_TUNING.tide.coins + EVENT_TUNING.tide.coinsPerRush);
});

test('event rewards stay modest next to normal fishing', () => {
  // Generous cases: a group of 4 landing 40 fish each in a shoal, and a 40-fish Great Haul.
  const s = EVENT_TUNING.shoal;
  const h = EVENT_TUNING.haul;
  assert.ok(s.maxFish * s.coinsPerFish * s.maxGroup <= 1000);
  assert.ok(h.coins + h.maxFish * h.coinsPerFish <= 1000);
  assert.ok(inEvent({ place: { x: 0, y: 0 }, radius: 10 }, 5, 5));
});

test('sprinting: faster while stamina lasts, then winded until it recovers', () => {
  const game = new Game({ world, rng: seeded(1) });
  const p = game.addPlayer('Runner', () => {});
  Object.assign(p, { x: 1000, y: 2150 });
  game.handleMessage(p, { t: MSG.INPUT, right: true, sprint: true });
  game.tick(0.1);
  assert.ok(Math.abs(p.x - 1000 - PLAYER_SPEED * SPRINT.speed * 0.1) < 0.01, 'sprint speed');
  assert.ok(p.stamina < 1);
  assert.equal(game.snapshot().players[0].sr, 1);
  for (let t = 0; t < 1 / SPRINT.drain + 0.5; t += 0.1) game.tick(0.1);
  assert.equal(p.stamina, 0, 'out of breath');
  const x = p.x;
  game.tick(0.1);
  assert.ok(Math.abs(p.x - x - PLAYER_SPEED * 0.1) < 0.01 || p.x === x, 'back to walking pace');
  game.handleMessage(p, { t: MSG.INPUT });
  for (let t = 0; t < SPRINT.delay + 1 / SPRINT.regen + 0.5; t += 0.1) game.tick(0.1);
  assert.equal(p.stamina, 1, 'stamina refills');
});
