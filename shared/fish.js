// Fish species definitions. Pure data, so new species are added here only.
// Which species can bite where is decided by each water zone in world.js.

export const RARITY = Object.freeze({
  junk: { label: 'Junk', color: '#8a8a7a' },
  common: { label: 'Common', color: '#cfd8dc' },
  uncommon: { label: 'Uncommon', color: '#7bd389' },
  rare: { label: 'Rare', color: '#5ab0ff' },
  legendary: { label: 'Legendary', color: '#ffb347' },
  mythic: { label: 'Mythic', color: '#ff5ce1' },
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
  chub: { name: 'Creek Chub', rarity: 'common', minKg: 0.1, maxKg: 0.8, family: 'carp', points: 6, fight: 0.3 },
  rockbass: { name: 'Rock Bass', rarity: 'common', minKg: 0.2, maxKg: 1, family: 'panfish', points: 9, fight: 0.35 },
  sucker: { name: 'White Sucker', rarity: 'common', minKg: 0.5, maxKg: 3, family: 'carp', points: 11, fight: 0.4 },

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
  sauger: { name: 'Sauger', rarity: 'uncommon', minKg: 0.5, maxKg: 3, family: 'perch', points: 27, fight: 0.6 },
  grayling: { name: 'Arctic Grayling', rarity: 'uncommon', minKg: 0.3, maxKg: 2.5, family: 'trout', points: 30, fight: 0.55 },
  redhorse: { name: 'Shorthead Redhorse', rarity: 'uncommon', minKg: 1, maxKg: 4, family: 'carp', points: 26, fight: 0.55 },

  // Rare
  pike: { name: 'Northern Pike', rarity: 'rare', minKg: 2, maxKg: 12, family: 'pike', points: 45, fight: 0.75 },
  burbot: { name: 'Burbot', rarity: 'rare', minKg: 1, maxKg: 8, family: 'catfish', points: 50, fight: 0.7 },
  laketrout: { name: 'Lake Trout', rarity: 'rare', minKg: 3, maxKg: 20, family: 'trout', points: 60, fight: 0.8 },
  koi: { name: 'Escaped Koi', rarity: 'rare', minKg: 1, maxKg: 10, family: 'carp', points: 65, fight: 0.55 },
  muskie: { name: 'Muskellunge', rarity: 'rare', minKg: 5, maxKg: 25, family: 'pike', points: 70, fight: 0.85 },
  sturgeon: { name: 'Lake Sturgeon', rarity: 'rare', minKg: 10, maxKg: 40, family: 'ancient', points: 80, fight: 0.85 },
  steelhead: { name: 'Steelhead', rarity: 'rare', minKg: 2, maxKg: 9, family: 'trout', points: 55, fight: 0.85 },
  chinook: { name: 'Chinook Salmon', rarity: 'rare', minKg: 4, maxKg: 20, family: 'trout', points: 70, fight: 0.9 },
  paddlefish: { name: 'Paddlefish', rarity: 'rare', minKg: 8, maxKg: 30, family: 'ancient', points: 75, fight: 0.8 },
  goldentrout: { name: 'Golden Trout', rarity: 'rare', minKg: 0.5, maxKg: 4, family: 'trout', points: 85, fight: 0.75 },
  alligatorgar: { name: 'Alligator Gar', rarity: 'rare', minKg: 15, maxKg: 45, family: 'ancient', points: 90, fight: 0.9 },

  // Legendary: one per special zone or location
  mossback: { name: 'Old Mossback', rarity: 'legendary', minKg: 20, maxKg: 35, family: 'pike', points: 250, fight: 0.95 },
  stonejaw: { name: 'Stonejaw', rarity: 'legendary', minKg: 15, maxKg: 40, family: 'trout', points: 260, fight: 0.95 },
  ghost: { name: 'The Pale Ghost', rarity: 'legendary', minKg: 20, maxKg: 60, family: 'ancient', points: 300, fight: 0.95 },
  frostfin: { name: 'Frostfin', rarity: 'legendary', minKg: 8, maxKg: 15, family: 'trout', points: 240, fight: 0.9 },
  marshqueen: { name: 'The Marsh Queen', rarity: 'legendary', minKg: 12, maxKg: 25, family: 'ancient', points: 250, fight: 0.95 },
  riverking: { name: 'The River King', rarity: 'legendary', minKg: 25, maxKg: 45, family: 'trout', points: 280, fight: 0.97 },
  emeraldjaw: { name: 'Emerald Jaw', rarity: 'legendary', minKg: 6, maxKg: 11, family: 'bass', points: 260, fight: 0.95 },
  dockmaster: { name: 'The Dockmaster', rarity: 'legendary', minKg: 30, maxKg: 55, family: 'catfish', points: 270, fight: 0.95 },

  // Mythic: the rarest fish of all. A few bite anywhere their water is, at
  // tiny odds; hotspots, the best bait and mythic gear help a lot.
  aurora: { name: 'Aurora Trout', rarity: 'mythic', minKg: 10, maxKg: 20, family: 'trout', points: 700, fight: 1.0 },
  lakewyrm: { name: 'The Lake Wyrm', rarity: 'mythic', minKg: 60, maxKg: 120, family: 'ancient', points: 850, fight: 1.0 },
  emberkoi: { name: 'The Ember Koi', rarity: 'mythic', minKg: 8, maxKg: 18, family: 'carp', points: 750, fight: 1.0 },

  // ---- Sea fish: only caught on boat voyages (see shared/voyage.js) ----
  herring: { name: 'Silver Herring', rarity: 'common', minKg: 0.1, maxKg: 0.7, family: 'sea', points: 8, fight: 0.3 },
  mackerel: { name: 'Atlantic Mackerel', rarity: 'common', minKg: 0.3, maxKg: 1.5, family: 'sea', points: 11, fight: 0.45 },
  sardine: { name: 'Sardine', rarity: 'common', minKg: 0.05, maxKg: 0.3, family: 'sea', points: 6, fight: 0.25 },
  mahimahi: { name: 'Mahi-Mahi', rarity: 'uncommon', minKg: 2, maxKg: 15, family: 'sea', points: 36, fight: 0.7 },
  cod: { name: 'Atlantic Cod', rarity: 'uncommon', minKg: 1, maxKg: 14, family: 'sea', points: 28, fight: 0.6 },
  seabass: { name: 'Striped Sea Bass', rarity: 'uncommon', minKg: 1, maxKg: 10, family: 'sea', points: 30, fight: 0.65 },
  sheephead: { name: 'Kelp Sheephead', rarity: 'uncommon', minKg: 1, maxKg: 8, family: 'sea', points: 34, fight: 0.6 },
  flounder: { name: 'Glass Flounder', rarity: 'uncommon', minKg: 0.5, maxKg: 5, family: 'sea', points: 32, fight: 0.5 },
  parrotfish: { name: 'Rainbow Parrotfish', rarity: 'rare', minKg: 1, maxKg: 9, family: 'sea', points: 60, fight: 0.6 },
  bluefin: { name: 'Bluefin Tuna', rarity: 'rare', minKg: 8, maxKg: 34, family: 'sea', points: 85, fight: 0.95 },
  grouper: { name: 'Goliath Grouper', rarity: 'rare', minKg: 10, maxKg: 34, family: 'sea', points: 80, fight: 0.8 },
  swordfish: { name: 'Swordfish', rarity: 'rare', minKg: 10, maxKg: 34, family: 'sea', points: 90, fight: 0.95 },
  oarfish: { name: 'Oarfish', rarity: 'rare', minKg: 5, maxKg: 30, family: 'sea', points: 85, fight: 0.75 },
  opah: { name: 'Moon Opah', rarity: 'rare', minKg: 5, maxKg: 30, family: 'sea', points: 80, fight: 0.75 },
  marlin: { name: 'Blue Marlin', rarity: 'rare', minKg: 12, maxKg: 34, family: 'sea', points: 95, fight: 0.97 },
  treasure: { name: 'Sunken Treasure Chest', rarity: 'rare', minKg: 5, maxKg: 20, family: 'junk', points: 150, fight: 0.25 },
  // Sea legendaries: each one mostly bites during its location's special event.
  kelpbeard: { name: 'Old Kelpbeard', rarity: 'legendary', minKg: 15, maxKg: 30, family: 'sea', points: 300, fight: 0.95 },
  prismwrasse: { name: 'The Prism Wrasse', rarity: 'legendary', minKg: 8, maxKg: 20, family: 'sea', points: 320, fight: 0.9 },
  thunderfin: { name: 'Thunderfin', rarity: 'legendary', minKg: 40, maxKg: 90, family: 'sea', points: 380, fight: 0.98 },
  drownedcaptain: { name: 'The Drowned Captain', rarity: 'legendary', minKg: 30, maxKg: 60, family: 'sea', points: 360, fight: 0.95 },
  stormcaller: { name: 'The Stormcaller', rarity: 'legendary', minKg: 30, maxKg: 70, family: 'sea', points: 380, fight: 0.98 },
  glasshalibut: { name: 'The Glass Halibut', rarity: 'legendary', minKg: 20, maxKg: 45, family: 'sea', points: 340, fight: 0.95 },
  leviathan: { name: 'The Leviathan', rarity: 'legendary', minKg: 80, maxKg: 150, family: 'sea', points: 500, fight: 1.0 },
  silvermoon: { name: 'Silvermoon', rarity: 'legendary', minKg: 20, maxKg: 45, family: 'sea', points: 360, fight: 0.95 },
  // Sea mythics: each one swims at four of the eight locations.
  abyssking: { name: 'The Abyssal King', rarity: 'mythic', minKg: 100, maxKg: 200, family: 'sea', points: 900, fight: 1.0 },
  tidemother: { name: 'Tidemother', rarity: 'mythic', minKg: 40, maxKg: 80, family: 'sea', points: 800, fight: 1.0 },
});

export const FAMILIES = Object.freeze({
  junk: 'Junk', panfish: 'Panfish', carp: 'Carp & minnows', perch: 'Perch & walleye', bass: 'Bass',
  trout: 'Trout & salmon', whitefish: 'Whitefish', pike: 'Pike', catfish: 'Catfish', ancient: 'Ancient fish',
  sea: 'Sea fish',
});

// How hard each rarity fights, on top of the species' own `fight`.
const RARITY_FIGHT = { junk: 0.5, common: 1, uncommon: 1.2, rare: 1.45, legendary: 1.8, mythic: 2.6 };

/**
 * How hard a hooked fish fights (about 0.1 for a tiny common fish to ~3 for a
 * huge legendary). Grows with rarity, with size within the species, and with
 * sheer weight, so a 30 kg sturgeon outmuscles a 12 kg one.
 */
export function fishDifficulty(speciesId, kg) {
  const s = SPECIES[speciesId];
  const sizeFrac = Math.min(1, Math.max(0, (kg - s.minKg) / Math.max(0.0001, s.maxKg - s.minKg)));
  const weight = 0.75 + 0.6 * sizeFrac + 0.08 * Math.log2(1 + kg);
  return Math.round(s.fight * RARITY_FIGHT[s.rarity] * weight * 100) / 100;
}

export const STRENGTH_TIERS = [
  { max: 0.45, label: 'Light', color: '#9ad1ff' },
  { max: 0.8, label: 'Steady', color: '#7bd389' },
  { max: 1.15, label: 'Strong', color: '#f9c74f' },
  { max: 1.6, label: 'Powerful', color: '#f8961e' },
  { max: Infinity, label: 'Monster', color: '#ff4d4d' },
];

/** Index into STRENGTH_TIERS for a difficulty value. */
export function strengthTier(difficulty) {
  return STRENGTH_TIERS.findIndex((t) => difficulty <= t.max);
}

/** Score for a fish of a given weight, plus any bonus multiplier. */
export function scoreCatch(speciesId, kg, multiplier = 1) {
  const s = SPECIES[speciesId];
  const frac = (kg - s.minKg) / Math.max(0.0001, s.maxKg - s.minKg);
  return Math.max(1, Math.round(s.points * (0.5 + 1.5 * frac) * multiplier));
}
