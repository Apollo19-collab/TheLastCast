// Levels, XP and armour.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../server/game.js';
import { normalize } from '../server/profiles.js';
import { pickSpecies, rollKg } from '../server/fishing.js';
import { FishingState, MSG } from '../shared/constants.js';
import { LOCATIONS } from '../shared/world.js';
import { computeStats } from '../shared/gear.js';
import { SPECIES, fishDifficulty, scoreCatch } from '../shared/fish.js';
import { EXPECTED_XP_PER_HOUR, MAX_LEVEL, levelFor, levelUpCoins, xpForLevel, xpToNext } from '../shared/levels.js';
import { ARMOUR, ARMOUR_SLOTS, NO_ARMOUR, SETS, computeArmour } from '../shared/armour.js';

const world = LOCATIONS.mirrorLake;

function seeded(seed = 1) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function makeGame(rng = seeded(42)) {
  const game = new Game({ world, rng });
  const inbox = [];
  const player = game.addPlayer('Tester', (m) => inbox.push(m));
  return { game, player, inbox };
}

/** Land a fish on the next tick. */
function landNow(game, player, species = 'carp', kg = 5) {
  player.line = {
    state: FishingState.REELING, x: 1500, y: 1450, zoneId: 'deep', fish: { species, kg },
    progress: 0.999, tension: 0, reeling: true, pulling: false, pullTimer: 99, fight: 0.2, reelSpeed: 1, lineStrength: 1, drag: 1,
  };
  game.tick(0.05);
}

function wearSet(profile, setId) {
  for (const slot of ARMOUR_SLOTS) {
    profile.armourOwned.push(`${setId}_${slot}`);
    profile.armour[slot] = `${setId}_${slot}`;
  }
}

test('level curve: quick early levels, level 50 in about 40 hours, the max in about 85', () => {
  assert.equal(levelFor(0), 1);
  assert.equal(levelFor(xpForLevel(MAX_LEVEL)), MAX_LEVEL);
  assert.equal(levelFor(xpForLevel(MAX_LEVEL) * 10), MAX_LEVEL);
  for (let l = 2; l <= MAX_LEVEL; l++) assert.equal(levelFor(xpForLevel(l)), l);
  assert.ok((xpToNext(1) / EXPECTED_XP_PER_HOUR) * 60 < 10, 'level 2 in under 10 minutes');
  const hours50 = xpForLevel(50) / EXPECTED_XP_PER_HOUR;
  assert.ok(hours50 >= 38 && hours50 <= 42, `level 50 in ${hours50.toFixed(1)} hours`);
  assert.equal(MAX_LEVEL, 75);
  const hours = xpForLevel(MAX_LEVEL) / EXPECTED_XP_PER_HOUR;
  assert.ok(hours >= 80 && hours <= 95, `max level in ${hours.toFixed(1)} hours`);
});

test('the expected XP rate matches what fishing actually pays', () => {
  // A good player in the best zone for their tackle, with 25% downtime
  // (walking, missed fish, menus). XP per catch = points.
  const rng = seeded(9);
  const rate = (equipped) => {
    const st = computeStats(equipped);
    let best = 0;
    for (const z of world.zones) {
      let pts = 0;
      let fight = 0;
      const N = 1500;
      for (let i = 0; i < N; i++) {
        const id = pickSpecies(rng, z, false, st);
        const kg = rollKg(rng, id);
        pts += scoreCatch(id, kg);
        fight += 4 + 5 * fishDifficulty(id, kg);
      }
      const perCatch = 8 / (z.biteRate * st.biteSpeed) + 2.1 + fight / N;
      best = Math.max(best, (3600 / perCatch) * (pts / N) * 0.75);
    }
    return best;
  };
  const starter = rate({});
  const top = rate({ rod: 'legendrod', reel: 'golden', line: 'spectral', bait: 'mythicfly' });
  // A career spans both, plus voyages and duels: the expected rate sits in between.
  assert.ok(starter < EXPECTED_XP_PER_HOUR * 1.1 && top > EXPECTED_XP_PER_HOUR, `${Math.round(starter)}..${Math.round(top)} XP/h`);
});

test('catches give XP; level ups pay coins and announce unlocks', () => {
  const { game, player, inbox } = makeGame();
  const p = player.profile;
  p.xp = xpForLevel(2) - 1;
  landNow(game, player, 'carp', 8);
  const caught = game.drainEvents().find((e) => e.kind === 'catch');
  assert.equal(caught.xp, caught.points, '1 XP per point');
  assert.equal(levelFor(p.xp), 2);
  const up = inbox.find((m) => m.kind === 'levelUp');
  assert.equal(up.level, 2);
  assert.equal(up.coins, levelUpCoins(2));
  assert.deepEqual(up.unlocks, [SETS.canvas.name]);
  assert.equal(game.snapshot().players[0].lv, 2);
});

test('armour: level-gated, bought with coins, worn and taken off', () => {
  const { game, player, inbox } = makeGame();
  const p = player.profile;
  p.coins = 10000;
  game.handleMessage(player, { t: MSG.BUY, item: 'clover_head' });
  assert.ok(!p.armourOwned.includes('clover_head'));
  assert.match(inbox.at(-1).message, /level 15/);
  p.xp = xpForLevel(15);
  game.handleMessage(player, { t: MSG.BUY, item: 'clover_head' });
  assert.ok(p.armourOwned.includes('clover_head'));
  assert.equal(p.armour.head, 'clover_head');
  assert.equal(p.coins, 10000 - SETS.clover.price);
  game.handleMessage(player, { t: MSG.EQUIP, item: 'clover_head' });
  assert.equal(p.armour.head, null, 'wearing it again takes it off');
  game.handleMessage(player, { t: MSG.EQUIP, item: 'golden_head' });
  assert.equal(p.armour.head, null, 'cannot wear what you do not own');
  assert.equal(Object.keys(ARMOUR).length, Object.keys(SETS).length * 4);
});

test('armour: pieces add up; a full set unlocks its effect', () => {
  const half = computeArmour({ head: 'canvas_head', body: 'canvas_body' });
  assert.equal(half.coins, 1.04);
  assert.equal(half.set, null);
  const full = computeArmour({ head: 'canvas_head', body: 'canvas_body', legs: 'canvas_legs', feet: 'canvas_feet' });
  assert.equal(full.set, 'canvas');
  assert.equal(full.coins, 1.18);
  const mixed = computeArmour({ head: 'canvas_head', body: 'canvas_body', legs: 'canvas_legs', feet: 'oilskin_feet' });
  assert.equal(mixed.set, null, 'mixed sets get no set effect');
  assert.ok(computeArmour({ head: 'storm_head', body: 'storm_body', legs: 'storm_legs', feet: 'storm_feet' }).snapSave > 0);
});

test('armour: Double Catch lands a second fish; duels switch armour off', () => {
  const { game, player } = makeGame(() => 0); // every roll succeeds
  wearSet(player.profile, 'golden');
  game.armourChanged(player);
  assert.equal(player.armourStats.set, 'golden');
  landNow(game, player, 'carp', 5);
  const catches = game.drainEvents().filter((e) => e.kind === 'catch');
  assert.equal(catches.length, 2);
  assert.ok(catches[1].double);
  assert.equal(player.profile.index.carp.count, 2);
  assert.ok(catches[0].coins > Math.round(catches[0].points * 1.25), 'golden coins bonus');

  player.duel = { phase: 'live' };
  assert.equal(game.armourOf(player), NO_ARMOUR);
});

test('armour: Trophy Hunter fish run bigger', () => {
  const avg = (weight) => {
    const rng = seeded(5);
    let t = 0;
    for (let i = 0; i < 4000; i++) t += rollKg(rng, 'pike', weight);
    return t / 4000;
  };
  const trophy = computeArmour({ head: 'trophy_head', body: 'trophy_body', legs: 'trophy_legs', feet: 'trophy_feet' });
  assert.ok(avg(trophy.weight) > avg(1) * 1.1);
  assert.ok(SPECIES.pike.maxKg * 1.5 >= rollKg(() => 0.9999, 'pike', 2), 'even giants have a limit');
  assert.ok(SPECIES.pike.maxKg >= rollKg(() => 0.99, 'pike', 2), 'only giants pass the usual maximum');
});

test('existing players start with XP from their score', () => {
  const p = normalize({ name: 'Vet', score: 12345, inventory: ['willow'] });
  assert.equal(p.xp, 12345);
  assert.deepEqual(p.armour, { head: null, body: null, legs: null, feet: null });
  const q = normalize({ name: 'Cheat', xp: 10, armourOwned: ['nope'], armour: { head: 'golden_head' } });
  assert.equal(q.armour.head, null, 'cannot wear unowned armour');
});

test('endgame armour: a new set every 5 levels from 55 to 75, ending with Mythweaver', () => {
  const levels = Object.values(SETS).map((s) => s.level);
  for (const l of [55, 60, 65, 70, 75]) assert.ok(levels.includes(l), `a set at level ${l}`);
  assert.ok(Math.max(...levels) === MAX_LEVEL);
  const prices = Object.values(SETS).map((s) => s.price);
  assert.deepEqual(prices, [...prices].sort((a, b) => a - b), 'better sets cost more');
  const myth = computeArmour(Object.fromEntries(ARMOUR_SLOTS.map((s) => [s, `mythweaver_${s}`])));
  assert.equal(myth.set, 'mythweaver');
  assert.equal(myth.mythic, 2);
  assert.equal(NO_ARMOUR.mythic, 1);
  const ember = computeArmour(Object.fromEntries(ARMOUR_SLOTS.map((s) => [s, `emberforged_${s}`])));
  assert.ok(ember.reel > 1.2 && ember.snapSave === 0.4, 'set effects can boost reeling');
});
