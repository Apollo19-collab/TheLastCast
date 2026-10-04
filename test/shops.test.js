// The three travelling tackle shops and their stock.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Game } from '../server/game.js';
import { MSG } from '../shared/constants.js';
import { ITEMS, SLOTS, computeStats, shopStock } from '../shared/gear.js';
import { xpForLevel } from '../shared/levels.js';
import { LOCATIONS, isWalkable, isWater } from '../shared/world.js';

const world = LOCATIONS.mirrorLake;
const TACKLE_SHOPS = world.shops.filter((s) => s.kind === 'tackle');

function seeded(seed = 1) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function shopper({ level = 75, coins = 100000 } = {}) {
  const game = new Game({ world, rng: seeded(7) });
  const inbox = [];
  const player = game.addPlayer('Shopper', (m) => inbox.push(m));
  player.profile.xp = xpForLevel(level);
  player.profile.coins = coins;
  return { game, player, inbox, p: player.profile };
}

test('three tackle shops, far apart out in the wilds, each by the water and reachable on foot', () => {
  assert.equal(TACKLE_SHOPS.length, 3);
  for (const s of TACKLE_SHOPS) {
    assert.ok(Math.hypot(s.x - world.spawn.x, s.y - world.spawn.y) > 4000, `${s.name} is a journey from the spawn`);
    // You can stand at the counter, and there's water close by to try your new tackle.
    let stand = false;
    let water = false;
    for (let a = 0; a < 24; a++) {
      const ang = (a / 24) * Math.PI * 2;
      if (isWalkable(world, s.x + Math.cos(ang) * (s.range - 15), s.y + Math.sin(ang) * (s.range - 15))) stand = true;
      if (isWater(world, s.x + Math.cos(ang) * 200, s.y + Math.sin(ang) * 200)) water = true;
    }
    assert.ok(stand && water, s.name);
    for (const t of TACKLE_SHOPS) if (t !== s) assert.ok(Math.hypot(s.x - t.x, s.y - t.y) > 3000, `${s.name} / ${t.name}`);
  }

  // Flood-fill from the spawn: every shop can be walked to.
  const step = 40;
  const key = (x, y) => x * 100000 + y;
  const start = [Math.round(world.spawn.x / step) * step, Math.round(world.spawn.y / step) * step];
  const seen = new Set([key(...start)]);
  const queue = [start];
  while (queue.length) {
    const [x, y] = queue.pop();
    for (const [dx, dy] of [[step, 0], [-step, 0], [0, step], [0, -step]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (seen.has(key(nx, ny)) || nx < 0 || ny < 0 || nx > world.width || ny > world.height || !isWalkable(world, nx, ny)) continue;
      seen.add(key(nx, ny));
      queue.push([nx, ny]);
    }
  }
  for (const s of TACKLE_SHOPS) {
    let reached = false;
    for (let dx = -s.range; dx <= s.range && !reached; dx += step / 2) {
      for (let dy = -s.range; dy <= s.range && !reached; dy += step / 2) {
        const x = Math.round((s.x + dx) / step) * step;
        const y = Math.round((s.y + dy) / step) * step;
        if (Math.hypot(x - s.x, y - s.y) <= s.range && seen.has(key(x, y))) reached = true;
      }
    }
    assert.ok(reached, `${s.name} is reachable`);
  }
});

test('each shop has its own stock: rods, reels, lines and bait, none of it sold anywhere else', () => {
  const seen = new Set();
  for (const s of TACKLE_SHOPS) {
    const stock = shopStock(s.id);
    for (const slot of SLOTS) assert.ok(stock.some((it) => it.slot === slot), `${s.name} sells a ${slot}`);
    for (const it of stock) {
      assert.ok(!seen.has(it.id));
      seen.add(it.id);
      assert.ok(it.level >= 10 && it.level <= 75, `${it.id} level`);
      assert.ok(!it.unlock, `${it.id}: the journey is the unlock`);
    }
  }
  for (const it of Object.values(ITEMS)) if (it.shop) assert.ok(TACKLE_SHOPS.some((s) => s.id === it.shop), `${it.name} -> ${it.shop}`);
  // The shops get harder to reach and sell later gear: finesse, then big game, then the Ember Curio.
  const minLevel = (id) => Math.min(...shopStock(id).map((it) => it.level));
  assert.ok(minLevel('stillwater') < minLevel('silvermere') && minLevel('silvermere') < minLevel('ember'));
});

test('buying: only at the shop, only at the level, then usable anywhere', () => {
  const { game, player, inbox, p } = shopper({ level: 30 });
  const shop = world.shops.find((s) => s.id === 'silvermere');
  game.handleMessage(player, { t: MSG.BUY, item: 'ironwood' });
  assert.ok(!p.inventory.includes('ironwood'), 'not from the beach');
  assert.match(inbox.filter((m) => m.kind === 'shop').at(-1).message, /Silvermere Outfitters/);

  Object.assign(player, { x: shop.x, y: shop.y + shop.range - 10 });
  game.handleMessage(player, { t: MSG.BUY, item: 'ironwood' });
  assert.ok(p.inventory.includes('ironwood'));
  assert.equal(p.equipped.rod, 'ironwood');
  game.handleMessage(player, { t: MSG.BUY, item: 'titanrod' });
  assert.ok(!p.inventory.includes('titanrod'), 'level 60 needed');
  assert.match(inbox.filter((m) => m.kind === 'shop').at(-1).message, /level 60/);
  game.handleMessage(player, { t: MSG.BUY, item: 'emberwood' });
  assert.ok(!p.inventory.includes('emberwood'), 'the Ember Curio sells that');

  // Its own bait, by the pack, at the shop.
  game.handleMessage(player, { t: MSG.BUY, item: 'cutbait', packs: 1 });
  assert.equal(p.bait.cutbait, ITEMS.cutbait.pack);

  // Back home, the rod still works.
  Object.assign(player, { x: world.spawn.x, y: world.spawn.y });
  game.handleMessage(player, { t: MSG.EQUIP, item: 'willow' });
  game.handleMessage(player, { t: MSG.EQUIP, item: 'ironwood' });
  assert.equal(p.equipped.rod, 'ironwood');
  assert.equal(player.stats.lineStrength, ITEMS.ironwood.power * ITEMS[p.equipped.line].strength);
});

test('shop tackle is a real step up at its level, but never wildly ahead of the rest', () => {
  // Each shop's best loadout against the best achievement tackle.
  const starforged = computeStats({ rod: 'starrod', reel: 'starreel', line: 'starline', bait: 'stardust' });
  const phoenix = computeStats({ rod: 'phoenixrod', reel: 'phoenixreel', line: 'phoenixsilk', bait: 'moonbait' });
  const titan = computeStats({ rod: 'titanrod', reel: 'titanreel', line: 'titancable', bait: 'liveshad' });
  const finesse = computeStats({ rod: 'silkstream', reel: 'whisperreel', line: 'mirageline', bait: 'microjig' });
  assert.ok(phoenix.reelSpeed > starforged.reelSpeed && phoenix.rareBoost > starforged.rareBoost, 'max-level tackle beats Starforged');
  assert.ok(phoenix.rareBoost < starforged.rareBoost * 1.4);
  assert.ok(titan.lineStrength > phoenix.lineStrength && titan.drag > phoenix.drag, 'Titan: the strongest');
  assert.ok(titan.lineStrength < starforged.lineStrength * 1.35);
  assert.ok(titan.biteSpeed < phoenix.biteSpeed, '...but shy fish notice it');
  assert.ok(finesse.biteSpeed > phoenix.biteSpeed, 'Finesse: the fastest bites');
  // Prices rise with level within each slot.
  for (const s of TACKLE_SHOPS) {
    for (const slot of ['rod', 'reel', 'line']) {
      const list = shopStock(s.id).filter((it) => it.slot === slot).sort((a, b) => a.level - b.level);
      for (let i = 1; i < list.length; i++) assert.ok(list[i].price > list[i - 1].price, `${list[i].id} costs more`);
    }
  }
});

test('every new item has its own look', async () => {
  const art = await readFile(new URL('../client/js/gfx/gearArt.js', import.meta.url), 'utf8');
  for (const [id, it] of Object.entries(ITEMS)) {
    if (it.shop) assert.match(art, new RegExp(`\\n  ${id}: \\{`), `${id} has a look in gearArt.js`);
  }
});

test("the Angler's Map: bought once, only at the Bait Shop, and kept", async () => {
  const { WORLD_MAP } = await import('../shared/constants.js');
  const { normalize } = await import('../server/profiles.js');
  const { game, player, inbox, p } = shopper({ level: 1, coins: 2000 });
  const bait = world.shops.find((s) => s.id === 'bait');
  Object.assign(player, { x: 6000, y: 6000 });
  game.handleMessage(player, { t: MSG.BUY, item: 'map' });
  assert.equal(p.worldMap, false, 'not out in the wilds');
  Object.assign(player, { x: bait.x, y: bait.y + bait.range - 10 });
  game.handleMessage(player, { t: MSG.BUY, item: 'map' });
  assert.equal(p.worldMap, true);
  assert.equal(p.coins, 2000 - WORLD_MAP.price);
  game.handleMessage(player, { t: MSG.BUY, item: 'map' });
  assert.equal(p.coins, 2000 - WORLD_MAP.price, 'only once');
  assert.match(inbox.filter((m) => m.kind === 'shop').at(-1).message, /already/);
  assert.equal(inbox.filter((m) => m.t === MSG.PROFILE).at(-1).worldMap, true, 'the client is told');
  assert.equal(normalize({ name: 'Old' }).worldMap, false);
  assert.equal(normalize({ ...p }).worldMap, true);
});
