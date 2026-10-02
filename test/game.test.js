import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, sanitizeName } from '../server/game.js';
import { pickSpecies } from '../server/fishing.js';
import { FishingState, MSG } from '../shared/constants.js';
import { LOCATIONS, isWalkable, isWater, zoneAt } from '../shared/world.js';

const world = LOCATIONS.mirrorLake;

function seeded(seed = 1) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function makeGame() {
  const game = new Game({ world, rng: seeded(42) });
  const inbox = [];
  const player = game.addPlayer('Tester', (m) => inbox.push(m));
  return { game, player, inbox };
}

function run(game, seconds, dt = 0.05) {
  for (let t = 0; t < seconds; t += dt) game.tick(dt);
}

test('world geometry: spawn is walkable, zones resolve', () => {
  assert.ok(isWalkable(world, world.spawn.x, world.spawn.y));
  assert.equal(zoneAt(world, 800, 200).id, 'deep');
  assert.equal(zoneAt(world, 300, 400).id, 'reeds');
  assert.equal(zoneAt(world, 1000, 700).id, 'shallows');
  assert.equal(zoneAt(world, 1000, 500).id, 'open');
  assert.equal(zoneAt(world, 800, 600), null, 'dock is not water');
  assert.ok(!isWater(world, 500, 900), 'beach is not water');
});

test('names are sanitized', () => {
  assert.equal(sanitizeName('  <b>Bob</b>  '), 'bBobb');
  assert.equal(sanitizeName(''), null);
  assert.equal(sanitizeName('x'.repeat(40)).length, 16);
});

test('players cannot walk into the water', () => {
  const { game, player } = makeGame();
  player.x = 500;
  player.y = 805;
  game.handleMessage(player, { t: MSG.INPUT, up: true });
  run(game, 3);
  assert.ok(isWalkable(world, player.x, player.y));
  assert.ok(player.y >= 800);
});

test('cast onto land is rejected; cast into water starts fishing', () => {
  const { game, player, inbox } = makeGame();
  player.x = 500;
  player.y = 900;
  game.handleMessage(player, { t: MSG.CAST, angle: Math.PI / 2, power: 0 }); // straight down onto sand
  assert.equal(player.line.state, FishingState.IDLE);
  assert.equal(inbox.at(-1).kind, 'castFail');

  game.handleMessage(player, { t: MSG.CAST, angle: -Math.PI / 2, power: 0.5 });
  assert.equal(player.line.state, FishingState.CASTING);
  run(game, 1);
  assert.equal(player.line.state, FishingState.WAITING);
  assert.equal(inbox.find((m) => m.kind === 'landed').zone, 'Shallows');
});

test('invalid cast payloads are ignored', () => {
  const { game, player } = makeGame();
  game.handleMessage(player, { t: MSG.CAST, angle: 'nope', power: 1 });
  game.handleMessage(player, { t: MSG.CAST, angle: Infinity, power: 1 });
  assert.equal(player.line.state, FishingState.IDLE);
});

test('players cannot move while their line is out', () => {
  const { game, player } = makeGame();
  game.handleMessage(player, { t: MSG.CAST, angle: -Math.PI / 2, power: 0.5 });
  const { x, y } = player;
  game.handleMessage(player, { t: MSG.INPUT, left: true });
  run(game, 0.5);
  assert.deepEqual([player.x, player.y], [x, y]);
});

test('full loop: bite, hook, reel carefully, catch and score', () => {
  const { game, player } = makeGame();
  player.x = 500;
  player.y = 900;
  game.handleMessage(player, { t: MSG.CAST, angle: -Math.PI / 2, power: 0.5 });

  // Wait for the bite.
  for (let i = 0; i < 2000 && player.line.state !== FishingState.BITE; i++) game.tick(0.05);
  assert.equal(player.line.state, FishingState.BITE);
  game.handleMessage(player, { t: MSG.HOOK });
  assert.equal(player.line.state, FishingState.REELING);

  // A careful angler: reel only while the fish rests and tension is low.
  for (let i = 0; i < 4000 && player.line.state === FishingState.REELING; i++) {
    const l = player.line;
    game.handleMessage(player, { t: MSG.REEL, on: !l.pulling && l.tension < 0.6 });
    game.tick(0.05);
  }
  assert.equal(player.line.state, FishingState.IDLE);
  const events = game.drainEvents();
  const caught = events.find((e) => e.kind === 'catch');
  assert.ok(caught, `expected a catch, got ${JSON.stringify(events.map((e) => e.kind))}`);
  assert.equal(player.catches, 1);
  assert.equal(player.score, caught.points);
  assert.ok(player.score > 0);
});

test('holding reel the whole time snaps the line on a strong fish', () => {
  const { game, player } = makeGame();
  player.line = {
    state: FishingState.REELING, x: 800, y: 200, zoneId: 'deep', hotspot: false,
    fish: { species: 'sturgeon', kg: 30 }, progress: 0.25, tension: 0,
    reeling: true, pulling: true, pullTimer: 3, fight: 0.95,
  };
  run(game, 3);
  assert.equal(player.line.state, FishingState.IDLE);
  assert.ok(game.drainEvents().some((e) => e.kind === 'snap'));
  assert.equal(player.catches, 0);
});

test('missing the bite window loses the fish', () => {
  const { game, player, inbox } = makeGame();
  player.line = { state: FishingState.BITE, x: 800, y: 200, zoneId: 'deep', timer: 0.5, fish: { species: 'carp', kg: 2 } };
  run(game, 1);
  assert.equal(player.line.state, FishingState.IDLE);
  assert.equal(inbox.at(-1).kind, 'missed');
});

test('crowded spots slow bites; hotspots speed them up', () => {
  const waitFor = (setup) => {
    const { game, player } = makeGame();
    game.hotspots = [];
    game.fillHotspots = () => {};
    setup(game);
    player.x = 800; player.y = 395; // end of the dock
    game.rng = () => 0.5;
    game.handleMessage(player, { t: MSG.CAST, angle: -Math.PI / 2, power: 0.4 });
    run(game, 0.7);
    return player.line.timer;
  };
  const alone = waitFor(() => {});
  const crowded = waitFor((game) => {
    for (let i = 0; i < 2; i++) {
      const other = game.addPlayer(`Other${i}`, () => {});
      other.line = { state: FishingState.WAITING, x: 800, y: 270, timer: 99 };
    }
  });
  const hot = waitFor((game) => { game.hotspots = [{ id: 1, x: 800, y: 270, r: 80, life: 99 }]; });
  assert.ok(crowded > alone * 1.5, `crowded ${crowded} vs alone ${alone}`);
  assert.ok(hot < alone, `hotspot ${hot} vs alone ${alone}`);
});

test('hotspots boost rare species odds', () => {
  const zone = world.zones.find((z) => z.id === 'deep');
  const count = (hot) => {
    const rng = seeded(7);
    let rare = 0;
    for (let i = 0; i < 5000; i++) if (['sturgeon', 'ghost', 'pike'].includes(pickSpecies(rng, zone, hot))) rare++;
    return rare;
  };
  assert.ok(count(true) > count(false) * 1.3);
});

test('snapshot exposes state but not hidden fish identity', () => {
  const { game, player } = makeGame();
  player.line = { state: FishingState.BITE, x: 800, y: 200, zoneId: 'deep', timer: 1, fish: { species: 'ghost', kg: 50 } };
  const snap = game.snapshot();
  const json = JSON.stringify(snap);
  assert.equal(snap.players[0].s, 'bite');
  assert.ok(!json.includes('ghost'));
  assert.equal(snap.hotspots.length, world.hotspots.count);
});
