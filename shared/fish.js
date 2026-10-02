// Fish species definitions. Pure data, so new species are added here only.
// Which species can bite where is decided by each water zone in world.js.

export const RARITY = Object.freeze({
  junk: { label: 'Junk', color: '#8a8a7a' },
  common: { label: 'Common', color: '#cfd8dc' },
  uncommon: { label: 'Uncommon', color: '#7bd389' },
  rare: { label: 'Rare', color: '#5ab0ff' },
  legendary: { label: 'Legendary', color: '#ffb347' },
});

// minKg/maxKg: weight range. points: score for an average-sized catch.
// fight: 0..1, how hard the fish pulls while you reel it in.
// Keep ids stable: saved profiles reference them in the fish index.
export const SPECIES = Object.freeze({
  // Junk
  boot: { name: 'Old Boot', rarity: 'junk', minKg: 0.4, maxKg: 1.2, points: 1, fight: 0.1 },

  // Common
  shiner: { name: 'Golden Shiner', rarity: 'common', minKg: 0.05, maxKg: 0.3, points: 4, fight: 0.15 },
  pumpkinseed: { name: 'Pumpkinseed', rarity: 'common', minKg: 0.1, maxKg: 0.5, points: 5, fight: 0.2 },
  bluegill: { name: 'Bluegill', rarity: 'common', minKg: 0.1, maxKg: 0.6, points: 5, fight: 0.25 },
  rudd: { name: 'Rudd', rarity: 'common', minKg: 0.2, maxKg: 1.2, points: 7, fight: 0.3 },
  perch: { name: 'Yellow Perch', rarity: 'common', minKg: 0.2, maxKg: 1.0, points: 8, fight: 0.3 },
  crappie: { name: 'Black Crappie', rarity: 'common', minKg: 0.2, maxKg: 1.5, points: 9, fight: 0.3 },
  cisco: { name: 'Cisco', rarity: 'common', minKg: 0.3, maxKg: 1.5, points: 10, fight: 0.35 },
  carp: { name: 'Common Carp', rarity: 'common', minKg: 1, maxKg: 9, points: 12, fight: 0.5 },
  bullhead: { name: 'Brown Bullhead', rarity: 'common', minKg: 0.3, maxKg: 2, points: 9, fight: 0.35 },
  mooneye: { name: 'Mooneye', rarity: 'common', minKg: 0.3, maxKg: 1, points: 10, fight: 0.4 },

  // Uncommon
  trout: { name: 'Rainbow Trout', rarity: 'uncommon', minKg: 0.5, maxKg: 4, points: 20, fight: 0.55 },
  bass: { name: 'Largemouth Bass', rarity: 'uncommon', minKg: 0.5, maxKg: 5, points: 22, fight: 0.6 },
  smallmouth: { name: 'Smallmouth Bass', rarity: 'uncommon', minKg: 0.5, maxKg: 3.5, points: 24, fight: 0.65 },
  tench: { name: 'Tench', rarity: 'uncommon', minKg: 1, maxKg: 5, points: 24, fight: 0.5 },
  bowfin: { name: 'Bowfin', rarity: 'uncommon', minKg: 1, maxKg: 6, points: 28, fight: 0.7 },
  whitefish: { name: 'Lake Whitefish', rarity: 'uncommon', minKg: 1, maxKg: 5, points: 28, fight: 0.5 },
  walleye: { name: 'Walleye', rarity: 'uncommon', minKg: 1, maxKg: 6, points: 30, fight: 0.6 },
  catfish: { name: 'Channel Catfish', rarity: 'uncommon', minKg: 2, maxKg: 15, points: 30, fight: 0.65 },
  gar: { name: 'Longnose Gar', rarity: 'uncommon', minKg: 2, maxKg: 10, points: 34, fight: 0.7 },
  pickerel: { name: 'Chain Pickerel', rarity: 'uncommon', minKg: 0.5, maxKg: 3, points: 25, fight: 0.65 },
  brooktrout: { name: 'Brook Trout', rarity: 'uncommon', minKg: 0.3, maxKg: 3, points: 26, fight: 0.55 },

  // Rare
  pike: { name: 'Northern Pike', rarity: 'rare', minKg: 2, maxKg: 12, points: 45, fight: 0.75 },
  burbot: { name: 'Burbot', rarity: 'rare', minKg: 1, maxKg: 8, points: 50, fight: 0.7 },
  laketrout: { name: 'Lake Trout', rarity: 'rare', minKg: 3, maxKg: 20, points: 60, fight: 0.8 },
  koi: { name: 'Escaped Koi', rarity: 'rare', minKg: 1, maxKg: 10, points: 65, fight: 0.55 },
  muskie: { name: 'Muskellunge', rarity: 'rare', minKg: 5, maxKg: 25, points: 70, fight: 0.85 },
  sturgeon: { name: 'Lake Sturgeon', rarity: 'rare', minKg: 10, maxKg: 40, points: 80, fight: 0.85 },
  steelhead: { name: 'Steelhead', rarity: 'rare', minKg: 2, maxKg: 9, points: 55, fight: 0.85 },
  chinook: { name: 'Chinook Salmon', rarity: 'rare', minKg: 4, maxKg: 20, points: 70, fight: 0.9 },

  // Legendary: one per special zone or location
  mossback: { name: 'Old Mossback', rarity: 'legendary', minKg: 20, maxKg: 35, points: 250, fight: 0.95 },
  stonejaw: { name: 'Stonejaw', rarity: 'legendary', minKg: 15, maxKg: 40, points: 260, fight: 0.95 },
  ghost: { name: 'The Pale Ghost', rarity: 'legendary', minKg: 20, maxKg: 60, points: 300, fight: 0.95 },
  frostfin: { name: 'Frostfin', rarity: 'legendary', minKg: 8, maxKg: 15, points: 240, fight: 0.9 },
  marshqueen: { name: 'The Marsh Queen', rarity: 'legendary', minKg: 12, maxKg: 25, points: 250, fight: 0.95 },
  riverking: { name: 'The River King', rarity: 'legendary', minKg: 25, maxKg: 45, points: 280, fight: 0.97 },
});

/** Score for a fish of a given weight, plus any bonus multiplier. */
export function scoreCatch(speciesId, kg, multiplier = 1) {
  const s = SPECIES[speciesId];
  const frac = (kg - s.minKg) / Math.max(0.0001, s.maxKg - s.minKg);
  return Math.max(1, Math.round(s.points * (0.5 + 1.5 * frac) * multiplier));
}
