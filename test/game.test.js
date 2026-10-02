import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, sanitizeName } from '../server/game.js';
import { pickSpecies } from '../server/fishing.js';
import { FishingState, MSG } from '../shared/constants.js';
import { LOCATIONS, areaAt, isWalkable, isWater, zoneAt } from '../shared/world.js';
import { GEAR, gearStats } from '../shared/gear.js';
import { ProfileStore } from '../server/profiles.js';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { SPECIES } from '../shared/fish.js';
import { tmpdir } from 'node:os';
import path from 'node:path';

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
  assert.equal(zoneAt(world, 1500, 1450).id, 'deep');
  assert.equal(zoneAt(world, 500, 1600).id, 'reeds');
  assert.equal(zoneAt(world, 1000, 1900).id, 'shallows');
  assert.equal(zoneAt(world, 2200, 1200).id, 'open');
  assert.equal(zoneAt(world, 1600, 1800), null, 'dock is not water');
  assert.ok(!isWater(world, 1000, 2100), 'beach is not water');
});

test('names are sanitized', () => {
  assert.equal(sanitizeName('  <b>Bob</b>  '), 'bBobb');
  assert.equal(sanitizeName(''), null);
  assert.equal(sanitizeName('x'.repeat(40)).length, 16);
});

test('players cannot walk into the water', () => {
  const { game, player } = makeGame();
  player.x = 1000;
  player.y = 2005;
  game.handleMessage(player, { t: MSG.INPUT, up: true });
  run(game, 3);
  assert.ok(isWalkable(world, player.x, player.y));
  assert.ok(player.y >= 2000);
});

test('cast onto land is rejected; cast into water starts fishing', () => {
  const { game, player, inbox } = makeGame();
  player.x = 1000;
  player.y = 2100;
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
  player.x = 1000;
  player.y = 2100;
  game.handleMessage(player, { t: MSG.CAST, angle: -Math.PI / 2, power: 0.5 });
  assert.equal(player.line.state, FishingState.CASTING);
  const { x, y } = player;
  game.handleMessage(player, { t: MSG.INPUT, left: true });
  run(game, 0.5);
  assert.deepEqual([player.x, player.y], [x, y]);
});

test('full loop: bite, hook, reel carefully, catch and score', () => {
  const { game, player } = makeGame();
  player.x = 1000;
  player.y = 2100;
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
  const { profile } = player;
  assert.equal(profile.catches, 1);
  assert.equal(profile.score, caught.points);
  assert.equal(profile.coins, caught.points);
  assert.ok(profile.score > 0);

  // Fish index and catch history are updated, and the client is told.
  assert.equal(profile.index[caught.species].count, 1);
  assert.equal(profile.history[0].species, caught.species);
  assert.equal(profile.history[0].kg, caught.kg);
  assert.equal(caught.isNew, true);
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
  assert.equal(player.profile.catches, 0);
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
    player.x = 1600; player.y = 1615; // end of the South Beach dock
    game.rng = () => 0.5;
    game.handleMessage(player, { t: MSG.CAST, angle: -Math.PI / 2, power: 0.4 });
    run(game, 0.7);
    return player.line.timer;
  };
  const alone = waitFor(() => {});
  const crowded = waitFor((game) => {
    for (let i = 0; i < 2; i++) {
      const other = game.addPlayer(`Other${i}`, () => {});
      other.line = { state: FishingState.WAITING, x: 1600, y: 1490, timer: 99 };
    }
  });
  const hot = waitFor((game) => { game.hotspots = [{ id: 1, x: 1600, y: 1490, r: 80, life: 99 }]; });
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

function catchOne(game, player) {
  player.line = {
    state: FishingState.REELING, x: 1000, y: 700, zoneId: 'shallows', hotspot: false,
    fish: { species: 'bluegill', kg: 0.3 }, progress: 0.99, tension: 0,
    reeling: true, pulling: false, pullTimer: 5, fight: 0.1,
  };
  game.tick(0.1);
}

test('repeat catches update index counts and keep history capped', () => {
  const { game, player, inbox } = makeGame();
  for (let i = 0; i < 55; i++) catchOne(game, player);
  assert.equal(player.profile.index.bluegill.count, 55);
  assert.equal(player.profile.history.length, 50);
  assert.ok(game.drainEvents().filter((e) => e.kind === 'catch').slice(1).every((e) => !e.isNew));
  assert.equal(inbox.filter((m) => m.t === MSG.PROFILE).at(-1).catches, 55);
});

test('buying gear: costs coins, upgrades stats, one tier at a time', () => {
  const { game, player, inbox } = makeGame();
  game.handleMessage(player, { t: MSG.BUY, slot: 'rod' });
  assert.equal(player.profile.gear.rod, 0, 'cannot buy without coins');
  assert.equal(inbox.at(-1).ok, false);

  player.profile.coins = 1000;
  game.handleMessage(player, { t: MSG.BUY, slot: 'rod' });
  assert.equal(player.profile.gear.rod, 1);
  assert.equal(player.profile.coins, 1000 - GEAR.rod.tiers[1].price);
  assert.equal(player.stats.castRange, GEAR.rod.tiers[1].castRange);

  game.handleMessage(player, { t: MSG.BUY, slot: '__proto__' });
  game.handleMessage(player, { t: MSG.BUY, slot: 'boat' });
  assert.deepEqual(Object.keys(player.profile.gear).sort(), ['bait', 'reel', 'rod']);

  for (let i = 0; i < 10; i++) game.handleMessage(player, { t: MSG.BUY, slot: 'reel' });
  assert.equal(player.profile.gear.reel, GEAR.reel.tiers.length - 1, 'stops at max tier');
  assert.ok(player.profile.coins >= 0);
});

test('better rod casts further', () => {
  const { game, player } = makeGame();
  player.x = 1600; player.y = 1615;
  game.handleMessage(player, { t: MSG.CAST, angle: -Math.PI / 2, power: 0.6 });
  const basic = 1615 - player.line.y;
  game.handleMessage(player, { t: MSG.CANCEL });
  player.stats = gearStats({ rod: 3 });
  game.handleMessage(player, { t: MSG.CAST, angle: -Math.PI / 2, power: 0.6 });
  assert.ok(1615 - player.line.y > basic);
});

test('better bait means more rare fish', () => {
  const zone = world.zones.find((z) => z.id === 'deep');
  const count = (boost) => {
    const rng = seeded(3);
    let rare = 0;
    for (let i = 0; i < 5000; i++) if (['sturgeon', 'ghost', 'pike'].includes(pickSpecies(rng, zone, false, boost))) rare++;
    return rare;
  };
  assert.ok(count(2) > count(1) * 1.3);
});

test('guest profiles save to disk and restore by token', async () => {
  const file = path.join(await mkdtemp(path.join(tmpdir(), 'lastcast-')), 'profiles.json');
  const a = new ProfileStore(file);
  const { token, profile } = a.createGuest('Saver');
  profile.coins = 42;
  profile.gear.rod = 2;
  a.markDirty();
  await a.flush();
  assert.ok(!(await readFile(file, 'utf8')).includes(token), 'tokens are stored hashed');

  const b = new ProfileStore(file);
  await b.load();
  assert.equal(b.getGuest(token).coins, 42);
  assert.equal(b.getGuest(token).gear.rod, 2);
  assert.equal(b.getGuest('not-a-token'), null);
});

test('accounts: register, log in, sessions, wrong passwords', async () => {
  const store = new ProfileStore(null);
  assert.match((await store.register('ab', 'secret1')).error, /3-16/);
  assert.match((await store.register('Bob', '123')).error, /at least/);

  const reg = await store.register('Bob_1', 'hunter22');
  assert.ok(reg.profile && reg.session);
  assert.equal(reg.profile.username, 'Bob_1');
  assert.match((await store.register('bob_1', 'other123')).error, /taken/, 'usernames are case-insensitive');

  assert.equal((await store.login('Bob_1', 'wrong-pass')).error, 'Wrong username or password.');
  assert.equal((await store.login('nobody', 'hunter22')).error, 'Wrong username or password.');
  const ok = await store.login('BOB_1', 'hunter22');
  assert.equal(ok.profile, reg.profile);

  assert.equal(store.getSession(ok.session), reg.profile);
  store.revokeSession(ok.session);
  assert.equal(store.getSession(ok.session), null);
  assert.equal(store.getSession(reg.session), reg.profile, 'other sessions stay valid');
});

test('signing up keeps guest progress and retires the guest token', async () => {
  const store = new ProfileStore(null);
  const { token, profile } = store.createGuest('Fisher');
  profile.coins = 99;
  profile.index.bluegill = { count: 3, bestKg: 0.5, firstAt: 1 };
  const reg = await store.register('Fisher', 'password1', token);
  assert.equal(reg.profile, profile);
  assert.equal(reg.profile.coins, 99);
  assert.equal(store.getGuest(token), null, 'guest token no longer opens the account');
});

test('accounts persist; passwords are never stored in plain text', async () => {
  const file = path.join(await mkdtemp(path.join(tmpdir(), 'lastcast-')), 'profiles.json');
  const a = new ProfileStore(file);
  const { session } = await a.register('Persist', 'plaintext-pw');
  await a.flush();
  const raw = await readFile(file, 'utf8');
  assert.ok(!raw.includes('plaintext-pw'));
  assert.ok(!raw.includes(session));

  const b = new ProfileStore(file);
  await b.load();
  assert.equal(b.getSession(session).username, 'Persist');
  assert.ok((await b.login('persist', 'plaintext-pw')).profile);
});

test('version 1 save files are migrated', async () => {
  const file = path.join(await mkdtemp(path.join(tmpdir(), 'lastcast-')), 'profiles.json');
  const token = 'a'.repeat(32);
  await writeFile(file, JSON.stringify({ version: 1, profiles: { [token]: { name: 'Old', coins: 7, gear: { rod: 1 } } } }));
  const store = new ProfileStore(file);
  await store.load();
  const p = store.getGuest(token);
  assert.equal(p.coins, 7);
  assert.deepEqual(p.gear, { rod: 1, reel: 0, bait: 0 });
});

test('each zone has its own fish; drop-off gets deep-water species', () => {
  assert.equal(zoneAt(world, 1555, 1700).id, 'dockShade');
  const fishIn = (id) => Object.keys(world.zones.find((z) => z.id === id).fish);
  for (const deepFish of ['laketrout', 'burbot', 'sturgeon']) {
    assert.ok(fishIn('deep').includes(deepFish));
    assert.ok(fishIn('rocks').includes(deepFish), `${deepFish} at the drop-off`);
    assert.ok(!fishIn('shallows').includes(deepFish));
  }
  assert.ok(fishIn('shallows').includes('koi') && !fishIn('deep').includes('koi'));
  assert.ok(fishIn('reeds').includes('muskie'));
  // Every species is catchable somewhere and every zone entry is a real species.
  const all = new Set(world.zones.flatMap((z) => Object.keys(z.fish)));
  assert.deepEqual([...all].sort(), Object.keys(SPECIES).sort());
});

test('the big lake: three new locations, all reachable on foot', () => {
  // New fishing waters around the lake.
  assert.equal(zoneAt(world, 1800, 500).id, 'coldSpring');
  assert.equal(zoneAt(world, 1000, 500).id, 'weedyCove');
  assert.equal(zoneAt(world, 400, 700).id, 'marsh');
  assert.equal(zoneAt(world, 2700, 1000).id, 'river');
  assert.equal(zoneAt(world, 2980, 1000).id, 'river', 'the river channel past the shore');
  assert.equal(zoneAt(world, 1450, 1250).id, 'basin');
  assert.equal(areaAt(world, 1800, 500).name, 'Pine Point');
  assert.equal(areaAt(world, 2700, 1000).name, 'River Mouth');
  assert.equal(areaAt(world, 400, 700).name, 'Lily Marsh');
  assert.equal(areaAt(world, world.spawn.x, world.spawn.y).name, 'South Beach');

  // Flood-fill the walkable ground from the spawn point.
  const step = 20;
  const key = (x, y) => `${x},${y}`;
  const start = [Math.round(world.spawn.x / step) * step, Math.round(world.spawn.y / step) * step];
  const seen = new Set([key(...start)]);
  const queue = [start];
  while (queue.length) {
    const [x, y] = queue.pop();
    for (const [dx, dy] of [[step, 0], [-step, 0], [0, step], [0, -step]]) {
      const n = [x + dx, y + dy];
      if (!seen.has(key(...n)) && isWalkable(world, ...n)) { seen.add(key(...n)); queue.push(n); }
    }
  }
  const reachable = (x, y) => seen.has(key(Math.round(x / step) * step, Math.round(y / step) * step));
  assert.ok(reachable(1440, 1160), 'end of the Pine Point jetty');
  assert.ok(reachable(560, 900), 'end of the Lily Marsh boardwalk');
  assert.ok(reachable(3060, 1000), 'bridge over the river');
  assert.ok(reachable(3100, 400), 'east shore north of the river');
  assert.ok(reachable(1600, 1620), 'end of the South Beach dock');
});
