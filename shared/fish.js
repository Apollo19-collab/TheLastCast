// Fish species definitions. Pure data, so new species are added here only.
// Which species can bite where is decided by each water zone in world.js.

export const RARITY = Object.freeze({
  junk: { label: 'Junk', color: '#8a8a7a' },
  common: { label: 'Common', color: '#cfd8dc' },
  uncommon: { label: 'Uncommon', color: '#7bd389' },
  rare: { label: 'Rare', color: '#5ab0ff' },
  legendary: { label: 'Legendary', color: '#ffb347' },
});

// minKg/maxKg: weight range. family: used by achievements and bait/rod
// specialties. points: score for an average-sized catch.
// fight: 0..1, how hard the fish pulls while you reel it in.
// Keep ids stable: saved profiles reference them in the fish index.
export const SPECIES = Object.freeze({
  // Junk
  boot: { name: 'Old Boot', rarity: 'junk', minKg: 0.4, maxKg: 1.2, family: 'junk', points: 1, fight: 0.1 },

  // Common
  shiner: { name: 'Golden Shiner', rarity: 'common', minKg: 0.05, maxKg: 0.3, family: 'carp', points: 4, fight: 0.15 },
  pumpkinseed: { name: 'Pumpkinseed', rarity: 'common', minKg: 0.1, maxKg: 0.5, family: 'panfish', points: 5, fight: 0.2 },
  bluegill: { name: 'Bluegill', rarity: 'common', minKg: 0.1, maxKg: 0.6, family: 'panfish', points: 5, fight: 0.25 },
  rudd: { name: 'Rudd', rarity: 'common', minKg: 0.2, maxKg: 1.2, family: 'carp', points: 7, fight: 0.3 },
  perch: { name: 'Yellow Perch', rarity: 'common', minKg: 0.2, maxKg: 1.0, family: 'perch', points: 8, fight: 0.3 },
  crappie: { name: 'Black Crappie', rarity: 'common', minKg: 0.2, maxKg: 1.5, family: 'panfish', points: 9, fight: 0.3 },
  cisco: { name: 'Cisco', rarity: 'common', minKg: 0.3, maxKg: 1.5, family: 'whitefish', points: 10, fight: 0.35 },
  carp: { name: 'Common Carp', rarity: 'common', minKg: 1, maxKg: 9, family: 'carp', points: 12, fight: 0.5 },
  bullhead: { name: 'Brown Bullhead', rarity: 'common', minKg: 0.3, maxKg: 2, family: 'catfish', points: 9, fight: 0.35 },
  mooneye: { name: 'Mooneye', rarity: 'common', minKg: 0.3, maxKg: 1, family: 'whitefish', points: 10, fight: 0.4 },

  // Uncommon
  trout: { name: 'Rainbow Trout', rarity: 'uncommon', minKg: 0.5, maxKg: 4, family: 'trout', points: 20, fight: 0.55 },
  bass: { name: 'Largemouth Bass', rarity: 'uncommon', minKg: 0.5, maxKg: 5, family: 'bass', points: 22, fight: 0.6 },
  smallmouth: { name: 'Smallmouth Bass', rarity: 'uncommon', minKg: 0.5, maxKg: 3.5, family: 'bass', points: 24, fight: 0.65 },
  tench: { name: 'Tench', rarity: 'uncommon', minKg: 1, maxKg: 5, family: 'carp', points: 24, fight: 0.5 },
  bowfin: { name: 'Bowfin', rarity: 'uncommon', minKg: 1, maxKg: 6, family: 'ancient', points: 28, fight: 0.7 },
  whitefish: { name: 'Lake Whitefish', rarity: 'uncommon', minKg: 1, maxKg: 5, family: 'whitefish', points: 28, fight: 0.5 },
  walleye: { name: 'Walleye', rarity: 'uncommon', minKg: 1, maxKg: 6, family: 'perch', points: 30, fight: 0.6 },
  catfish: { name: 'Channel Catfish', rarity: 'uncommon', minKg: 2, maxKg: 15, family: 'catfish', points: 30, fight: 0.65 },
  gar: { name: 'Longnose Gar', rarity: 'uncommon', minKg: 2, maxKg: 10, family: 'ancient', points: 34, fight: 0.7 },
  pickerel: { name: 'Chain Pickerel', rarity: 'uncommon', minKg: 0.5, maxKg: 3, family: 'pike', points: 25, fight: 0.65 },
  brooktrout: { name: 'Brook Trout', rarity: 'uncommon', minKg: 0.3, maxKg: 3, family: 'trout', points: 26, fight: 0.55 },

  // Rare
  pike: { name: 'Northern Pike', rarity: 'rare', minKg: 2, maxKg: 12, family: 'pike', points: 45, fight: 0.75 },
  burbot: { name: 'Burbot', rarity: 'rare', minKg: 1, maxKg: 8, family: 'catfish', points: 50, fight: 0.7 },
  laketrout: { name: 'Lake Trout', rarity: 'rare', minKg: 3, maxKg: 20, family: 'trout', points: 60, fight: 0.8 },
  koi: { name: 'Escaped Koi', rarity: 'rare', minKg: 1, maxKg: 10, family: 'carp', points: 65, fight: 0.55 },
  muskie: { name: 'Muskellunge', rarity: 'rare', minKg: 5, maxKg: 25, family: 'pike', points: 70, fight: 0.85 },
  sturgeon: { name: 'Lake Sturgeon', rarity: 'rare', minKg: 10, maxKg: 40, family: 'ancient', points: 80, fight: 0.85 },
  steelhead: { name: 'Steelhead', rarity: 'rare', minKg: 2, maxKg: 9, family: 'trout', points: 55, fight: 0.85 },
  chinook: { name: 'Chinook Salmon', rarity: 'rare', minKg: 4, maxKg: 20, family: 'trout', points: 70, fight: 0.9 },

  // Legendary: one per special zone or location
  mossback: { name: 'Old Mossback', rarity: 'legendary', minKg: 20, maxKg: 35, family: 'pike', points: 250, fight: 0.95 },
  stonejaw: { name: 'Stonejaw', rarity: 'legendary', minKg: 15, maxKg: 40, family: 'trout', points: 260, fight: 0.95 },
  ghost: { name: 'The Pale Ghost', rarity: 'legendary', minKg: 20, maxKg: 60, family: 'ancient', points: 300, fight: 0.95 },
  frostfin: { name: 'Frostfin', rarity: 'legendary', minKg: 8, maxKg: 15, family: 'trout', points: 240, fight: 0.9 },
  marshqueen: { name: 'The Marsh Queen', rarity: 'legendary', minKg: 12, maxKg: 25, family: 'ancient', points: 250, fight: 0.95 },
  riverking: { name: 'The River King', rarity: 'legendary', minKg: 25, maxKg: 45, family: 'trout', points: 280, fight: 0.97 },
});

export const FAMILIES = Object.freeze({
  junk: 'Junk', panfish: 'Panfish', carp: 'Carp & minnows', perch: 'Perch & walleye', bass: 'Bass',
  trout: 'Trout & salmon', whitefish: 'Whitefish', pike: 'Pike', catfish: 'Catfish', ancient: 'Ancient fish',
});

/** Score for a fish of a given weight, plus any bonus multiplier. */
export function scoreCatch(speciesId, kg, multiplier = 1) {
  const s = SPECIES[speciesId];
  const frac = (kg - s.minKg) / Math.max(0.0001, s.maxKg - s.minKg);
  return Math.max(1, Math.round(s.points * (0.5 + 1.5 * frac) * multiplier));
}
