// Equipment / progression data. Each slot is a linear upgrade path: you own
// tier 0 for free and can always buy the next tier with coins.
// Add a tier by appending to `tiers`; add a stat by extending gearStats().

export const GEAR = Object.freeze({
  rod: {
    label: 'Rod',
    tiers: [
      { name: 'Willow Rod', price: 0, castRange: 240, lineStrength: 1.0, desc: 'A bent stick with string.' },
      { name: 'Fiberglass Rod', price: 60, castRange: 290, lineStrength: 1.15, desc: 'Longer casts, a bit tougher.' },
      { name: 'Carbon Rod', price: 200, castRange: 340, lineStrength: 1.3, desc: 'Reach further out and fight harder fish.' },
      { name: "Master's Rod", price: 600, castRange: 400, lineStrength: 1.5, desc: 'Reaches the far side of any hotspot.' },
    ],
  },
  reel: {
    label: 'Reel',
    tiers: [
      { name: 'Rusty Reel', price: 0, reelSpeed: 1.0, desc: 'It turns. Mostly.' },
      { name: 'Spinning Reel', price: 50, reelSpeed: 1.2, desc: 'Reel fish in faster.' },
      { name: 'Baitcaster', price: 180, reelSpeed: 1.4, desc: 'Even faster retrieves.' },
      { name: 'Tournament Reel', price: 500, reelSpeed: 1.65, desc: 'Big fish barely get a chance.' },
    ],
  },
  bait: {
    label: 'Bait',
    tiers: [
      { name: 'Bread Crumbs', price: 0, biteSpeed: 1.0, rareBoost: 1.0, desc: 'Fish are not impressed.' },
      { name: 'Earthworms', price: 40, biteSpeed: 1.25, rareBoost: 1.2, desc: 'Faster bites.' },
      { name: 'Spinner Lure', price: 150, biteSpeed: 1.4, rareBoost: 1.5, desc: 'Attracts uncommon and rare fish.' },
      { name: 'Golden Lure', price: 450, biteSpeed: 1.6, rareBoost: 2.0, desc: 'Legends have been seen chasing it.' },
    ],
  },
});

export const GEAR_SLOTS = Object.keys(GEAR);

export function defaultGear() {
  return Object.fromEntries(GEAR_SLOTS.map((slot) => [slot, 0]));
}

/** Combined stats for a gear loadout like { rod: 1, reel: 0, bait: 2 }. */
export function gearStats(gear) {
  const tier = (slot) => GEAR[slot].tiers[Math.min(gear?.[slot] ?? 0, GEAR[slot].tiers.length - 1)];
  const rod = tier('rod');
  const reel = tier('reel');
  const bait = tier('bait');
  return {
    castRange: rod.castRange,
    lineStrength: rod.lineStrength,
    reelSpeed: reel.reelSpeed,
    biteSpeed: bait.biteSpeed,
    rareBoost: bait.rareBoost,
  };
}

/** The next tier for a slot, or null when maxed out. */
export function nextTier(gear, slot) {
  return GEAR[slot]?.tiers[(gear[slot] ?? 0) + 1] ?? null;
}
