// Angler level: earned from XP, unlocks armour (see armour.js). Levels never
// change your tackle.
//
// XP comes from landing fish (1 XP per point, plus armour bonuses), finishing
// boat voyages and duels. The curve is tuned so level 50 takes about 40 hours
// and the maximum, 75, about 85: a typical player earns ~5,000 XP an hour (a
// test checks this). Levels 51-75 are the endgame, with the best armour.

export const MAX_LEVEL = 75;
export const EXPECTED_XP_PER_HOUR = 5000;

// XP needed to go from level n to n + 1: early levels take minutes, the last
// ones well over an hour.
export function xpToNext(level) {
  return level >= MAX_LEVEL ? Infinity : 400 + 147 * level;
}

const TOTALS = [0, 0]; // TOTALS[n] = total XP needed to reach level n
for (let n = 2; n <= MAX_LEVEL; n++) TOTALS[n] = TOTALS[n - 1] + xpToNext(n - 1);

/** Total XP needed to reach a level. */
export function xpForLevel(level) {
  return TOTALS[Math.max(1, Math.min(MAX_LEVEL, level))];
}

/** Level for an amount of total XP. */
export function levelFor(xp) {
  let level = 1;
  while (level < MAX_LEVEL && xp >= TOTALS[level + 1]) level++;
  return level;
}

/** { level, into, needed, fraction } for an XP bar. */
export function levelProgress(xp) {
  const level = levelFor(xp);
  if (level >= MAX_LEVEL) return { level, into: 0, needed: 0, fraction: 1 };
  const into = xp - TOTALS[level];
  const needed = xpToNext(level);
  return { level, into, needed, fraction: into / needed };
}

// Other XP rewards.
export const XP = {
  voyage: 250, // finishing a voyage, plus 25% of your voyage points
  duelWin: 200,
  duelPlay: 75,
};

/** Coins for reaching a level (a small thank-you on every level up). */
export function levelUpCoins(level) {
  return level * 20;
}
