// Tackle: every item a player can own, and how a loadout turns into stats.
//
// Players own any number of items and equip one per slot, mixing and matching
// freely. Items carry trade-offs (strong line spooks fish, light rods cast
// short) and specialties (`affinity`: more bites from certain fish families
// or species). Items with `unlock` can only be bought after earning that
// achievement (see achievements.js).
//
// Items with `shop` are only sold at that travelling tackle shop (world.js
// `shops`: out in the wilds, so you have to walk there), and items with
// `level` need that angler level. Each shop has its own stock:
//   stillwater  Stillwater Finesse Co. (Stillwater Lake): light, sensitive, stealthy
//   silvermere  Silvermere Outfitters (Silvermere): heavy big-game tackle
//   ember       The Ember Curio (Ember Lake, far east): rare and lucky endgame tackle
//
// Stats, per slot:
//   rod   range (cast distance), power (multiplies line strength), bite?, rare?
//   reel  speed (reel-in speed), drag (how fast tension eases), bite?, rare?
//   line  strength, bite? (lower = fish notice it), rare?
//   bait  bite (bite speed), rare (odds of uncommon/rare/legendary/mythic fish)
//   any   affinity: { familyOrSpeciesId: multiplier }

import { SPECIES } from './fish.js';

const MYTHIC_FISH = Object.keys(SPECIES).filter((id) => SPECIES[id].rarity === 'mythic');
const LEGENDARY_FISH = Object.keys(SPECIES).filter((id) => SPECIES[id].rarity === 'legendary');
const each = (ids, mult) => Object.fromEntries(ids.map((id) => [id, mult]));

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
  bamboo: item('rod', 'Split Bamboo Rod', 350, 'Hand-built and sensitive: a joy to fish with.', { range: 300, power: 1.25, bite: 1.15 }),
  surfcaster: item('rod', 'Surf Caster', 450, 'A long rod for reaching far-off water.', { range: 430, power: 1.2, unlock: 'explorer' }),
  flyrod: item('rod', 'Fly Rod', 400, 'Trout and salmon can\'t resist a well-presented fly.', { range: 290, power: 1.1, affinity: { trout: 1.8 }, unlock: 'trout_bum' }),
  muskyrod: item('rod', 'Heavy Musky Rod', 700, 'Built for toothy fish that fight dirty.', { range: 320, power: 1.7, affinity: { pike: 1.5 }, unlock: 'toothy' }),
  master: item('rod', "Master's Rod", 1200, 'Reaches the far side of any hotspot.', { range: 400, power: 1.5, unlock: 'seasoned' }),
  sturgeonpole: item('rod', 'Sturgeon Pole', 1500, 'A tree trunk with guides. For the true giants.', { range: 330, power: 2.0, affinity: { ancient: 1.6, catfish: 1.4 }, unlock: 'deep_diver' }),
  deepsea: item('rod', 'Deep Sea Rod', 900, 'A stout boat rod for big ocean fish.', { range: 360, power: 1.8, affinity: { sea: 1.4 }, unlock: 'sea_legs' }),
  legendrod: item('rod', "Legend's Rod", 3000, 'Said to have landed the Pale Ghost itself.', { range: 440, power: 1.8, rare: 1.25, unlock: 'living_legend' }),
  abyssrod: item('rod', 'Abyssal Rod', 5000, 'Forged from a boss\'s bones. Monsters of the deep beware.', { range: 420, power: 2.2, affinity: { sea: 1.5 }, unlock: 'monster_hunter' }),
  starrod: item('rod', 'Starforged Rod', 8000, 'Glows with the light of a fallen star. Made for mythic fish.', { range: 460, power: 2.4, rare: 1.35, unlock: 'mythic_hunter' }),
  // Stillwater Finesse Co.
  reedwhisper: item('rod', 'Reedwhisper Rod', 900, 'Light as a reed: you feel the faintest touch.', { range: 300, power: 1.2, bite: 1.25, shop: 'stillwater', level: 12 }),
  glassfeather: item('rod', 'Glass Feather Rod', 2200, 'A slow, soft blank that panfish never feel.', { range: 330, power: 1.3, bite: 1.3, affinity: { panfish: 1.6 }, shop: 'stillwater', level: 20 }),
  dropshot: item('rod', 'Drop-Shot Rod', 3500, 'Holds a bait dead still in front of perch and bass.', { range: 350, power: 1.45, bite: 1.2, affinity: { perch: 1.5, bass: 1.3 }, shop: 'stillwater', level: 28 }),
  silkstream: item('rod', 'Silkstream Fly Rod', 5200, 'Lays a fly down like a falling leaf.', { range: 330, power: 1.45, bite: 1.35, affinity: { trout: 2.0 }, shop: 'stillwater', level: 36 }),
  // Silvermere Outfitters
  ironwood: item('rod', 'Ironwood Rod', 2000, 'Dense, dark and nearly unbreakable.', { range: 360, power: 1.85, shop: 'silvermere', level: 20 }),
  silverheavy: item('rod', 'Silvermere Heavy', 4500, 'The outfitters\' own rod for catfish and sturgeon.', { range: 380, power: 2.05, affinity: { catfish: 1.4, ancient: 1.3 }, shop: 'silvermere', level: 32 }),
  leviathanpole: item('rod', 'Leviathan Pole', 9000, 'A harpoon with a reel seat. For things with no business being in a lake.', { range: 370, power: 2.35, affinity: { ancient: 1.6, sea: 1.3 }, shop: 'silvermere', level: 46 }),
  titanrod: item('rod', 'Titan Rod', 16000, 'The strongest rod ever built. A bit heavy-handed for shy fish.', { range: 400, power: 2.6, bite: 0.9, shop: 'silvermere', level: 60 }),
  // The Ember Curio
  emberwood: item('rod', 'Emberwood Rod', 7000, 'Warm to the touch. Rare fish rise to it.', { range: 420, power: 1.9, rare: 1.2, shop: 'ember', level: 42 }),
  runecarved: item('rod', 'Runecarved Rod', 12000, 'Old runes along the blank whisper to the deep.', { range: 440, power: 2.1, rare: 1.3, shop: 'ember', level: 52 }),
  moonlit: item('rod', 'Moonlit Rod', 18000, 'Silver in any light. Legends follow it.', { range: 430, power: 2.25, rare: 1.15, affinity: each(LEGENDARY_FISH, 1.6), shop: 'ember', level: 58 }),
  phoenixrod: item('rod', 'Phoenix Rod', 22000, 'Reborn from its own ashes. The finest rod in the land.', { range: 470, power: 2.5, bite: 1.1, rare: 1.4, shop: 'ember', level: 66 }),

  // ---- reels ----
  rusty: item('reel', 'Rusty Reel', 0, 'It turns. Mostly.', { speed: 1.0 }),
  spinning: item('reel', 'Spinning Reel', 50, 'Reel fish in faster.', { speed: 1.2 }),
  baitcaster: item('reel', 'Baitcaster', 180, 'Even faster retrieves.', { speed: 1.4 }),
  levelwind: item('reel', 'Levelwind Reel', 380, 'Lays line evenly: fast and forgiving.', { speed: 1.45, drag: 1.2 }),
  smoothdrag: item('reel', 'Smooth Drag Reel', 300, 'Gives line gracefully: tension eases much faster.', { speed: 1.25, drag: 1.5, unlock: 'trophy_hunter' }),
  tournament: item('reel', 'Tournament Reel', 500, 'Big fish barely get a chance.', { speed: 1.65, unlock: 'dedicated' }),
  centerpin: item('reel', 'Centerpin Reel', 650, 'A river angler\'s reel: drifts baits naturally in current.', { speed: 1.35, affinity: { steelhead: 1.8, chinook: 1.8, mooneye: 1.5, riverking: 1.5 }, unlock: 'river_rat' }),
  biggame: item('reel', 'Big Game Reel', 1100, 'Brakes like a truck.', { speed: 1.5, drag: 1.6, unlock: 'heavyweight' }),
  golden: item('reel', 'Golden Reel', 2500, 'Smooth as butter, fast as lightning.', { speed: 1.9, drag: 1.3, rare: 1.1, unlock: 'collector' }),
  stormreel: item('reel', 'Storm Reel', 4000, 'Crackles when it spins. Fish come in like lightning.', { speed: 2.05, drag: 1.6, unlock: 'lake_legend' }),
  starreel: item('reel', 'Starforged Reel', 7000, 'Spins like a comet and never jams.', { speed: 2.25, drag: 1.7, rare: 1.15, unlock: 'mythic_hunter' }),
  // Stillwater Finesse Co.
  featherreel: item('reel', 'Featherweight Reel', 800, 'Tiny, quick and smooth.', { speed: 1.5, drag: 1.1, shop: 'stillwater', level: 12 }),
  finessereel: item('reel', 'Finesse Spinner', 2400, 'A silky drag for light lines.', { speed: 1.7, drag: 1.35, shop: 'stillwater', level: 24 }),
  whisperreel: item('reel', 'Whisper Reel', 4800, 'So quiet the fish keep biting.', { speed: 1.85, drag: 1.5, bite: 1.1, shop: 'stillwater', level: 34 }),
  // Silvermere Outfitters
  winchreel: item('reel', 'Winch Reel', 2200, 'Low gears and a drag like a brake.', { speed: 1.55, drag: 1.8, shop: 'silvermere', level: 22 }),
  trollingreel: item('reel', 'Silvermere Trolling Reel', 5500, 'Holds a mile of line and never lets go.', { speed: 1.8, drag: 1.95, shop: 'silvermere', level: 38 }),
  titanreel: item('reel', 'Titan Reel', 15000, 'Hauls in anything that swims.', { speed: 2.1, drag: 2.2, shop: 'silvermere', level: 58 }),
  // The Ember Curio
  emberreel: item('reel', 'Ember Reel', 8000, 'Glows hotter the rarer the fish.', { speed: 1.95, drag: 1.5, rare: 1.1, shop: 'ember', level: 45 }),
  runicreel: item('reel', 'Runic Reel', 13000, 'Each turn of the handle traces a rune.', { speed: 2.15, drag: 1.65, rare: 1.15, shop: 'ember', level: 55 }),
  phoenixreel: item('reel', 'Phoenix Reel', 22000, 'Spins with a sound like wings.', { speed: 2.35, drag: 1.8, rare: 1.2, shop: 'ember', level: 68 }),

  // ---- lines ----
  mono: item('line', 'Old Mono', 0, 'Brittle and a bit cloudy.', { strength: 1.0 }),
  freshmono: item('line', 'Fresh Mono', 40, 'Simple, reliable line.', { strength: 1.12 }),
  fluoro: item('line', 'Fluorocarbon', 150, 'Nearly invisible underwater: more bites.', { strength: 1.15, bite: 1.15 }),
  braid: item('line', 'Braided Line', 250, 'Very strong, but wary fish notice it.', { strength: 1.45, bite: 0.88 }),
  copoly: item('line', 'Copolymer Line', 300, 'Strong and low-stretch, and fish barely notice it.', { strength: 1.3, bite: 1.05 }),
  stealth: item('line', 'Stealth Leader', 500, 'Ghost-thin. Fish never see it coming.', { strength: 1.05, bite: 1.35, unlock: 'hotspot_hopper' }),
  steel: item('line', 'Steel Leader', 600, 'Teeth can\'t cut it.', { strength: 1.6, bite: 0.95, affinity: { pike: 1.3 }, unlock: 'toothy' }),
  spectral: item('line', 'Spectral Line', 2000, 'Spun from something pale and cold.', { strength: 1.6, bite: 1.25, rare: 1.2, unlock: 'ghost_hunter' }),
  kevlar: item('line', 'Kevlar Line', 1500, 'Practically unbreakable, if a little visible.', { strength: 1.9, bite: 0.9, unlock: 'heavyweight' }),
  starline: item('line', 'Starforged Line', 6000, 'Woven from starlight: strong, invisible and lucky.', { strength: 1.9, bite: 1.3, rare: 1.25, unlock: 'mythic_hunter' }),
  // Stillwater Finesse Co.
  ghostfluoro: item('line', 'Ghost Fluoro', 1100, 'Fluorocarbon so clear it barely exists.', { strength: 1.25, bite: 1.3, shop: 'stillwater', level: 14 }),
  microbraid: item('line', 'Micro Braid', 2600, 'Braid as thin as hair: strong, and fish hardly notice.', { strength: 1.55, bite: 1.1, shop: 'stillwater', level: 26 }),
  mirageline: item('line', 'Mirage Line', 5000, 'It bends the light around itself.', { strength: 1.5, bite: 1.45, shop: 'stillwater', level: 36 }),
  // Silvermere Outfitters
  wirecore: item('line', 'Wire-Core Line', 2400, 'A steel heart in a nylon coat.', { strength: 1.75, bite: 0.85, shop: 'silvermere', level: 24 }),
  dyneema: item('line', 'Dyneema Braid', 6000, 'Stronger than steel, if fish can see it.', { strength: 2.05, bite: 0.9, shop: 'silvermere', level: 40 }),
  titancable: item('line', 'Titan Cable', 14000, 'You could moor a boat with it.', { strength: 2.25, bite: 0.85, shop: 'silvermere', level: 56 }),
  // The Ember Curio
  emberthread: item('line', 'Ember Thread', 7500, 'Spun from something that once burned.', { strength: 1.8, bite: 1.2, rare: 1.15, shop: 'ember', level: 44 }),
  runespun: item('line', 'Rune-Spun Line', 13000, 'Every metre is knotted with a charm.', { strength: 2.0, bite: 1.3, rare: 1.2, shop: 'ember', level: 54 }),
  phoenixsilk: item('line', 'Phoenix Silk', 24000, 'A single feather, unravelled.', { strength: 2.2, bite: 1.35, rare: 1.3, shop: 'ember', level: 70 }),

  // ---- bait & lures: consumables, bought in packs at the Bait Shop ----
  // price is per pack of `pack` uses. One use goes each time a fish bites.
  // Bread Crumbs are free and never run out.
  bread: item('bait', 'Bread Crumbs', 0, 'Fish are not impressed. Free and endless.', { bite: 1.0, rare: 1.0 }),
  worms: item('bait', 'Earthworms', 25, 'Faster bites.', { bite: 1.25, rare: 1.2, pack: 25 }),
  corn: item('bait', 'Sweet Corn', 30, 'Carp, tench and koi love it.', { bite: 1.2, rare: 1.0, affinity: { carp: 2.5 }, pack: 25 }),
  nightcrawler: item('bait', 'Nightcrawlers', 40, 'Big juicy worms for catfish and burbot.', { bite: 1.3, rare: 1.15, affinity: { catfish: 2.2 }, pack: 20 }),
  leech: item('bait', 'Leeches', 50, 'Perch, walleye and sauger can\'t resist them.', { bite: 1.35, rare: 1.25, affinity: { perch: 2.0 }, pack: 20 }),
  crayfish: item('bait', 'Crayfish', 70, 'A bass and pike favourite, crawling along the bottom.', { bite: 1.3, rare: 1.5, affinity: { bass: 2.0, pike: 1.4 }, pack: 15 }),
  spinner: item('bait', 'Spinner Lure', 60, 'Attracts uncommon and rare fish.', { bite: 1.4, rare: 1.5, pack: 15 }),
  roe: item('bait', 'Salmon Roe', 60, 'Irresistible to trout and salmon.', { bite: 1.3, rare: 1.3, affinity: { trout: 2.0 }, pack: 20, unlock: 'trout_bum' }),
  frog: item('bait', 'Frog Popper', 60, 'Explodes off the surface in the weeds.', { bite: 1.2, rare: 1.6, affinity: { bass: 1.8, pike: 1.8 }, pack: 10, unlock: 'weed_warrior' }),
  goldlure: item('bait', 'Golden Lure', 120, 'Legends have been seen chasing it.', { bite: 1.6, rare: 2.0, pack: 10, unlock: 'dedicated' }),
  minnow: item('bait', 'Live Minnow', 120, 'Nothing beats the real thing.', { bite: 1.8, rare: 1.6, pack: 20, unlock: 'bait_shop' }),
  glowjig: item('bait', 'Glow Jig', 120, 'Shines in the dark deep water.', { bite: 1.4, rare: 2.2, affinity: { ancient: 1.5, whitefish: 1.5 }, pack: 10, unlock: 'deep_diver' }),
  squid: item('bait', 'Squid Strips', 100, "Tough, smelly bait that sea fish can't ignore.", { bite: 1.4, rare: 1.5, affinity: { sea: 1.8 }, pack: 20, unlock: 'old_salt' }),
  mythicfly: item('bait', 'Mythic Fly', 250, 'Tied from a legend\'s feather.', { bite: 1.5, rare: 3.0, pack: 5, unlock: 'living_legend' }),
  // Sold only at the travelling tackle shops.
  waxworms: item('bait', 'Wax Worms', 45, 'Panfish and perch go mad for them.', { bite: 1.5, rare: 1.2, affinity: { panfish: 2.0, perch: 1.4 }, pack: 25, shop: 'stillwater', level: 12 }),
  microjig: item('bait', 'Micro Jig', 90, 'A tiny jig that twitches like a nymph.', { bite: 1.45, rare: 1.7, affinity: { bass: 1.3, perch: 1.3, trout: 1.3 }, pack: 15, shop: 'stillwater', level: 22 }),
  cutbait: item('bait', 'Cut Bait', 80, 'Oily chunks that big bottom-feeders smell from afar.', { bite: 1.4, rare: 1.6, affinity: { catfish: 2.0, ancient: 1.6 }, pack: 20, shop: 'silvermere', level: 20 }),
  liveshad: item('bait', 'Live Shad', 150, 'A big, lively baitfish for big, hungry predators.', { bite: 1.6, rare: 2.2, affinity: { pike: 1.6, ancient: 1.3 }, pack: 10, shop: 'silvermere', level: 34 }),
  embergrubs: item('bait', 'Ember Grubs', 200, 'They glow faintly in the dark. Rare fish can\'t resist.', { bite: 1.7, rare: 2.6, pack: 10, shop: 'ember', level: 42 }),
  moonbait: item('bait', 'Moonbait', 240, 'Gathered under a full moon. Legends rise to it.', { bite: 1.5, rare: 3.2, affinity: each(LEGENDARY_FISH, 2.0), pack: 5, shop: 'ember', level: 56 }),
  stardust: item('bait', 'Stardust Lure', 240, 'Sparkles like the night sky. Mythic fish 2.5× as likely.', { bite: 1.6, rare: 3.0, pack: 5, affinity: Object.fromEntries(MYTHIC_FISH.map((id) => [id, 2.5])), unlock: 'myth_seeker' }),
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

/** Everything a travelling tackle shop sells. */
export function shopStock(shopId) {
  return Object.entries(ITEMS).filter(([, it]) => it.shop === shopId).map(([id, it]) => ({ id, ...it }));
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
    biteSpeed: r(bait.bite * (line.bite || 1) * (rod.bite || 1) * (reel.bite || 1)),
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
