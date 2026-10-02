// Duels and boat voyages.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../server/game.js';
import { Hub } from '../server/hub.js';
import { FishingState, MSG } from '../shared/constants.js';
import { LOCATIONS, isWalkable, isWater } from '../shared/world.js';
import { computeStats } from '../shared/gear.js';
import { DUEL } from '../shared/duel.js';
import { BOAT, SEA_LOCATIONS, VOYAGE, boatState, boatSlot, deckSlot, makeSeaWorld, seaZone } from '../shared/voyage.js';

const world = LOCATIONS.mirrorLake;

function seeded(seed = 1) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/** Put a fish on the line that lands on the next tick. */
function almostLanded(player, species = 'bluegill', kg = 0.4) {
  player.line = {
    state: FishingState.REELING, x: 1500, y: 1450, zoneId: player.room.world.zones[0].id, fish: { species, kg },
    progress: 0.999, tension: 0, reeling: true, pulling: false, pullTimer: 99, fight: 0.2, reelSpeed: 1, lineStrength: 1, drag: 1,
  };
}

function duelGame() {
  const game = new Game({ world, rng: seeded(7) });
  const inbox = { a: [], b: [] };
  const a = game.addPlayer('Alice', (m) => inbox.a.push(m));
  const b = game.addPlayer('Bob', (m) => inbox.b.push(m));
  Object.assign(a, { x: 1600, y: 1800 });
  Object.assign(b, { x: 1600, y: 1880 });
  return { game, a, b, inbox };
}

function run(game, seconds, dt = 0.05) {
  for (let t = 0; t < seconds; t += dt) game.tick(dt);
}

function startDuel(game, a, b) {
  game.handleMessage(a, { t: MSG.DUEL, op: 'challenge', target: b.id });
  game.handleMessage(b, { t: MSG.DUEL, op: 'accept', from: a.id });
  run(game, DUEL.countdown + 0.1);
}

const events = (box, kind) => box.filter((m) => m.t === MSG.EVENT && m.kind === kind);

// ---- duels ------------------------------------------------------------------------------

test('duel: challenge, accept, matched tackle, then your own tackle comes back', () => {
  const { game, a, b, inbox } = duelGame();
  a.profile.inventory.push('braid');
  a.profile.equipped.line = 'braid';
  a.stats = computeStats(a.profile.equipped);
  const before = { ...a.profile.equipped };

  game.handleMessage(a, { t: MSG.DUEL, op: 'challenge', target: b.id });
  const invite = events(inbox.b, 'duelInvite')[0];
  assert.equal(invite.from, a.id);
  game.handleMessage(b, { t: MSG.DUEL, op: 'accept', from: a.id });
  assert.ok(a.duel && b.duel && a.duel === b.duel);

  // Both fish with the same tackle; the snapshot shows it on their anglers.
  const duelStats = computeStats(DUEL.loadout);
  assert.deepEqual(a.stats, duelStats);
  assert.deepEqual(b.stats, duelStats);
  const snap = game.snapshot().players.find((p) => p.id === a.id);
  assert.deepEqual(snap.g, [DUEL.loadout.rod, DUEL.loadout.reel, DUEL.loadout.line, DUEL.loadout.bait]);
  assert.equal(snap.du, b.id);
  assert.deepEqual(a.profile.equipped, before, 'their own loadout is never touched');

  // No casting during the countdown, and no tackle changes during the duel.
  game.handleMessage(a, { t: MSG.CAST, angle: -Math.PI / 2, power: 0.5 });
  assert.equal(a.line.state, FishingState.IDLE);
  game.handleMessage(a, { t: MSG.EQUIP, item: 'mono' });
  assert.equal(a.profile.equipped.line, 'braid');

  run(game, DUEL.countdown + DUEL.duration + 1);
  assert.equal(a.duel, null);
  assert.equal(a.gear, null);
  assert.deepEqual(a.stats, computeStats(before), 'own tackle is back');
  assert.equal(events(inbox.a, 'duelEnd')[0].result, 'draw');
});

test('duel: catches give no rewards; the winner gets the prize', () => {
  const { game, a, b, inbox } = duelGame();
  startDuel(game, a, b);
  const coins = a.profile.coins;
  almostLanded(a, 'bluegill', 0.5);
  game.tick(0.05);
  assert.equal(a.line.state, FishingState.IDLE);
  assert.equal(a.profile.coins, coins, 'no coins for duel fish');
  assert.equal(a.profile.score, 0);
  assert.equal(a.profile.catches, 0);
  assert.deepEqual(a.profile.index, {}, 'duel fish stay out of the Fish Index');
  assert.ok(game.snapshot().players.find((p) => p.id === a.id).ds > 0, 'but they count in the duel');
  assert.ok(game.drainEvents().some((e) => e.kind === 'catch' && e.duel));

  run(game, DUEL.duration + 1);
  const end = events(inbox.a, 'duelEnd')[0];
  assert.equal(end.result, 'win');
  assert.equal(end.prize, DUEL.prize);
  assert.equal(a.profile.coins, coins + DUEL.prize);
  assert.equal(a.profile.counters.duelsWon, 1);
  assert.equal(b.profile.counters.duels, 1);
  assert.equal(events(inbox.b, 'duelEnd')[0].result, 'lose');
});

test('duel: rematches within the cooldown pay no prize', () => {
  const { game, a, b, inbox } = duelGame();
  for (let i = 0; i < 2; i++) {
    startDuel(game, a, b);
    almostLanded(a);
    game.tick(0.05);
    run(game, DUEL.duration + 1);
  }
  const ends = events(inbox.a, 'duelEnd');
  assert.equal(ends[0].prize, DUEL.prize);
  assert.equal(ends[1].result, 'win');
  assert.equal(ends[1].prize, 0);
  assert.match(ends[1].noPrize, /already/);
});

test('duel: range, declining, expiry, forfeits and leaving', () => {
  const { game, a, b, inbox } = duelGame();
  b.x = a.x + DUEL.range + 50;
  game.handleMessage(a, { t: MSG.DUEL, op: 'challenge', target: b.id });
  assert.equal(events(inbox.b, 'duelInvite').length, 0, 'too far away');
  b.x = a.x + 20;

  game.handleMessage(a, { t: MSG.DUEL, op: 'challenge', target: b.id });
  game.handleMessage(b, { t: MSG.DUEL, op: 'decline', from: a.id });
  assert.equal(a.duel, null);
  assert.match(events(inbox.a, 'duelInfo').at(-1).message, /declined/);
  game.handleMessage(a, { t: MSG.DUEL, op: 'challenge', target: b.id });
  assert.equal(events(inbox.b, 'duelInvite').length, 1, 'no invite spam right after a no');
  run(game, DUEL.declineCooldown + 1);

  game.handleMessage(a, { t: MSG.DUEL, op: 'challenge', target: b.id });
  run(game, DUEL.challengeTime + 1);
  game.handleMessage(b, { t: MSG.DUEL, op: 'accept', from: a.id });
  assert.equal(b.duel, null, 'expired challenges cannot be accepted');

  // Forfeiting hands the win to the other angler (the prize still needs a fish).
  startDuel(game, a, b);
  almostLanded(b);
  game.tick(0.05);
  game.handleMessage(a, { t: MSG.DUEL, op: 'forfeit' });
  const end = events(inbox.b, 'duelEnd').at(-1);
  assert.equal(end.result, 'win');
  assert.equal(end.forfeit, 'them');
  assert.equal(end.prize, DUEL.prize);

  // Leaving mid-duel forfeits too.
  const c = game.addPlayer('Cat', () => {});
  Object.assign(c, { x: a.x, y: a.y + 30 });
  startDuel(game, a, c);
  game.removePlayer(c.id);
  assert.equal(a.duel, null);
  assert.equal(events(inbox.a, 'duelEnd').at(-1).result, 'win');
});

// ---- the boat ------------------------------------------------------------------------------

test('boat schedule: docks on the quarter hour; its route stays on the water', () => {
  const quarter = 1_800_000_000 - (1_800_000_000 % 900); // seconds, on a quarter hour
  assert.equal(boatState(quarter + 5).phase, 'docked');
  assert.equal(boatState(quarter + BOAT.board + 5).phase, 'departing');
  assert.equal(boatState(quarter + 400).phase, 'away');
  assert.equal(boatState(quarter - 10).phase, 'arriving');
  assert.equal(Math.round(boatState(quarter - 10).nextDock), 10);
  const docked = boatState(quarter + 5);
  assert.deepEqual([docked.x, docked.y], [BOAT.dock.x, BOAT.dock.y]);

  // Every point of the trip is open water, or under the river bridge.
  const bridge = world.structures.find((s) => s.type === 'bridge');
  const underBridge = (x, y) => x >= bridge.x && x < bridge.x + bridge.w && y >= bridge.y && y < bridge.y + bridge.h;
  for (let t = 0; t < BOAT.arrive; t += 0.5) {
    const s = boatState(quarter - BOAT.arrive + t);
    if (s.x >= world.width) continue; // still upriver, off the map
    assert.ok(isWater(world, s.x, s.y) || underBridge(s.x, s.y), `boat on land at ${s.x},${s.y}`);
  }
  // Passengers stand on deck, which is over water next to the dock.
  for (let i = 0; i < 16; i++) {
    const p = boatSlot(docked, i);
    assert.ok(isWater(world, p.x, p.y), `slot ${i}`);
  }
  assert.ok(isWalkable(world, BOAT.landing.x, BOAT.landing.y), 'passengers step off onto the dock');
});

const FAST = {
  ...VOYAGE, outbound: 1, fishing: 12, sailing: 1, results: 1, eventEarliest: 2, eventLength: 4,
};

function makeHub() {
  const quarter = 1_800_000_000 - (1_800_000_000 % 900);
  const clock = { ms: (quarter + 10) * 1000 }; // the boat is docked
  const hub = new Hub({ rng: seeded(3), now: () => clock.ms, voyageTiming: FAST });
  const join = (name) => {
    const inbox = [];
    const p = hub.addPlayer(name, (m) => inbox.push(typeof m === 'string' ? JSON.parse(m) : m));
    Object.assign(p, { x: BOAT.landing.x, y: BOAT.landing.y });
    return { p, inbox };
  };
  const step = (seconds, dt = 0.05) => {
    for (let t = 0; t < seconds; t += dt) {
      clock.ms += dt * 1000;
      hub.tick(dt);
    }
  };
  const stepUntil = (done, limit = 1000) => {
    for (let t = 0; t < limit && !done(); t += 0.05) step(0.05);
    assert.ok(done(), 'timed out');
  };
  return { hub, clock, join, step, stepUntil, quarter };
}

test('boarding: only near the docked boat; passengers wait on deck', () => {
  const { hub, join, step } = makeHub();
  const { p: a } = join('Alice');
  const { p: far } = join('Faraway');
  Object.assign(far, { x: 400, y: 2100 });
  step(0.1);
  hub.handleMessage(far, { t: MSG.BOARD });
  assert.equal(far.aboard, false, 'too far from the boat');

  hub.handleMessage(a, { t: MSG.BOARD });
  assert.equal(a.aboard, true);
  step(0.1);
  assert.equal(hub.lake.snapshot().boat.n, 1);
  assert.equal(hub.lake.snapshot().players.find((q) => q.id === a.id).ab, 1);
  hub.handleMessage(a, { t: MSG.CAST, angle: 0, power: 0.5 });
  assert.equal(a.line.state, FishingState.IDLE, 'no fishing while waiting aboard');
  a.input = { up: true, down: false, left: false, right: false };
  const y = a.y;
  step(0.5);
  assert.equal(a.y, y, 'passengers stand still');

  // Step off again while docked.
  hub.handleMessage(a, { t: MSG.BOARD });
  assert.equal(a.aboard, false);
  assert.ok(isWalkable(world, a.x, a.y));
});

test('voyage: sails 4 random stops with events, then pays out and comes home', () => {
  const { hub, join, step, stepUntil } = makeHub();
  const { p: a, inbox } = join('Alice');
  const { p: b } = join('Bob');
  hub.handleMessage(a, { t: MSG.BOARD });
  hub.handleMessage(b, { t: MSG.BOARD });
  const coins = a.profile.coins;

  // Boarding closes, the boat sails off with them, then the voyage begins.
  stepUntil(() => hub.boat.state.phase === 'departing');
  step(10);
  const boat = hub.boat.state;
  assert.ok(Math.hypot(boat.x - BOAT.dock.x, boat.y - BOAT.dock.y) > 20, 'the boat is moving');
  assert.ok(Math.hypot(a.x - boat.x, a.y - boat.y) < BOAT.length / 2, 'riding on the boat');
  stepUntil(() => hub.voyages.size === 1);
  const voyage = [...hub.voyages][0];
  assert.equal(a.room, voyage.game);
  assert.ok(!hub.lake.players.has(a.id));
  const room = inbox.filter((m) => m.t === MSG.ROOM).at(-1);
  assert.equal(room.room, 'voyage');
  assert.equal(room.stops.length, 4);
  assert.equal(new Set(room.stops.map((s) => s.loc)).size, 4, 'four different locations');
  assert.equal(room.missions.length, 3);
  assert.ok(isWalkable(voyage.game.world, a.x, a.y), 'standing on deck');

  // Can't fish until the first stop.
  hub.handleMessage(a, { t: MSG.CAST, angle: -Math.PI / 2, power: 0.6 });
  assert.equal(a.line.state, FishingState.IDLE);
  step(FAST.outbound + 0.1);
  assert.equal(voyage.phase, 'fishing');
  assert.equal(voyage.game.world.zones[0].id, voyage.stops[0].loc);
  hub.handleMessage(a, { t: MSG.CAST, angle: -Math.PI / 2, power: 0.6 });
  assert.equal(a.line.state, FishingState.CASTING, 'casting over the rail');

  // The stop's special event kicks in, changing how fishing works.
  stepUntil(() => voyage.event, FAST.fishing);
  assert.equal(voyage.stopIndex, 0, 'during the first stop');
  assert.equal(voyage.game.mods.event, SEA_LOCATIONS[voyage.stops[0].loc].event);
  almostLanded(a, 'mackerel', 1);
  step(0.05);
  assert.equal(a.profile.counters.seaCatches, 1);
  assert.equal(a.profile.counters.eventCatches, 1);
  assert.ok(a.profile.coins > coins, 'sea fish pay out like normal');
  assert.ok(voyage.scores.get(a.id).points > 0);

  // Through every stop to the results, then home.
  step((FAST.fishing + FAST.sailing) * 4);
  const results = inbox.find((m) => m.kind === 'voyageResults');
  assert.ok(results, 'results arrive');
  assert.equal(results.rank, 1);
  assert.ok(results.bonus >= FAST.rankBonus[0]);
  assert.equal(a.profile.counters.voyages, 1);
  step(FAST.results + 0.5);
  assert.equal(hub.voyages.size, 0);
  assert.equal(a.room, hub.lake);
  assert.equal(inbox.filter((m) => m.t === MSG.ROOM).at(-1).room, 'lake');
  assert.ok(isWalkable(world, a.x, a.y), 'back on the dock');
});

test('voyage: the Leviathan only bites during its event; an empty boat stops', () => {
  assert.ok(!seaZone('abyssalTrench').fish.leviathan);
  assert.ok(seaZone('abyssalTrench', true).fish.leviathan > 0);
  assert.ok(seaZone('kelpForest').fish.kelpbeard > 0, 'other legendaries are just rare outside events');

  const sea = makeSeaWorld();
  for (let i = 0; i < 24; i++) assert.ok(isWalkable(sea, deckSlot(i).x, deckSlot(i).y), `deck slot ${i}`);

  const { hub, join, step, stepUntil } = makeHub();
  const { p: a } = join('Alice');
  hub.handleMessage(a, { t: MSG.BOARD });
  stepUntil(() => hub.voyages.size === 1);
  hub.removePlayer(a);
  step(0.1);
  assert.equal(hub.voyages.size, 0, 'nobody left aboard');
});
