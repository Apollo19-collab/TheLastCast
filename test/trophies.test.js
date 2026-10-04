// Trophy fish, named giants and the Hall of Records.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Hub } from '../server/hub.js';
import { Game } from '../server/game.js';
import { Records } from '../server/records.js';
import { ProfileStore, newProfile, normalize } from '../server/profiles.js';
import { hook, rollKg } from '../server/fishing.js';
import { FishingState, MSG } from '../shared/constants.js';
import { SPECIES, fishDifficulty, scoreCatch } from '../shared/fish.js';
import { LOCATIONS } from '../shared/world.js';
import {
  CABINET_LIMIT, GIANT_FIGHT, GIANT_ROLL, GIANT_SIZE, RECORDS_ALL_TIME, TROPHY_TIERS, WEEKLY_PRIZE,
  kgFromRoll, trophyKg, trophyName, trophyTier, weekEnds, weekOf, weeklyPrize,
} from '../shared/trophies.js';

const world = LOCATIONS.mirrorLake;

function seeded(seed = 1) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/** Land a fish of this weight for `player`. */
function land(game, player, species, kg) {
  player.line = {
    state: FishingState.REELING, x: player.x, y: player.y, zoneId: 'open', fish: { species, kg },
    progress: 0.999, tension: 0, reeling: true, pulling: false, pullTimer: 99, fight: 0.2, reelSpeed: 1, lineStrength: 1, drag: 1,
  };
  game.tick(0.05);
  return game.events.filter((e) => e.kind === 'catch').at(-1);
}

test('every species has a trophy weight near the top of its range; junk has none', () => {
  for (const [id, s] of Object.entries(SPECIES)) {
    const t = trophyKg(id);
    if (s.rarity === 'junk') { assert.equal(t, null); continue; }
    assert.ok(t > s.minKg && t < s.maxKg, `${id}: ${t}`);
    assert.equal(trophyTier(id, t), 'trophy');
    assert.equal(trophyTier(id, t - 0.01), null);
    assert.equal(trophyTier(id, s.maxKg + 0.01), 'giant');
  }
  assert.equal(trophyTier('boot', 99), null);
});

test('weights: the normal range is still covered, and only the very top of the roll makes a giant', () => {
  const s = SPECIES.pike;
  assert.equal(kgFromRoll('pike', 0), s.minKg);
  assert.equal(kgFromRoll('pike', GIANT_ROLL), s.maxKg);
  assert.equal(kgFromRoll('pike', 0.9999999), Math.round(s.maxKg * (GIANT_SIZE.min + GIANT_SIZE.extra) * 100) / 100);
  assert.ok(kgFromRoll('boot', 0.9999) <= SPECIES.boot.maxKg, 'no giant boots');

  const odds = (weight) => {
    const rng = seeded(11);
    const n = 300000;
    let trophies = 0;
    let giants = 0;
    for (let i = 0; i < n; i++) {
      const tier = trophyTier('pike', rollKg(rng, 'pike', weight));
      if (tier === 'trophy') trophies++;
      if (tier === 'giant') giants++;
    }
    return { trophy: trophies / n, giant: giants / n };
  };
  const base = odds(1);
  assert.ok(base.trophy > 0.03 && base.trophy < 0.05, `trophies ${base.trophy}`);
  assert.ok(base.giant > 0.0025 && base.giant < 0.0042, `giants ${base.giant} (about 1 in 300)`);
  const armour = odds(1.6);
  assert.ok(armour.trophy > base.trophy * 1.3 && armour.giant > base.giant * 1.3, 'Trophy Hunter armour finds more');
  assert.ok(armour.giant < 0.01, 'but giants stay rare');
});

test('trophy names: the same fish keeps its name; giants carry an epithet', () => {
  assert.equal(trophyName('trophy', 'p1', 'pike', 11.2, 40), trophyName('trophy', 'p1', 'pike', 11.2, 40));
  const names = new Set();
  for (let i = 0; i < 200; i++) names.add(trophyName('trophy', 'p1', 'pike', 11, i));
  assert.ok(names.size > 60, `${names.size} different names`);
  for (let i = 0; i < 50; i++) {
    const giant = trophyName('giant', 'p1', 'pike', 15, i);
    assert.ok(/ (the|of) /.test(giant), giant);
  }
});

test('landing a trophy: bonus points, a named fish in your cabinet, the records and an achievement', () => {
  const records = new Records();
  const game = new Game({ world, rng: seeded(2), records });
  records.announce = (e) => game.emitAll(e);
  const p = game.addPlayer('Alice', () => {});
  const plain = land(game, p, 'pike', 5);
  assert.equal(plain.trophy, undefined);
  assert.equal(p.profile.trophies.length, 0);

  const kg = trophyKg('pike');
  const ev = land(game, p, 'pike', kg);
  assert.equal(ev.trophy.tier, 'trophy');
  assert.ok(ev.trophy.name.length > 2);
  assert.equal(ev.points, scoreCatch('pike', kg, TROPHY_TIERS.trophy.points));
  assert.equal(ev.trophy.allTime, 0, 'first trophy pike: a new record');
  assert.equal(ev.trophy.weekly, 0);
  assert.deepEqual(p.profile.trophies[0], { species: 'pike', kg, name: ev.trophy.name, tier: 'trophy', zone: ev.zone, at: p.profile.trophies[0].at });
  assert.equal(p.profile.index.pike.trophies, 1);
  assert.equal(p.profile.counters.trophies, 1);
  assert.equal(p.profile.counters.recordsSet, 1);
  assert.ok(p.profile.achievements.trophy_room && p.profile.achievements.record_breaker);
  assert.ok(game.events.some((e) => e.kind === 'record' && e.species === 'pike'), 'a new record is announced');

  const giant = land(game, p, 'pike', SPECIES.pike.maxKg * 1.2);
  assert.equal(giant.trophy.tier, 'giant');
  assert.match(giant.trophy.name, / (the|of) /);
  assert.equal(p.profile.counters.giants, 1);
  assert.ok(p.profile.achievements.giant_slayer);

  // The records window.
  const inbox = [];
  p.send = (m) => inbox.push(m);
  game.handleMessage(p, { t: MSG.RECORDS });
  const view = inbox.find((m) => m.kind === 'records');
  assert.equal(view.species.pike.all.length, 1, 'one place per angler per species');
  assert.equal(view.species.pike.all[0].kg, giant.kg);
  assert.equal(view.species.pike.all[0].mine, 1);
  assert.equal(view.species.pike.all[0].pid, undefined, 'profile ids stay private');
});

test('giants fight much harder, and you are warned when one is on', () => {
  const game = new Game({ world, rng: seeded(4) });
  const inbox = [];
  const p = game.addPlayer('Bob', (m) => inbox.push(m));
  const kg = SPECIES.bass.maxKg * 1.3;
  p.line = { state: FishingState.BITE, x: p.x, y: p.y, timer: 1, fish: { species: 'bass', kg } };
  hook(game, p);
  assert.equal(p.line.fight, fishDifficulty('bass', kg) * GIANT_FIGHT);
  assert.equal(inbox.find((m) => m.kind === 'hooked').giant, true);
});

test('the trophy cabinet keeps the newest trophies, and never lets a giant go', () => {
  const game = new Game({ world, rng: seeded(5) });
  const p = game.addPlayer('Cleo', () => {});
  land(game, p, 'carp', SPECIES.carp.maxKg * 1.1); // a giant first
  for (let i = 0; i < CABINET_LIMIT + 10; i++) land(game, p, 'carp', SPECIES.carp.maxKg);
  assert.equal(p.profile.trophies.length, CABINET_LIMIT);
  assert.equal(p.profile.trophies.at(-1).tier, 'giant');
  assert.equal(p.profile.counters.trophies, CABINET_LIMIT + 11);
});

test('records: heaviest first, one place per angler, a limited number of places', () => {
  const records = new Records();
  const anglers = Array.from({ length: 8 }, (_, i) => ({ ...newProfile(`A${i}`), id: `p${i}` }));
  const kg = trophyKg('walleye');
  anglers.forEach((a, i) => records.submit(a, { species: 'walleye', kg: kg + i * 0.1, name: 'X', tier: 'trophy', zone: 'Z' }));
  let table = records.view('p7').species.walleye.all;
  assert.equal(table.length, RECORDS_ALL_TIME);
  assert.deepEqual(table.map((e) => e.angler), ['A7', 'A6', 'A5', 'A4', 'A3']);
  assert.equal(table[0].mine, 1);
  // A lighter fish from a record holder changes nothing; a heavier one moves them up.
  assert.deepEqual(records.submit(anglers[3], { species: 'walleye', kg, name: 'Y', tier: 'trophy' }), { allTime: null, weekly: null });
  assert.equal(records.submit(anglers[3], { species: 'walleye', kg: kg + 5, name: 'Y', tier: 'trophy' }).allTime, 0);
  table = records.view('p7').species.walleye.all;
  assert.deepEqual(table.map((e) => e.angler), ['A3', 'A7', 'A6', 'A5', 'A4']);
  assert.equal(records.submit(anglers[0], { species: 'walleye', kg: 99, name: 'Z', tier: null }).allTime, null, 'only trophies count');
});

test('weekly records: the top three of each species are paid when the week ends, online or not', () => {
  const clock = { ms: weekEnds(weekOf(Date.UTC(2026, 9, 1))) - 3600 * 1000 }; // an hour before a week ends
  const saved = new Map();
  const hub = new Hub({ rng: seeded(3), now: () => clock.ms, getProfile: (id) => saved.get(id) ?? null });
  const inbox = [];
  const online = hub.addPlayer('Online', (m) => inbox.push(m));
  const away = { ...newProfile('Away'), id: 'away' };
  saved.set(away.id, away);
  const kg = trophyKg('muskie');
  hub.records.submit(away, { species: 'muskie', kg: kg + 1, name: 'Old Tusk', tier: 'trophy' });
  hub.records.submit(online.profile, { species: 'muskie', kg, name: 'Fang', tier: 'trophy' });
  const coins = [away.coins, online.profile.coins];

  hub.tick(0.05);
  assert.equal(away.coins, coins[0], 'not before the week is over');
  clock.ms += 3600 * 1000 + 1;
  hub.tick(0.05);
  assert.equal(away.coins - coins[0], weeklyPrize('muskie', 0));
  assert.equal(online.profile.coins - coins[1], weeklyPrize('muskie', 1));
  assert.equal(weeklyPrize('muskie', 1), Math.round(weeklyPrize('muskie', 0) / 2));
  assert.equal(away.counters.weeklyWins, 1);
  assert.equal(online.profile.counters.weeklyWins || 0, 0);
  assert.ok(inbox.some((m) => m.kind === 'weeklyPrize' && m.place === 1), 'told straight away');
  assert.equal(away.notices.length, 1, '...or next time they join');
  assert.equal(hub.records.view('x').species.muskie.week.length, 0, 'a new week starts empty');
  assert.equal(hub.records.view('x').species.muskie.all.length, 2, 'all-time records stay');

  // The absent angler comes back.
  const back = [];
  const player = hub.addPlayer('Away', (m) => back.push(m), away);
  hub.lake.deliverNotices(player);
  assert.ok(back.some((m) => m.kind === 'weeklyPrize' && m.place === 0));
  assert.equal(away.notices.length, 0);
  assert.ok(away.achievements.weekly_champion);
});

test('weekly prizes stay in line with fishing', () => {
  for (const id of Object.keys(SPECIES)) {
    if (SPECIES[id].rarity === 'junk') continue;
    assert.ok(weeklyPrize(id, 0) <= WEEKLY_PRIZE.max);
    assert.ok(weeklyPrize(id, 2) < weeklyPrize(id, 0));
  }
  // Trophy bonus points add only a few percent on average.
  const rng = seeded(9);
  let base = 0;
  let total = 0;
  for (let i = 0; i < 100000; i++) {
    const kg = rollKg(rng, 'carp');
    const tier = trophyTier('carp', kg);
    base += scoreCatch('carp', kg);
    total += scoreCatch('carp', kg, tier ? TROPHY_TIERS[tier].points : 1);
  }
  assert.ok(total / base < 1.06, `x${(total / base).toFixed(3)}`);
});

test('records and trophy cabinets are saved and loaded', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'lastcast-'));
  const file = path.join(dir, 'profiles.json');
  const store = new ProfileStore(file);
  const hub = new Hub({ rng: seeded(1), records: store.recordsData, onRecordsChange: () => store.markDirty() });
  store.records = hub.records;
  const { profile } = store.createGuest('Dana');
  const p = hub.addPlayer('Dana', () => {}, profile);
  land(hub.lake, p, 'sturgeon', SPECIES.sturgeon.maxKg);
  await store.flush();

  const again = new ProfileStore(file);
  await again.load();
  const hub2 = new Hub({ rng: seeded(1), records: again.recordsData });
  assert.equal(hub2.records.view(profile.id).species.sturgeon.all[0].mine, 1);
  assert.equal(again.profiles.get(profile.id).trophies.length, 1);
  assert.deepEqual(normalize({ name: 'Old' }).trophies, [], 'older saves get an empty cabinet');
});
