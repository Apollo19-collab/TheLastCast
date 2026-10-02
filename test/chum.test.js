// Chum buckets.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../server/game.js';
import { pickSpecies } from '../server/fishing.js';
import { FishingState, MSG } from '../shared/constants.js';
import { LOCATIONS } from '../shared/world.js';
import { ITEMS, computeStats } from '../shared/gear.js';
import { SPECIES } from '../shared/fish.js';
import { CHUM, rollChum } from '../shared/chum.js';

const world = LOCATIONS.mirrorLake;
const shop = world.shops.find((s) => s.id === 'bait');

function seeded(seed = 1) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function atShop(rng = seeded(42)) {
  const game = new Game({ world, rng });
  const inbox = [];
  const player = game.addPlayer('Chummer', (m) => inbox.push(m));
  Object.assign(player, { x: shop.x + 40, y: shop.y + 40 });
  player.profile.coins = 1000;
  return { game, player, inbox };
}

function landNow(game, player, species) {
  player.line = {
    state: FishingState.REELING, x: player.x, y: player.y - 100, zoneId: 'shallows', fish: { species, kg: SPECIES[species].minKg },
    progress: 0.999, tension: 0, reeling: true, pulling: false, pullTimer: 99, fight: 0.2, reelSpeed: 1, lineStrength: 1, drag: 1,
  };
  game.tick(0.05);
}

test('chum: bought at the Bait Shop, placed with C, one at a time', () => {
  const { game, player, inbox } = atShop();
  const p = player.profile;
  game.handleMessage(player, { t: MSG.BUY, item: 'chum' });
  assert.equal(p.chum, 1);
  assert.equal(p.coins, 1000 - CHUM.price);
  game.handleMessage(player, { t: MSG.BUY, item: 'chum', packs: 5 });
  assert.equal(p.chum, 6);

  Object.assign(player, { x: 1600, y: 1800 }); // on the dock
  game.handleMessage(player, { t: MSG.BUY, item: 'chum' });
  assert.equal(p.chum, 6, 'only sold at the shop');
  game.handleMessage(player, { t: MSG.CHUM });
  assert.equal(game.chums.length, 1);
  assert.equal(p.chum, 5);
  game.handleMessage(player, { t: MSG.CHUM });
  assert.equal(game.chums.length, 1, 'one bucket out at a time');
  assert.match(inbox.at(-1).message, /already/);
  assert.equal(game.snapshot().chums[0].o, player.id);

  // It runs out after its time.
  for (let t = 0; t < CHUM.duration + 1; t += 1) game.tick(1);
  assert.equal(game.chums.length, 0);
  assert.ok(inbox.some((m) => m.kind === 'chumDone'));
});

test('chum: fish landed near your bucket turn into bait; rarer fish, better bait', () => {
  const { game, player } = atShop(() => 0); // every roll succeeds and picks the first bait
  const p = player.profile;
  p.chum = 1;
  game.handleMessage(player, { t: MSG.CHUM });
  landNow(game, player, 'bluegill');
  assert.ok(p.bait.worms > 0, 'common fish make common bait');
  p.achievements.dedicated = Date.now(); // unlocks the Golden Lure
  landNow(game, player, 'mossback');
  assert.ok(p.bait.goldlure > 0, 'legendary fish make top bait');

  // Too far from the bucket: nothing.
  const before = JSON.stringify(p.bait);
  Object.assign(player, { x: player.x + CHUM.radius + 50 });
  landNow(game, player, 'bluegill');
  assert.equal(JSON.stringify(p.bait), before);
});

test('chum: only unlocked bait comes out; it fills up after enough fish', () => {
  const rng = seeded(3);
  for (let i = 0; i < 500; i++) {
    const got = rollChum(rng, 'legendary', (id) => !ITEMS[id].unlock);
    assert.ok(!got || !ITEMS[got.bait].unlock, 'locked bait never drops');
  }
  const { game, player } = atShop(() => 0.99);
  player.profile.chum = 1;
  game.handleMessage(player, { t: MSG.CHUM });
  for (let i = 0; i < CHUM.maxFish; i++) landNow(game, player, 'bluegill');
  assert.equal(game.chums.length, 0, 'full bucket is used up');
});

test('chum: nearby bobbers bite faster, for everyone', () => {
  const { game, player } = atShop();
  player.profile.chum = 1;
  game.handleMessage(player, { t: MSG.CHUM });
  const c = game.chums[0];
  assert.equal(game.chumBiteBonus(c.x, c.y - 100), CHUM.biteBonus);
  assert.equal(game.chumBiteBonus(c.x, c.y - CHUM.attractRadius - 50), 1);
});

test('chum bucket: pays for itself, but is not a money printer', () => {
  // Value of the bait a full bucket makes, at shop prices, for a new player in
  // the shallows and a late-game player in the deep basin.
  const value = (zoneId, equipped, canUse) => {
    const rng = seeded(7);
    const zone = world.zones.find((z) => z.id === zoneId);
    const stats = computeStats(equipped);
    let total = 0;
    const N = 8000;
    for (let i = 0; i < N; i++) {
      const got = rollChum(rng, SPECIES[pickSpecies(rng, zone, false, stats)].rarity, canUse);
      if (got) total += got.uses * (ITEMS[got.bait].price / ITEMS[got.bait].pack);
    }
    return (total / N) * CHUM.maxFish / CHUM.price;
  };
  const early = value('shallows', {}, (id) => !ITEMS[id].unlock);
  const late = value('basin', { rod: 'master', bait: 'goldlure' }, () => true);
  assert.ok(early >= 0.9 && early <= 1.6, `early bucket returns ${early.toFixed(2)}x`);
  assert.ok(late >= early && late <= 3, `late bucket returns ${late.toFixed(2)}x`);
});
