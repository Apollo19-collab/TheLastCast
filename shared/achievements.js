// Achievements: long-term goals that reward coins and unlock tackle.
//
// Progress is read from a profile's lifetime counters (kept by the server) via
// `metric`:
//   'catches'                      a counter
//   'family.trout' / 'zone.river'  a counter inside a group
//   { sum: [...] } / { min: [...] } several counters combined
//   'species'                      number of species in the Fish Index
//   'index.ghost'                  how many of one species were caught
//   'score'                        total score
//
// Goals that unlock tackle are tuned to take well over an hour of play: a
// skilled player lands at most ~300 fish an hour in the fastest water (see
// the 'first hour' test).
// Which items each achievement unlocks is defined on the items (gear.js).

import { ITEMS } from './gear.js';
import { SPECIES } from './fish.js';

const SPECIES_COUNT = Object.keys(SPECIES).length;

export const ACHIEVEMENTS = [
  { id: 'first_catch', name: 'First Catch', desc: 'Land your very first fish.', metric: 'catches', goal: 1, coins: 10 },
  { id: 'getting_hooked', name: 'Getting Hooked', desc: 'Land 100 fish.', metric: 'catches', goal: 100, coins: 150 },
  { id: 'dedicated', name: 'Dedicated Angler', desc: 'Land 500 fish.', metric: 'catches', goal: 500, coins: 500 },
  { id: 'seasoned', name: 'Seasoned Angler', desc: 'Land 1,200 fish.', metric: 'catches', goal: 1200, coins: 1200 },
  { id: 'trout_bum', name: 'Trout Bum', desc: 'Catch 250 trout or salmon.', metric: 'family.trout', goal: 250, coins: 400 },
  { id: 'toothy', name: 'Toothy Critters', desc: 'Catch 150 pike, pickerel or muskies.', metric: 'family.pike', goal: 150, coins: 400 },
  {
    id: 'weed_warrior', name: 'Weed Warrior', desc: 'Catch 400 fish in the Reed Bed, Weedy Cove or Lily Marsh.',
    metric: { sum: ['zone.reeds', 'zone.weedyCove', 'zone.marsh'] }, goal: 400, coins: 400,
  },
  { id: 'deep_diver', name: 'Deep Diver', desc: 'Catch 300 fish in Deep Water or the Deep Basin.', metric: { sum: ['zone.deep', 'zone.basin'] }, goal: 300, coins: 500 },
  { id: 'river_rat', name: 'River Rat', desc: 'Catch 400 fish at the River Mouth.', metric: 'zone.river', goal: 400, coins: 400 },
  {
    id: 'explorer', name: 'Lake Explorer', desc: 'Catch 75 fish in each of the four areas around the lake.',
    metric: { min: ['area.southBeach', 'area.pinePoint', 'area.riverMouth', 'area.lilyMarsh'] }, goal: 75, coins: 400,
  },
  { id: 'trophy_hunter', name: 'Trophy Hunter', desc: 'Land 30 fish weighing 10 kg or more.', metric: 'bigFish', goal: 30, coins: 400 },
  { id: 'heavyweight', name: 'Heavyweight', desc: 'Land a fish of 35 kg or more.', metric: 'heaviest', goal: 35, coins: 500, unit: 'kg' },
  { id: 'hotspot_hopper', name: 'Hotspot Hopper', desc: 'Catch 200 fish inside hotspots.', metric: 'hotspotCatches', goal: 200, coins: 400 },
  { id: 'bait_shop', name: 'Bait Shop Regular', desc: 'Spend 8,000 coins on tackle and bait.', metric: 'coinsSpent', goal: 8000, coins: 400 },
  { id: 'collector', name: 'Collector', desc: 'Discover 40 species for your Fish Index.', metric: 'species', goal: 40, coins: 800 },
  { id: 'ghost_hunter', name: 'Ghost Hunter', desc: 'Catch The Pale Ghost.', metric: 'index.ghost', goal: 1, coins: 1000 },
  { id: 'living_legend', name: 'Living Legend', desc: 'Catch 3 legendary fish.', metric: 'legendaryCatches', goal: 3, coins: 1500 },
  { id: 'completionist', name: 'Completionist', desc: `Discover all ${SPECIES_COUNT} species, lake and sea.`, metric: 'species', goal: SPECIES_COUNT, coins: 5000 },
  { id: 'trash_collector', name: 'One Angler\'s Trash', desc: 'Reel in 50 old boots.', metric: 'index.boot', goal: 50, coins: 250 },
  { id: 'lessons_learned', name: 'Lessons Learned', desc: 'Snap your line 25 times.', metric: 'snaps', goal: 25, coins: 100 },
  { id: 'high_roller', name: 'High Roller', desc: 'Earn 50,000 coins in total.', metric: 'coinsEarned', goal: 50000, coins: 1500 },
  { id: 'lake_legend', name: 'Lake Legend', desc: 'Reach a score of 100,000.', metric: 'score', goal: 100000, coins: 3000 },
  // Multiplayer: duels and boat voyages
  { id: 'duelist', name: 'Duelist', desc: 'Win 10 fishing duels.', metric: 'duelsWon', goal: 10, coins: 500 },
  { id: 'sea_legs', name: 'Sea Legs', desc: 'Complete 5 boat voyages.', metric: 'voyages', goal: 5, coins: 600 },
  { id: 'old_salt', name: 'Old Salt', desc: 'Catch 300 fish at sea.', metric: 'seaCatches', goal: 300, coins: 800 },
  { id: 'current_rider', name: 'Current Rider', desc: 'Catch 40 fish during special events at sea.', metric: 'eventCatches', goal: 40, coins: 600 },
  { id: 'leviathan_slayer', name: 'Leviathan Slayer', desc: 'Catch The Leviathan in the Abyssal Trench.', metric: 'index.leviathan', goal: 1, coins: 2500 },
];

export const ACHIEVEMENT_BY_ID = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));

/** Item ids that an achievement unlocks. */
export function unlocksFor(achievementId) {
  return Object.entries(ITEMS).filter(([, it]) => it.unlock === achievementId).map(([id]) => id);
}

export function newCounters() {
  return {
    catches: 0, coinsEarned: 0, coinsSpent: 0, hotspotCatches: 0, legendaryCatches: 0,
    bigFish: 0, heaviest: 0, snaps: 0, family: {}, zone: {}, area: {},
    duels: 0, duelsWon: 0, voyages: 0, seaCatches: 0, eventCatches: 0,
  };
}

function read(profile, path) {
  if (path === 'species') return Object.keys(profile.index || {}).length;
  if (path === 'score') return profile.score || 0;
  const [group, key] = path.split('.');
  if (group === 'index') return profile.index?.[key]?.count || 0;
  const c = profile.counters || {};
  return (key ? c[group]?.[key] : c[group]) || 0;
}

export function metricValue(profile, metric) {
  if (typeof metric === 'string') return read(profile, metric);
  if (metric.sum) return metric.sum.reduce((s, m) => s + read(profile, m), 0);
  if (metric.min) return Math.min(...metric.min.map((m) => read(profile, m)));
  return 0;
}

/** { value, goal, done, fraction } for one achievement. */
export function progressOf(profile, achievement) {
  const value = metricValue(profile, achievement.metric);
  const done = !!profile.achievements?.[achievement.id] || value >= achievement.goal;
  return { value: Math.min(value, achievement.goal), goal: achievement.goal, done, fraction: Math.min(1, value / achievement.goal) };
}
