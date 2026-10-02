// Chum buckets: bought at the Bait Shop, placed on the ground with C.
//
// While your bucket is out, fish you land near it get chopped into chum and
// can turn into bait for your bag. Rarer fish give better bait, and more of it.
// Only bait you've unlocked can come out of the bucket. The chum also draws
// fish in: everyone's bobbers near a bucket get bites a little faster.
//
// Balance: over its life a bucket makes bait worth about 1-1.5x its price for
// a new player and up to ~2.5x late on (rarer catches, more unlocked bait).
// The 'chum bucket' test keeps it in that range.

export const CHUM = Object.freeze({
  price: 60, // coins per bucket
  duration: 600, // seconds a placed bucket lasts
  maxFish: 30, // ...or until it has chummed this many fish
  radius: 220, // land fish within this distance of your bucket to chum them
  attractRadius: 180, // bobbers this close to any bucket bite faster
  biteBonus: 1.15,
  maxOwned: 20,
});

// What each rarity can turn into: chance of any bait, uses range, and which
// baits (weights). Locked baits are skipped (their weight goes to the rest).
export const CHUM_TABLE = Object.freeze({
  junk: { chance: 0, uses: [0, 0], bait: {} },
  common: { chance: 0.6, uses: [2, 4], bait: { worms: 5, corn: 3, nightcrawler: 2, leech: 1 } },
  uncommon: { chance: 0.55, uses: [2, 3], bait: { nightcrawler: 3, spinner: 2, roe: 2, frog: 1, leech: 1, crayfish: 1 } },
  rare: { chance: 0.45, uses: [1, 2], bait: { spinner: 3, frog: 2, minnow: 2, crayfish: 1, goldlure: 1, glowjig: 1, squid: 1 } },
  legendary: { chance: 1, uses: [1, 3], bait: { goldlure: 3, minnow: 2, glowjig: 2, mythicfly: 1 } },
  mythic: { chance: 1, uses: [2, 4], bait: { goldlure: 2, mythicfly: 3, stardust: 2 } },
});

/**
 * Roll the bait a chummed fish turns into.
 * canUse(baitId): whether the player has unlocked that bait.
 * Returns { bait, uses } or null.
 */
export function rollChum(rng, rarity, canUse = () => true) {
  const row = CHUM_TABLE[rarity];
  if (!row || rng() >= row.chance) return null;
  const options = Object.entries(row.bait).filter(([id]) => canUse(id));
  if (!options.length) return null;
  const total = options.reduce((s, [, w]) => s + w, 0);
  let roll = rng() * total;
  let bait = options[options.length - 1][0];
  for (const [id, w] of options) {
    roll -= w;
    if (roll <= 0) { bait = id; break; }
  }
  const [lo, hi] = row.uses;
  return { bait, uses: lo + Math.floor(rng() * (hi - lo + 1)) };
}
