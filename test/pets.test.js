// Pets and the Travelling Zoo.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../server/game.js';
import { FishingState, MSG, BITE_WINDOW, castDistance } from '../shared/constants.js';
import { LOCATIONS, isWalkable } from '../shared/world.js';
import { ITEMS } from '../shared/gear.js';
import { ARMOUR, NO_ARMOUR, computeArmour } from '../shared/armour.js';
import { PETS, PET_IDS, PET_RARITIES, ZOO, combineBonuses, petPrice, zooAt } from '../shared/pets.js';

const world = LOCATIONS.mirrorLake;

function seeded(seed = 1) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/** A game whose clock is fixed, with a rich player standing at the zoo. */
function atZoo(rng = seeded(42)) {
  const nowMs = 1_800_000_000_000;
  const game = new Game({ world, rng, now: () => nowMs });
  const inbox = [];
  const player = game.addPlayer('Keeper', (m) => inbox.push(m));
  const zoo = zooAt(nowMs / 1000);
  Object.assign(player, { x: zoo.x, y: zoo.y });
  player.profile.coins = 100000;
  return { game, player, inbox, zoo };
}

function withPet(game, player, petId) {
  player.profile.pets.push(petId);
  game.handleMessage(player, { t: MSG.EQUIP, item: petId });
}

function reelingLine(player, extra = {}) {
  player.line = {
    state: FishingState.REELING, x: 1500, y: 1450, zoneId: 'deep', fish: { species: 'carp', kg: 4 },
    progress: 0.5, tension: 0, reeling: false, pulling: false, pullTimer: 99, fight: 0.4, reelSpeed: 1, lineStrength: 1, drag: 1, ...extra,
  };
}

test('pets: 30 of them, 5 per rarity, each with its own ability', () => {
  assert.equal(PET_IDS.length, 30);
  assert.equal(Object.keys(PET_RARITIES).length, 6);
  for (const rarity of Object.keys(PET_RARITIES)) {
    assert.equal(PET_IDS.filter((id) => PETS[id].rarity === rarity).length, 5, rarity);
  }
  assert.equal(new Set(PET_IDS.map((id) => PETS[id].ability)).size, 30, 'abilities are unique');
  for (const id of PET_IDS) assert.ok(!ITEMS[id] && !ARMOUR[id] && id !== 'chum', `${id} id clashes with an item`);
  for (const spot of ZOO.spots) assert.ok(isWalkable(world, spot.x, spot.y), `zoo spot ${spot.area}`);
  assert.ok(petPrice('dragon') > petPrice('owl') && petPrice('owl') > petPrice('snail'));
});

test('zoo: 3 different pets that change every 15 minutes, the same for everyone', () => {
  const t = 1_800_000_000;
  const a = zooAt(t);
  assert.deepEqual(zooAt(t + 600).stock, a.stock, 'same stock all period');
  assert.equal(new Set(a.stock).size, ZOO.stockSize);
  const b = zooAt(t + ZOO.interval);
  assert.notEqual(b.period, a.period);
  assert.notDeepEqual([b.x, b.y], [a.x, a.y], 'the zoo travels');

  // Over many visits every pet turns up, and legendaries are the rarest.
  const seen = new Set();
  const byRarity = {};
  for (let p = 0; p < 3000; p++) {
    for (const id of zooAt(p * ZOO.interval).stock) {
      seen.add(id);
      byRarity[PETS[id].rarity] = (byRarity[PETS[id].rarity] || 0) + 1;
    }
  }
  assert.equal(seen.size, 30);
  assert.ok(byRarity.common > byRarity.uncommon && byRarity.uncommon > byRarity.rare && byRarity.rare > byRarity.epic && byRarity.epic > byRarity.legendary && byRarity.legendary > byRarity.mythic);
});

test('zoo: buy only what is in stock, only at the wagon; one pet with you at a time', () => {
  const { game, player, inbox, zoo } = atZoo();
  const p = player.profile;
  const notInStock = PET_IDS.find((id) => !zoo.stock.includes(id));
  game.handleMessage(player, { t: MSG.BUY, item: notInStock });
  assert.ok(!p.pets.includes(notInStock));
  assert.match(inbox.at(-1).message, /doesn't have/);

  const [first, second] = zoo.stock;
  game.handleMessage(player, { t: MSG.BUY, item: first });
  assert.deepEqual(p.pets, [first]);
  assert.equal(p.pet, first);
  assert.equal(p.coins, 100000 - petPrice(first));
  game.handleMessage(player, { t: MSG.BUY, item: first });
  assert.equal(p.pets.length, 1, 'no duplicates');

  Object.assign(player, { x: zoo.x + ZOO.range + 100 });
  game.handleMessage(player, { t: MSG.BUY, item: second });
  assert.ok(!p.pets.includes(second), 'must be at the zoo');

  game.handleMessage(player, { t: MSG.EQUIP, item: first });
  assert.equal(p.pet, null, 'send it home');
  game.handleMessage(player, { t: MSG.EQUIP, item: first });
  assert.equal(game.snapshot().players[0].pt, first, 'others can see your pet');
  assert.ok(game.snapshot().zoo.stock.length === 3);
});

test('pet abilities: bait saving, coin finds and rescued fish', () => {
  const { game, player, inbox } = atZoo(() => 0); // every chance succeeds
  const p = player.profile;
  p.bait.worms = 5;
  p.equipped.bait = 'worms';
  withPet(game, player, 'unicorn');
  game.useBait(player);
  assert.equal(p.bait.worms, 5, 'Unicorn saved the bait');

  withPet(game, player, 'raccoon');
  const coins = p.coins;
  reelingLine(player, { progress: 0.999, reeling: true });
  game.tick(0.05);
  const caught = game.drainEvents().find((e) => e.kind === 'catch');
  assert.ok(inbox.some((m) => m.kind === 'petFind'));
  assert.ok(caught.coins > Math.round(caught.points * 1.25), 'found coins on top');
  assert.ok(p.coins - coins >= caught.coins);

  withPet(game, player, 'peacock');
  reelingLine(player, { tension: 1.2 });
  game.tick(0.05);
  assert.ok(inbox.some((m) => m.kind === 'petRescue'));
  assert.ok(game.drainEvents().some((e) => e.kind === 'catch'), 'snapped fish caught anyway');
});

test('pet abilities: cast range, bite window, specialties; off in duels', () => {
  const kf = combineBonuses(computeArmour({}), 'kingfisher');
  assert.equal(kf.castRange, 40);
  const { game, player } = atZoo();
  Object.assign(player, { x: 1600, y: 1900 }); // on the dock, casting east over open water
  withPet(game, player, 'kingfisher');
  game.handleMessage(player, { t: MSG.CAST, angle: 0, power: 1 });
  assert.equal(Math.round(player.line.x - 1600), Math.round(castDistance(1, player.stats.castRange + 40)));

  withPet(game, player, 'flamingo');
  player.line = { state: FishingState.WAITING, x: 1500, y: 1450, zoneId: 'deep', timer: 0.01 };
  game.tick(0.05);
  assert.ok(player.line.timer > BITE_WINDOW, 'more time to hook');

  const kraken = combineBonuses(computeArmour({}), 'kraken');
  assert.equal(kraken.affinity.leviathan, 3);

  player.duel = { phase: 'live', a: player, b: player, scores: new Map([[player.id, 0]]), timer: 60 };
  assert.equal(game.armourOf(player), NO_ARMOUR);
  assert.equal(game.snapshot().players[0].pt, undefined, 'pets stay home during duels');
});

test('mythic pets: the rarest and priciest; their boosts stack with armour', () => {
  const mythic = PET_IDS.filter((id) => PETS[id].rarity === 'mythic');
  assert.equal(mythic.length, 5);
  assert.ok(petPrice('starwhale') > petPrice('dragon'));
  const b = combineBonuses(NO_ARMOUR, 'wyrmling');
  assert.equal(b.mythic, 3);
  assert.equal(combineBonuses(NO_ARMOUR, 'starwhale').mythic, 2);
  assert.equal(combineBonuses(NO_ARMOUR, null).mythic, 1);
});
