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
export const SPECIES = Object.freeze({
  boot: { name: 'Old Boot', rarity: 'junk', minKg: 0.4, maxKg: 1.2, points: 1, fight: 0.1 },
  bluegill: { name: 'Bluegill', rarity: 'common', minKg: 0.1, maxKg: 0.6, points: 5, fight: 0.25 },
  perch: { name: 'Yellow Perch', rarity: 'common', minKg: 0.2, maxKg: 1.0, points: 8, fight: 0.3 },
  carp: { name: 'Common Carp', rarity: 'common', minKg: 1, maxKg: 9, points: 12, fight: 0.5 },
  trout: { name: 'Rainbow Trout', rarity: 'uncommon', minKg: 0.5, maxKg: 4, points: 20, fight: 0.55 },
  bass: { name: 'Largemouth Bass', rarity: 'uncommon', minKg: 0.5, maxKg: 5, points: 22, fight: 0.6 },
  catfish: { name: 'Channel Catfish', rarity: 'uncommon', minKg: 2, maxKg: 15, points: 30, fight: 0.65 },
  pike: { name: 'Northern Pike', rarity: 'rare', minKg: 2, maxKg: 12, points: 45, fight: 0.75 },
  sturgeon: { name: 'Lake Sturgeon', rarity: 'rare', minKg: 10, maxKg: 40, points: 80, fight: 0.85 },
  ghost: { name: 'The Pale Ghost', rarity: 'legendary', minKg: 20, maxKg: 60, points: 300, fight: 0.95 },
});

/** Score for a fish of a given weight, plus any bonus multiplier. */
export function scoreCatch(speciesId, kg, multiplier = 1) {
  const s = SPECIES[speciesId];
  const frac = (kg - s.minKg) / Math.max(0.0001, s.maxKg - s.minKg);
  return Math.max(1, Math.round(s.points * (0.5 + 1.5 * frac) * multiplier));
}
