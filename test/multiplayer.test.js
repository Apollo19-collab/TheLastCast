// Duels and boat voyages.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../server/game.js';
import { Hub } from '../server/hub.js';
import { FishingState, MSG } from '../shared/constants.js';
import { LOCATIONS, isWalkable, isWater } from '../shared/world.js';
import { pickSpecies, rollKg } from '../server/fishing.js';
import { fishDifficulty, scoreCatch } from '../shared/fish.js';
import { computeStats } from '../shared/gear.js';
import { DUEL } from '../shared/duel.js';
import {
  BOAT, BOSS, BOSSES, BOSS_ATTACKS, DECK_AREAS, SEA_LOCATIONS, VOYAGE, boatState, boatSlot, bossHp, bossPool, bossZone, deckSlot, inDeckArea,
  makeSeaWorld, seaZone, splitPool,
} from '../shared/voyage.js';

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
  const bridges = world.structures.filter((s) => s.type === 'bridge');
  const underBridge = (x, y) => bridges.some((b) => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h);
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
  ...VOYAGE, outbound: 1, fishing: 12, sailing: 1, results: 1, eventEarliest: 2, eventLength: 4, bossIntro: 1, boss: 30,
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

test('voyage: sails 3 random stops with events, then pays out and comes home', () => {
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
  assert.equal(room.stops.length, 3);
  assert.equal(new Set(room.stops.map((s) => s.loc)).size, 3, 'three different locations');
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

  // Through every stop and the boss (nobody fights it, so it escapes) to the results, then home.
  stepUntil(() => inbox.some((m) => m.kind === 'voyageResults'), 500);
  const results = inbox.find((m) => m.kind === 'voyageResults');
  assert.equal(results.boss.result, 'lost');
  assert.ok(results, 'results arrive');
  assert.equal(results.rank, 1);
  assert.ok(results.bonus >= FAST.rankBonus[0]);
  assert.equal(a.profile.counters.voyages, 1);
  stepUntil(() => hub.voyages.size === 0, 10);
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

// ---- the boss at the end of a voyage ----------------------------------------------------

/** Sail a fresh voyage with these crew names right up to the boss fight. */
function toBoss(names = ['Alice']) {
  const h = makeHub();
  const crew = names.map((n) => h.join(n));
  for (const c of crew) h.hub.handleMessage(c.p, { t: MSG.BOARD });
  h.stepUntil(() => h.hub.voyages.size === 1);
  const voyage = [...h.hub.voyages][0];
  h.stepUntil(() => voyage.phase === 'boss', 500);
  return { ...h, crew, voyage };
}

test('voyage timing: the whole trip, boss included, is back before the next boat', () => {
  const t = VOYAGE;
  const total = t.outbound + t.stops * t.fishing + (t.stops - 1) * t.sailing + t.bossIntro + t.boss + t.results;
  // It sets sail when the boat finishes leaving and must be home before the next one docks.
  assert.ok(BOAT.board + BOAT.depart + total <= BOAT.interval, `voyage takes ${total}s`);
});

test('boss: crew damage it by fishing; the weak spot hits twice as hard; defeat pays out', () => {
  const { voyage, crew, step } = toBoss(['Alice', 'Bob']);
  const [a, b] = crew;
  assert.equal(voyage.boss.max, bossHp(voyage.boss.id, 2), 'health scales with the crew');
  assert.equal(voyage.game.world.zones[0].id, 'boss');
  const weak = voyage.game.hotspots[0];
  assert.ok(weak.boss, 'the weak spot is out');

  const hit = (player, inWeakSpot) => {
    player.p.line = {
      state: FishingState.REELING, x: inWeakSpot ? weak.x : 100, y: inWeakSpot ? weak.y : 100, zoneId: 'boss', hotspot: inWeakSpot,
      fish: { species: 'cod', kg: 5 }, progress: 0.999, tension: 0, reeling: true, pulling: false, pullTimer: 99, fight: 0.2, reelSpeed: 1, lineStrength: 1, drag: 1,
    };
    const before = voyage.boss.hp;
    step(0.05);
    return before - voyage.boss.hp;
  };
  const normal = hit(a, false);
  const doubled = hit(b, true);
  assert.ok(normal > 0);
  assert.ok(doubled > normal * 1.9, 'weak spot doubles the damage (on top of the hotspot bonus)');

  const coins = a.p.profile.coins;
  voyage.boss.hp = 1;
  hit(a, false);
  assert.equal(voyage.boss.result, 'won');
  const results = a.inbox.find((m) => m.kind === 'voyageResults');
  assert.equal(results.boss.result, 'won');
  assert.ok(results.breakdown.boss >= BOSS.win.coins);
  assert.ok(a.p.profile.coins - coins >= BOSS.win.coins);
  assert.equal(a.p.profile.counters.bossKills, 1);
  assert.ok(['Alice', 'Bob'].includes(results.boss.mvp), 'the top damage dealer is MVP');
});

test('boss: telegraphed attacks; Thrash spikes tension, Ink slows bites', () => {
  const { voyage, crew, step } = toBoss(['Alice']);
  const [a] = crew;
  voyage.boss.nextAttack = 0;
  // Force a Thrash with a fish on the line.
  voyage.boss.attack = null;
  voyage.rng = () => 0; // first attack in the list
  const first = BOSSES[voyage.boss.id].attacks[0];
  a.p.line = {
    state: FishingState.REELING, x: 100, y: 100, zoneId: 'boss', fish: { species: 'cod', kg: 5 },
    progress: 0.5, tension: 0.1, reeling: false, pulling: false, pullTimer: 99, fight: 0.5, reelSpeed: 1, lineStrength: 1, drag: 0,
  };
  step(0.05);
  assert.equal(voyage.boss.attack.id, first);
  assert.ok(voyage.game.events.some((e) => e.kind === 'bossWarn'), 'players get a warning first');
  step(BOSS.warning + 0.1);
  assert.ok(voyage.game.events.some((e) => e.kind === 'bossAttack'));
  const atk = BOSS_ATTACKS[first];
  if (atk.tension) assert.ok(a.p.line.state !== FishingState.REELING || a.p.line.tension > 0.1 + atk.tension * 0.8);
  if (atk.mods) assert.deepEqual(voyage.game.mods, atk.mods);
});

test('boss: escapes if the crew runs out of time', () => {
  const { voyage, crew, stepUntil } = toBoss(['Alice']);
  stepUntil(() => voyage.phase !== 'boss', 100);
  assert.equal(voyage.boss.result, 'lost');
  assert.equal(crew[0].p.profile.counters.bossKills, 0);
  assert.ok(crew[0].inbox.find((m) => m.kind === 'voyageResults').breakdown.boss === BOSS.lose.coins);
});


test('boss: the fight escalates through three phases as its health drops', () => {
  const { voyage, step } = toBoss(['Alice']);
  assert.equal(voyage.boss.phase, 0);
  voyage.boss.hp = voyage.boss.max * 0.5;
  step(0.05);
  assert.equal(voyage.boss.phase, 1);
  assert.ok(voyage.game.events.some((e) => e.kind === 'bossPhase' && e.name === 'Enraged'));
  voyage.boss.hp = voyage.boss.max * 0.2;
  step(0.05);
  assert.equal(voyage.boss.phase, 2);
  assert.ok(voyage.boss.nextAttack <= BOSS.phases[2].attackEvery[1] || voyage.boss.attack, 'attacks come faster');
  assert.ok(voyage.boss.weakTimer <= BOSS.phases[2].weakSpotMove, 'the weak spot moves faster');
});

test('boss: harpoon a breach by landing your bobber in the ring, once per breach', () => {
  const { voyage, crew, step } = toBoss(['Alice', 'Bob']);
  const [a, b] = crew;
  voyage.boss.nextBreach = 0;
  voyage.boss.nextAttack = 999;
  voyage.boss.nextGrab = 999;
  step(0.05);
  const breach = voyage.boss.breach;
  assert.ok(breach, 'the boss breaches');
  assert.ok(voyage.game.snapshot().vy.bs.bk, 'clients see the breach');
  const castAt = (player, x, y) => {
    player.line = { state: FishingState.CASTING, x, y, timer: 0.01, zoneId: 'boss' };
    step(0.05);
  };
  const hp = voyage.boss.hp;
  castAt(a.p, breach.x + 10, breach.y - 10);
  assert.equal(hp - voyage.boss.hp, BOSS.breach.damage, 'harpooned');
  assert.equal(voyage.scores.get(a.p.id).harpoons, 1);
  castAt(a.p, breach.x, breach.y);
  assert.equal(hp - voyage.boss.hp, BOSS.breach.damage, 'only once per breach');
  castAt(b.p, breach.x + breach.r + 40, breach.y);
  assert.equal(voyage.scores.get(b.p.id).harpoons, 0, 'outside the ring is a miss');
  step(BOSS.breach.window);
  assert.equal(voyage.boss.breach, null, 'it dives again');
});

test('boss: beat off a grab by mashing E beside it; if it holds on, the boss heals', () => {
  const { voyage, crew, step } = toBoss(['Alice']);
  const [a] = crew;
  voyage.boss.nextGrab = 0;
  voyage.boss.nextBreach = 999;
  voyage.boss.nextAttack = 999;
  step(0.05);
  assert.equal(voyage.boss.grabs.length, 1);
  const g = voyage.boss.grabs[0];
  assert.ok(isWalkable(voyage.game.world, g.x, g.y), 'it grabs somewhere on deck you can reach');
  Object.assign(a.p, { x: g.x > 900 ? g.x - 200 : g.x + 200, y: 600 });
  voyage.game.handleMessage(a.p, { t: MSG.STRIKE });
  assert.equal(g.hp, g.max, 'too far away');
  Object.assign(a.p, { x: g.x, y: g.y < 600 ? 575 : 625 });
  voyage.game.handleMessage(a.p, { t: MSG.STRIKE });
  voyage.game.handleMessage(a.p, { t: MSG.STRIKE });
  assert.equal(g.hp, g.max - 1, 'strikes have a short cooldown');
  const hp = voyage.boss.hp;
  for (let i = 0; i < 200 && voyage.boss.grabs.length; i++) {
    step(BOSS.grab.cooldown);
    voyage.game.handleMessage(a.p, { t: MSG.STRIKE });
  }
  assert.equal(voyage.boss.grabs.length, 0, 'beaten off');
  assert.equal(hp - voyage.boss.hp, BOSS.grab.damage);
  const score = voyage.scores.get(a.p.id);
  assert.equal(score.grabHits, g.max);
  assert.ok(score.contribution >= g.max * BOSS.grabHitValue + BOSS.grab.damage - 1);

  // The next one is left alone and holds on.
  voyage.boss.nextGrab = 0;
  voyage.boss.hp = Math.round(voyage.boss.max * 0.8);
  step(0.05);
  const before = voyage.boss.hp;
  step(BOSS.grab.time + 0.1);
  assert.ok(voyage.game.events.some((e) => e.kind === 'grabFail'));
  assert.equal(voyage.boss.hp - before, Math.round(voyage.boss.max * BOSS.grab.heal), 'the boss heals');
});

test('boss: a Slam dazes anyone standing in the marked area', () => {
  const { voyage, crew, step } = toBoss(['Alice', 'Bob']);
  const [a, b] = crew;
  voyage.boss.nextAttack = 999;
  voyage.boss.nextBreach = 999;
  voyage.boss.nextGrab = 999;
  Object.assign(a.p, { x: 1000, y: 600 });
  Object.assign(b.p, { x: 750, y: 600 });
  assert.ok(inDeckArea('bow', 1000, 600) && !inDeckArea('bow', 750, 600));
  for (const area of Object.keys(DECK_AREAS)) {
    const r = DECK_AREAS[area];
    assert.ok(isWalkable(voyage.game.world, r.x + r.w / 2, r.y + r.h / 2), `${area} is on deck`);
  }
  a.p.line = { state: FishingState.WAITING, x: 1000, y: 800, timer: 99, zoneId: 'boss' };
  voyage.bossAttack({ id: 'slam', area: 'bow' });
  assert.ok(a.p.dazed > 0, 'caught in the slam');
  assert.equal(a.p.line.state, FishingState.IDLE, 'and lost their line');
  assert.equal(b.p.dazed ?? 0, 0, 'out of the way');
  voyage.game.handleMessage(a.p, { t: MSG.CAST, angle: Math.PI / 2, power: 0.6 });
  assert.equal(a.p.line.state, FishingState.IDLE, 'no casting while dazed');
  step(BOSS.slam.stun + 0.1);
  voyage.game.handleMessage(a.p, { t: MSG.CAST, angle: Math.PI / 2, power: 0.6 });
  assert.equal(a.p.line.state, FishingState.CASTING, 'recovered');
});

test('prize pool: split by contribution, with an even share for every helper', () => {
  const shares = splitPool(1000, [600, 300, 100, 0]);
  const sum = shares.reduce((s, x) => s + x, 0);
  assert.ok(sum <= 1000 && sum >= 996, `${sum} paid out`);
  assert.ok(shares[0] > shares[1] && shares[1] > shares[2] && shares[2] > 0);
  assert.equal(shares[3], 0, 'no contribution, no share');
  assert.ok(shares[2] >= Math.floor(1000 * BOSS.pool.even / 3), 'even small helpers get the even share');
  assert.deepEqual(splitPool(500, [0, 0]), [0, 0]);
  // Bigger crews share a bigger pool, though less of it each.
  assert.ok(bossPool('kraken', 4, true) > bossPool('kraken', 1, true));
  assert.ok(bossPool('kraken', 4, true) / 4 < bossPool('kraken', 1, true));
  assert.equal(bossPool('kraken', 2, false), Math.round(bossPool('kraken', 2, true) * BOSS.pool.lose));
});

test('prize pool: paid out at the end, the top contributor is MVP', () => {
  const { voyage, crew } = toBoss(['Alice', 'Bob']);
  const [a, b] = crew;
  voyage.scores.get(a.p.id).contribution = 900;
  voyage.scores.get(b.p.id).contribution = 300;
  voyage.boss.hp = 1;
  voyage.damageBoss(b.p, 1);
  const ra = a.inbox.find((m) => m.kind === 'voyageResults');
  const rb = b.inbox.find((m) => m.kind === 'voyageResults');
  const pool = bossPool(voyage.boss.id, 2, true);
  assert.equal(ra.boss.pool, pool);
  assert.ok(ra.breakdown.pool > rb.breakdown.pool, 'more contribution, bigger share');
  const paid = ra.breakdown.pool + rb.breakdown.pool;
  assert.ok(paid <= pool && paid >= pool - 2);
  assert.equal(ra.boss.mvp, 'Alice');
  assert.equal(ra.breakdown.boss, BOSS.win.coins + BOSS.win.mvpCoins);
  assert.equal(rb.breakdown.boss, BOSS.win.coins);
});

test('boss balance: a coin flip for a new player alone, comfortable with mid tackle, fair for a crew', () => {
  // Expected damage one angler deals in the fight: fishing (half the time in
  // the weak spot) for ~55% of it (the rest goes on grabs, dodging slams and
  // recasting), plus harpooning 70% of the breaches.
  const fishDps = (bossId, equipped) => {
    const rng = seeded(11);
    const zone = bossZone(bossId);
    const st = computeStats(equipped);
    let dmg = 0;
    let time = 0;
    for (let i = 0; i < 3000; i++) {
      const weak = rng() < 0.5;
      const sp = pickSpecies(rng, zone, weak, st);
      const kg = rollKg(rng, sp);
      const d = fishDifficulty(sp, kg);
      time += 8 / (zone.biteRate * st.biteSpeed * (weak ? 1.8 : 1)) + 6.1 + 5 * d;
      if (rng() > Math.max(0, (d - st.lineStrength * 1.1) / 2)) dmg += scoreCatch(sp, kg, weak ? 1.25 : 1) * (weak ? 2 : 1);
    }
    return dmg / time;
  };
  const avg = (r) => (r[0] + r[1]) / 2;
  const breaches = 1 + Math.floor((VOYAGE.boss - BOSS.breach.first) / avg(BOSS.breach.every));
  const solo = (bossId, equipped) => fishDps(bossId, equipped) * VOYAGE.boss * 0.55 + breaches * 0.7 * BOSS.breach.damage;
  // Grabs beaten off hurt it too: about one wave every 32 seconds.
  const grabs = 1 + Math.floor((VOYAGE.boss - BOSS.grab.first) / (avg(BOSS.grab.every) + 6));
  const report = [];
  for (const id of Object.keys(BOSSES)) {
    const starter = (solo(id, {}) + grabs * BOSS.grab.damage) / bossHp(id, 1);
    const mid = (solo(id, { rod: 'carbon', reel: 'baitcaster', line: 'braid', bait: 'spinner' }) + grabs * BOSS.grab.damage) / bossHp(id, 1);
    const crew4 = (4 * solo(id, {}) + grabs * 1.5 * BOSS.grab.damage) / bossHp(id, 4);
    report.push(`${id} ${starter.toFixed(2)} ${mid.toFixed(2)} ${crew4.toFixed(2)}`);
    assert.ok(starter > 0.8 && starter < 1.25, `${id}: starter solo deals ${starter.toFixed(2)}x its health`);
    assert.ok(mid > 1.15 && mid < 2.3, `${id}: mid tackle solo deals ${mid.toFixed(2)}x its health`);
    assert.ok(crew4 > 0.85 && crew4 < 1.4, `${id}: four starters deal ${crew4.toFixed(2)}x`);
  }
  if (process.env.BOSS_REPORT) console.log(report.join('\n'));
  assert.equal(VOYAGE.stops, 3);
  assert.ok(VOYAGE.boss >= 240, 'a long fight');
});
