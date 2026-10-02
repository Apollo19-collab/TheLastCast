// Tackle: every item a player can own, and how a loadout turns into stats.
//
// Players own any number of items and equip one per slot, mixing and matching
// freely. Items carry trade-offs (strong line spooks fish, light rods cast
// short) and specialties (`affinity`: more bites from certain fish families
// or species). Items with `unlock` can only be bought after earning that
// achievement (see achievements.js).
//
// Stats, per slot:
//   rod   range (cast distance), power (multiplies line strength), bite?, rare?
//   reel  speed (reel-in speed), drag (how fast tension eases), rare?
//   line  strength, bite? (lower = fish notice it), rare?
//   bait  bite (bite speed), rare (odds of uncommon/rare/legendary fish)
//   any   affinity: { familyOrSpeciesId: multiplier }

import { SPECIES } from './fish.js';

export const SLOTS = ['rod', 'reel', 'line', 'bait'];
export const SLOT_LABELS = { rod: 'Rods', reel: 'Reels', line: 'Lines', bait: 'Bait & lures' };

export const STARTER = Object.freeze({ rod: 'willow', reel: 'rusty', line: 'mono', bait: 'bread' });

const item = (slot, name, price, desc, stats = {}) => ({ slot, name, price, desc, ...stats });

export const ITEMS = Object.freeze({
  // ---- rods ----
  willow: item('rod', 'Willow Rod', 0, 'A bent stick with string.', { range: 240, power: 1.0 }),
  fiberglass: item('rod', 'Fiberglass Rod', 60, 'Longer casts, a bit tougher.', { range: 290, power: 1.15 }),
  ultralight: item('rod', 'Ultralight Rod', 120, 'Short and delicate, but you feel every nibble.', { range: 255, power: 0.9, bite: 1.2 }),
  carbon: item('rod', 'Carbon Rod', 200, 'Reach further out and fight harder fish.', { range: 340, power: 1.3 }),
  surfcaster: item('rod', 'Surf Caster', 450, 'A long rod for reaching far-off water.', { range: 430, power: 1.2, unlock: 'explorer' }),
  flyrod: item('rod', 'Fly Rod', 400, 'Trout and salmon can\'t resist a well-presented fly.', { range: 290, power: 1.1, affinity: { trout: 1.8 }, unlock: 'trout_bum' }),
  muskyrod: item('rod', 'Heavy Musky Rod', 700, 'Built for toothy fish that fight dirty.', { range: 320, power: 1.7, affinity: { pike: 1.5 }, unlock: 'toothy' }),
  master: item('rod', "Master's Rod", 1200, 'Reaches the far side of any hotspot.', { range: 400, power: 1.5, unlock: 'seasoned' }),
  sturgeonpole: item('rod', 'Sturgeon Pole', 1500, 'A tree trunk with guides. For the true giants.', { range: 330, power: 2.0, affinity: { ancient: 1.6, catfish: 1.4 }, unlock: 'deep_diver' }),
  deepsea: item('rod', 'Deep Sea Rod', 900, 'A stout boat rod for big ocean fish.', { range: 360, power: 1.8, affinity: { sea: 1.4 }, unlock: 'sea_legs' }),
  legendrod: item('rod', "Legend's Rod", 3000, 'Said to have landed the Pale Ghost itself.', { range: 440, power: 1.8, rare: 1.25, unlock: 'living_legend' }),

  // ---- reels ----
  rusty: item('reel', 'Rusty Reel', 0, 'It turns. Mostly.', { speed: 1.0 }),
  spinning: item('reel', 'Spinning Reel', 50, 'Reel fish in faster.', { speed: 1.2 }),
  baitcaster: item('reel', 'Baitcaster', 180, 'Even faster retrieves.', { speed: 1.4 }),
  smoothdrag: item('reel', 'Smooth Drag Reel', 300, 'Gives line gracefully: tension eases much faster.', { speed: 1.25, drag: 1.5, unlock: 'trophy_hunter' }),
  tournament: item('reel', 'Tournament Reel', 500, 'Big fish barely get a chance.', { speed: 1.65, unlock: 'dedicated' }),
  centerpin: item('reel', 'Centerpin Reel', 650, 'A river angler\'s reel: drifts baits naturally in current.', { speed: 1.35, affinity: { steelhead: 1.8, chinook: 1.8, mooneye: 1.5, riverking: 1.5 }, unlock: 'river_rat' }),
  biggame: item('reel', 'Big Game Reel', 1100, 'Brakes like a truck.', { speed: 1.5, drag: 1.6, unlock: 'heavyweight' }),
  golden: item('reel', 'Golden Reel', 2500, 'Smooth as butter, fast as lightning.', { speed: 1.9, drag: 1.3, rare: 1.1, unlock: 'collector' }),

  // ---- lines ----
  mono: item('line', 'Old Mono', 0, 'Brittle and a bit cloudy.', { strength: 1.0 }),
  freshmono: item('line', 'Fresh Mono', 40, 'Simple, reliable line.', { strength: 1.12 }),
  fluoro: item('line', 'Fluorocarbon', 150, 'Nearly invisible underwater: more bites.', { strength: 1.15, bite: 1.15 }),
  braid: item('line', 'Braided Line', 250, 'Very strong, but wary fish notice it.', { strength: 1.45, bite: 0.88 }),
  stealth: item('line', 'Stealth Leader', 500, 'Ghost-thin. Fish never see it coming.', { strength: 1.05, bite: 1.35, unlock: 'hotspot_hopper' }),
  steel: item('line', 'Steel Leader', 600, 'Teeth can\'t cut it.', { strength: 1.6, bite: 0.95, affinity: { pike: 1.3 }, unlock: 'toothy' }),
  spectral: item('line', 'Spectral Line', 2000, 'Spun from something pale and cold.', { strength: 1.6, bite: 1.25, rare: 1.2, unlock: 'ghost_hunter' }),

  // ---- bait & lures: consumables, bought in packs at the Bait Shop ----
  // price is per pack of `pack` uses. One use goes each time a fish bites.
  // Bread Crumbs are free and never run out.
  bread: item('bait', 'Bread Crumbs', 0, 'Fish are not impressed. Free and endless.', { bite: 1.0, rare: 1.0 }),
  worms: item('bait', 'Earthworms', 25, 'Faster bites.', { bite: 1.25, rare: 1.2, pack: 25 }),
  corn: item('bait', 'Sweet Corn', 30, 'Carp, tench and koi love it.', { bite: 1.2, rare: 1.0, affinity: { carp: 2.5 }, pack: 25 }),
  nightcrawler: item('bait', 'Nightcrawlers', 40, 'Big juicy worms for catfish and burbot.', { bite: 1.3, rare: 1.15, affinity: { catfish: 2.2 }, pack: 20 }),
  spinner: item('bait', 'Spinner Lure', 60, 'Attracts uncommon and rare fish.', { bite: 1.4, rare: 1.5, pack: 15 }),
  roe: item('bait', 'Salmon Roe', 60, 'Irresistible to trout and salmon.', { bite: 1.3, rare: 1.3, affinity: { trout: 2.0 }, pack: 20, unlock: 'trout_bum' }),
  frog: item('bait', 'Frog Popper', 60, 'Explodes off the surface in the weeds.', { bite: 1.2, rare: 1.6, affinity: { bass: 1.8, pike: 1.8 }, pack: 10, unlock: 'weed_warrior' }),
  goldlure: item('bait', 'Golden Lure', 120, 'Legends have been seen chasing it.', { bite: 1.6, rare: 2.0, pack: 10, unlock: 'dedicated' }),
  minnow: item('bait', 'Live Minnow', 120, 'Nothing beats the real thing.', { bite: 1.8, rare: 1.6, pack: 20, unlock: 'bait_shop' }),
  glowjig: item('bait', 'Glow Jig', 120, 'Shines in the dark deep water.', { bite: 1.4, rare: 2.2, affinity: { ancient: 1.5, whitefish: 1.5 }, pack: 10, unlock: 'deep_diver' }),
  squid: item('bait', 'Squid Strips', 100, "Tough, smelly bait that sea fish can't ignore.", { bite: 1.4, rare: 1.5, affinity: { sea: 1.8 }, pack: 20, unlock: 'old_salt' }),
  mythicfly: item('bait', 'Mythic Fly', 250, 'Tied from a legend\'s feather.', { bite: 1.5, rare: 3.0, pack: 5, unlock: 'living_legend' }),
});

/** Bait and lures are used up (all but the free starter bait). */
export function isConsumable(itemId) {
  return ITEMS[itemId]?.slot === 'bait' && itemId !== STARTER.bait;
}

// Buying several packs at once is cheaper.
export const BULK_PACKS = 5;
export const BULK_DISCOUNT = 0.1;

/** Coins for `packs` packs of a consumable (1 or BULK_PACKS). */
export function packPrice(itemId, packs = 1) {
  const price = ITEMS[itemId].price * packs;
  return packs >= BULK_PACKS ? Math.round(price * (1 - BULK_DISCOUNT)) : price;
}

/** How many of a bait a profile has: Infinity for the free starter bait. */
export function baitCount(profile, itemId) {
  if (!isConsumable(itemId)) return itemId === STARTER.bait ? Infinity : 0;
  return profile?.bait?.[itemId] || 0;
}

export function itemsForSlot(slot) {
  return Object.entries(ITEMS).filter(([, it]) => it.slot === slot).map(([id, it]) => ({ id, ...it }));
}

export function starterInventory() {
  return Object.values(STARTER);
}

/** Combined stats for a loadout like { rod: 'carbon', reel: 'spinning', line: 'braid', bait: 'corn' }. */
export function computeStats(equipped) {
  const get = (slot) => {
    const it = ITEMS[equipped?.[slot]];
    return it && it.slot === slot ? it : ITEMS[STARTER[slot]];
  };
  const rod = get('rod');
  const reel = get('reel');
  const line = get('line');
  const bait = get('bait');
  const affinity = {};
  for (const it of [rod, reel, line, bait]) {
    for (const [key, mult] of Object.entries(it.affinity || {})) affinity[key] = (affinity[key] || 1) * mult;
  }
  const r = (v) => Math.round(v * 1000) / 1000;
  return {
    castRange: rod.range,
    lineStrength: r(rod.power * line.strength),
    reelSpeed: reel.speed,
    drag: reel.drag || 1,
    biteSpeed: r(bait.bite * (line.bite || 1) * (rod.bite || 1)),
    rareBoost: r(bait.rare * (line.rare || 1) * (rod.rare || 1) * (reel.rare || 1)),
    affinity,
  };
}

/** How much a loadout's specialties favour a species (family and species bonuses multiply). */
export function affinityFor(stats, speciesId) {
  const a = stats?.affinity;
  if (!a) return 1;
  return (a[SPECIES[speciesId]?.family] || 1) * (a[speciesId] || 1);
}
