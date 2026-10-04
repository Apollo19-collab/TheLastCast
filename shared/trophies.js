// Trophy fish, named giants and the Hall of Records.
//
// Every species has a trophy weight: the top 8% of its weight range. A fish
// at or above it is a Trophy. Very rarely (about 1 bite in 300, more with
// Trophy Hunter armour) a fish is a Giant: bigger than the species' normal
// maximum, a much harder fight, and worth far more. Trophies and giants are
// given names ("Old Gnasher", "Goliath the Unbroken") and kept in your
// Trophy Cabinet.
//
// The Hall of Records (server/records.js) lists the heaviest trophies of each
// species: all-time, and this week. Each week's top three per species win a
// coin prize when the week ends (Monday 00:00 UTC).

import { SPECIES } from './fish.js';
import { seeded, seedFrom } from './noise.js';

export const TROPHY_FRAC = 0.92; // trophy weight: this far through the species' weight range
// Weight rolls above this point (before scaling) are giants. With the
// standard roll (u^2) that's 1 fish in ~300; heavier-fish armour raises it.
export const GIANT_ROLL = 0.99334;
export const GIANT_SIZE = { min: 1.08, extra: 0.42 }; // giants weigh maxKg x (1.08 .. 1.5)
export const GIANT_FIGHT = 1.3; // giants fight this much harder

export const TROPHY_TIERS = Object.freeze({
  trophy: { label: 'Trophy', icon: '🏆', color: '#ffd166', points: 1.5 },
  giant: { label: 'Giant', icon: '👑', color: '#ff7b54', points: 2.5 },
});

export const CABINET_LIMIT = 100; // trophies kept per profile (giants are never dropped)
export const RECORDS_ALL_TIME = 5; // entries per species in the all-time records
export const RECORDS_WEEKLY = 3; // ...and in this week's
export const WEEKLY_PRIZES = [1, 0.5, 0.25]; // share of the prize for 1st, 2nd, 3rd
export const WEEKLY_PRIZE = { perPoint: 10, base: 100, max: 3000 };

const WEEK = 7 * 24 * 3600;
const MONDAY = 4 * 24 * 3600; // 1970-01-01 was a Thursday; weeks start on Monday 00:00 UTC

/** Week number for a time in ms (weeks start Monday 00:00 UTC). */
export function weekOf(ms) {
  return Math.floor((ms / 1000 - MONDAY) / WEEK);
}

/** When a week ends (ms). */
export function weekEnds(week) {
  return (MONDAY + (week + 1) * WEEK) * 1000;
}

/** The weight at which a species counts as a trophy (null for junk). */
export function trophyKg(speciesId) {
  const s = SPECIES[speciesId];
  if (!s || s.rarity === 'junk') return null;
  return Math.round((s.minKg + (s.maxKg - s.minKg) * TROPHY_FRAC) * 100) / 100;
}

/** 'giant', 'trophy' or null for a fish of this weight. */
export function trophyTier(speciesId, kg) {
  const t = trophyKg(speciesId);
  if (t == null) return null;
  if (kg > SPECIES[speciesId].maxKg) return 'giant';
  return kg >= t ? 'trophy' : null;
}

/**
 * Weight from a roll in [0, 1) (already skewed towards small fish). The top of
 * the roll becomes a giant; everything else covers the normal weight range.
 */
export function kgFromRoll(speciesId, v) {
  const s = SPECIES[speciesId];
  let kg;
  if (s.rarity !== 'junk' && v > GIANT_ROLL) {
    const f = (v - GIANT_ROLL) / (1 - GIANT_ROLL);
    kg = s.maxKg * (GIANT_SIZE.min + GIANT_SIZE.extra * f * f);
  } else {
    kg = s.minKg + (s.maxKg - s.minKg) * Math.min(1, v / (s.rarity === 'junk' ? 1 : GIANT_ROLL));
  }
  return Math.round(kg * 100) / 100;
}

/** Weekly prize (coins) for a place (0 = 1st) in one species' records. */
export function weeklyPrize(speciesId, place) {
  const share = WEEKLY_PRIZES[place];
  if (!share) return 0;
  const p = WEEKLY_PRIZE;
  return Math.round(Math.min(p.max, p.base + SPECIES[speciesId].points * p.perPoint) * share);
}

// ---- names ------------------------------------------------------------------------

const TITLES = ['Old', 'Big', 'Mighty', 'Grand', 'Ol\'', 'Lady', 'King', 'Queen', 'Captain', 'Sir', 'Mad', 'Mother', 'Father', 'Little', 'Granny', 'Lord'];
const NAMES = [
  'Gnasher', 'Bertha', 'Whiskers', 'Goliath', 'Silverjaw', 'Ironscale', 'Mossback', 'Thunderfin', 'Bruiser', 'Gulper',
  'Patches', 'Stubbs', 'Scarlip', 'Bigmouth', 'Rusty', 'Murk', 'Hookjaw', 'Duchess', 'Barnaby', 'Mabel', 'Ezekiel',
  'Tusk', 'Bramble', 'Nessie', 'Brutus', 'Grumble', 'Pebble', 'Marlow', 'Snag', 'Copperbelly', 'Ripple', 'Dredge',
  'Hollow-eye', 'Greybeard', 'Splinter', 'Cobb', 'Hester', 'Mudlark', 'Fang', 'Knuckles', 'Ironsides',
];
const EPITHETS = [
  'the Unbroken', 'the Untamed', 'the Line-Breaker', 'the Ancient', 'the Leviathan', 'the Uncatchable', 'the Dread',
  'the Magnificent', 'the Rod-Snapper', 'the Deep One', 'the Stormborn', 'the Patient', 'the Old King', 'the Wise',
  'of the Depths', 'the Terrible', 'the Grey Ghost', 'the Last', 'the Hungry', 'the Mountain',
];

/** A name for a trophy fish. The same inputs always give the same name. */
export function trophyName(tier, ...seedParts) {
  const rnd = seeded(seedFrom('trophy name', tier, ...seedParts));
  const pick = (list) => list[Math.floor(rnd() * list.length)];
  const name = pick(NAMES);
  if (tier === 'giant') return `${name} ${pick(EPITHETS)}`;
  return rnd() < 0.55 ? `${pick(TITLES)} ${name}` : name;
}
