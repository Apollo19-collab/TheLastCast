// Armour: what your angler wears, separate from tackle. Four slots (hat,
// jacket, waders, boots); pieces unlock with your level (levels.js) and are
// bought with coins. Each piece gives a small bonus. Wear all four pieces of
// one set for its set effect: double catches, bigger fish, a line that holds...
//
// Bonuses (per piece, added up):  coins, xp, bite, rare, reel: +fraction
//   tension: line tension builds this much slower; weight: fish grow bigger
// Set effects are in SETS[...].effect (see computeArmour for what each does).
// Armour is switched off in duels, which use matched tackle.

export const ARMOUR_SLOTS = ['head', 'body', 'legs', 'feet'];
export const ARMOUR_SLOT_LABELS = { head: 'Hat', body: 'Jacket', legs: 'Waders', feet: 'Boots' };

// look: how it's drawn on your angler (client/js/gfx/characters.js).
export const SETS = Object.freeze({
  canvas: {
    name: 'Canvas Workwear', level: 2, price: 60, perk: { coins: 0.02 },
    effect: { name: 'Penny Pincher', desc: '+10% coins from every catch.', coins: 0.1 },
    pieces: { head: 'Canvas Bucket Hat', body: 'Canvas Jacket', legs: 'Canvas Waders', feet: 'Canvas Boots' },
    look: { hat: 'bucket', hatColor: '#c2a878', jacket: '#a68a5b', boots: '#5b4636' },
  },
  oilskin: {
    name: 'Oilskin', level: 6, price: 150, perk: { tension: 0.03 },
    effect: { name: 'Steady Hands', desc: 'Line tension builds 15% slower.', tension: 0.15 },
    pieces: { head: 'Oilskin Sou\'wester', body: 'Oilskin Coat', legs: 'Oilskin Bib Waders', feet: 'Rubber Boots' },
    look: { hat: 'souwester', hatColor: '#f2c94c', jacket: '#e0b030', boots: '#2b2d42' },
  },
  reedwalker: {
    name: 'Reedwalker', level: 10, price: 300, perk: { bite: 0.03 },
    effect: { name: 'Weed Whisperer', desc: 'Bites 30% faster in the Reed Bed, Weedy Cove and Lily Marsh.', zoneBite: 0.3, zones: ['reeds', 'weedyCove', 'marsh'] },
    pieces: { head: 'Reed Hat', body: 'Camo Smock', legs: 'Marsh Waders', feet: 'Mud Boots' },
    look: { hat: 'straw', hatColor: '#6a8f3a', jacket: '#55703a', boots: '#3b3a26' },
  },
  clover: {
    name: 'Four-Leaf', level: 15, price: 500, perk: { rare: 0.03 },
    effect: { name: 'Double Catch', desc: '10% chance to land a second fish of the same kind.', double: 0.1 },
    pieces: { head: 'Lucky Cap', body: 'Clover Vest', legs: 'Lucky Waders', feet: 'Horseshoe Boots' },
    look: { hat: 'cap', hatColor: '#2d9d4a', jacket: '#3fb95f', boots: '#1f5130' },
  },
  seadog: {
    name: 'Sea Dog', level: 20, price: 800, perk: { xp: 0.03 },
    effect: { name: 'Old Sea Dog', desc: '+30% points, coins and XP on boat voyages.', sea: 0.3 },
    pieces: { head: 'Captain\'s Cap', body: 'Pea Coat', legs: 'Deck Trousers', feet: 'Deck Boots' },
    look: { hat: 'captain', hatColor: '#1d3557', jacket: '#22335c', boots: '#111111' },
  },
  trophy: {
    name: 'Trophy Hunter', level: 26, price: 1200, perk: { weight: 0.03 },
    effect: { name: 'Heavy Hitter', desc: 'Fish run much bigger (and bigger fish score more).', weight: 0.35 },
    pieces: { head: 'Hunter\'s Hat', body: 'Trophy Vest', legs: 'Hunter\'s Waders', feet: 'Hobnail Boots' },
    look: { hat: 'bucket', hatColor: '#8d5524', jacket: '#b5651d', boots: '#4a2c17' },
  },
  storm: {
    name: 'Stormbreaker', level: 32, price: 1800, perk: { reel: 0.03 },
    effect: { name: 'Second Wind', desc: '25% chance a snapping line holds on.', snapSave: 0.25 },
    pieces: { head: 'Storm Hood', body: 'Storm Shell', legs: 'Storm Waders', feet: 'Storm Boots' },
    look: { hat: 'beanie', hatColor: '#4cc9f0', jacket: '#3a4a6b', boots: '#1b263b' },
  },
  mariner: {
    name: 'Grand Mariner', level: 38, price: 2600, perk: { xp: 0.04 },
    effect: { name: 'Scholar of the Deep', desc: '+25% XP and bites 15% faster.', xp: 0.25, bite: 0.15 },
    pieces: { head: 'Mariner\'s Tricorn', body: 'Mariner\'s Greatcoat', legs: 'Mariner\'s Breeches', feet: 'Mariner\'s Boots' },
    look: { hat: 'tricorn', hatColor: '#3c1642', jacket: '#5a189a', boots: '#240046', trim: '#ffd166' },
  },
  legend: {
    name: 'Legend\'s Regalia', level: 44, price: 3600, perk: { rare: 0.04 },
    effect: { name: 'Fortune\'s Favourite', desc: '20% chance of a Double Catch and rare odds ×1.3.', double: 0.2, rare: 0.3 },
    pieces: { head: 'Legend\'s Circlet', body: 'Legend\'s Mantle', legs: 'Legend\'s Waders', feet: 'Legend\'s Boots' },
    look: { hat: 'crown', hatColor: '#c77dff', jacket: '#7b2cbf', boots: '#3c096c', trim: '#e0aaff', glow: '#c77dff' },
  },
  golden: {
    name: 'Golden Angler', level: 50, price: 5000, perk: { coins: 0.05 },
    effect: { name: 'Golden Touch', desc: '25% chance of a Double Catch, +25% coins and XP, and legendary fish 1.5× as likely.', double: 0.25, coins: 0.25, xp: 0.25, legendary: 0.5 },
    pieces: { head: 'Golden Crown', body: 'Golden Coat', legs: 'Golden Waders', feet: 'Golden Boots' },
    look: { hat: 'crown', hatColor: '#ffd166', jacket: '#e9b949', boots: '#b8860b', trim: '#fff3b0', glow: '#ffd166' },
  },
});

// Every piece: id "<set>_<slot>", e.g. "clover_head".
export const ARMOUR = Object.freeze(Object.fromEntries(Object.entries(SETS).flatMap(([setId, set]) =>
  ARMOUR_SLOTS.map((slot) => [`${setId}_${slot}`, { set: setId, slot, name: set.pieces[slot], level: set.level, price: set.price, perk: set.perk }]))));

export function emptyArmour() {
  return { head: null, body: null, legs: null, feet: null };
}

/** Bonuses that do nothing: no armour, or armour switched off (duels). */
export const NO_ARMOUR = Object.freeze({
  coins: 1, xp: 1, bite: 1, rare: 1, tension: 1, reel: 1, weight: 1,
  double: 0, snapSave: 0, sea: 1, legendary: 1, zoneBites: [], set: null, pieces: 0,
  // pet abilities (see combineBonuses in pets.js)
  fight: 1, hotspot: 1, affinity: null, baitSave: 0, rescue: 0, find: null, biteWindow: 0, castRange: 0, hold: 1, pet: null,
});

/** The combined effect of what someone is wearing ({ head: 'clover_head', ... }). */
export function computeArmour(worn) {
  const add = { coins: 0, xp: 0, bite: 0, rare: 0, tension: 0, reel: 0, weight: 0 };
  const sets = {};
  let pieces = 0;
  for (const slot of ARMOUR_SLOTS) {
    const it = ARMOUR[worn?.[slot]];
    if (!it || it.slot !== slot) continue;
    pieces++;
    sets[it.set] = (sets[it.set] || 0) + 1;
    for (const [k, v] of Object.entries(it.perk)) add[k] += v;
  }
  const setId = Object.keys(sets).find((id) => sets[id] === ARMOUR_SLOTS.length) ?? null;
  const e = setId ? SETS[setId].effect : {};
  const r = (v) => Math.round(v * 1000) / 1000;
  return {
    coins: r(1 + add.coins + (e.coins || 0)),
    xp: r(1 + add.xp + (e.xp || 0)),
    bite: r(1 + add.bite + (e.bite || 0)),
    rare: r(1 + add.rare + (e.rare || 0)),
    tension: r(1 / (1 + add.tension + (e.tension || 0))), // multiplier on how fast tension builds
    reel: r(1 + add.reel),
    weight: r(1 + add.weight + (e.weight || 0)),
    double: e.double || 0,
    snapSave: e.snapSave || 0,
    sea: 1 + (e.sea || 0),
    legendary: 1 + (e.legendary || 0),
    zoneBites: e.zoneBite ? [{ zones: e.zones, mult: 1 + e.zoneBite }] : [],
    set: setId,
    pieces,
  };
}

/** Pieces a level unlocks (for the level-up message). */
export function unlockedAt(level) {
  return Object.values(SETS).filter((s) => s.level === level).map((s) => s.name);
}
