// Pets: companions with one unique ability each. 30 pets, 5 per rarity.
// They're sold by the Travelling Zoo, which moves around the lake and brings
// 3 new animals every 15 minutes (the same for everyone; it follows the
// clock). Own as many as you like, have one with you at a time. Pets are
// switched off in duels, like armour.
//
// Ability fields (all optional) are combined with armour bonuses by
// combineBonuses() and applied in server/fishing.js:
//   bite, rare, legendary, mythic, xp, coins, reel, weight: multipliers (1.2 = +20%)
//   tension, fight: multipliers on how fast tension builds / how hard fish fight
//   zone: { zones: [...], bite }   faster bites in some waters
//   affinity: { familyOrSpecies: mult }   more of some fish (like tackle)
//   sea: multiplier on points (so coins and XP) at sea
//   hotspot: multiplier on points in hotspots
//   double, snapSave, baitSave, rescue: chances
//   find: { chance, min, max }   coins found while landing a fish
//   biteWindow: extra seconds to hook a bite
//   castRange: extra cast distance
//   hold: escaping fish slip away this much slower (0.6 = 40% slower)

export const PET_RARITIES = Object.freeze({
  common: { label: 'Common', color: '#cfd8dc', price: 400, weight: 40 },
  uncommon: { label: 'Uncommon', color: '#7bd389', price: 1200, weight: 28 },
  rare: { label: 'Rare', color: '#5ab0ff', price: 3000, weight: 18 },
  epic: { label: 'Epic', color: '#c77dff', price: 7500, weight: 10 },
  legendary: { label: 'Legendary', color: '#ffb347', price: 18000, weight: 4 },
  mythic: { label: 'Mythic', color: '#ff5ce1', price: 45000, weight: 3 },
});

const SEA_LEGENDS = ['kelpbeard', 'prismwrasse', 'thunderfin', 'drownedcaptain', 'stormcaller', 'glasshalibut', 'leviathan', 'silvermoon'];

const pet = (rarity, name, emoji, ability, desc, fx) => ({ rarity, name, emoji, ability, desc, fx });

export const PETS = Object.freeze({
  // ---- common ----
  lilyfrog: pet('common', 'Lily Frog', '🐸', 'Marsh Buddy', 'Bites 15% faster in Lily Marsh and the Reed Bed.', { zone: { zones: ['marsh', 'reeds'], bite: 1.15 } }),
  duckling: pet('common', 'Duckling', '🐤', 'Crumb Thief', '10% chance a bite doesn\'t use up your bait.', { baitSave: 0.1 }),
  sandcrab: pet('common', 'Sand Crab', '🦀', 'Beachcomber', 'Old Boots are 70% less likely.', { affinity: { boot: 0.3 } }),
  snail: pet('common', 'Garden Snail', '🐌', 'Slow and Wise', '+10% XP.', { xp: 1.1 }),
  fieldmouse: pet('common', 'Field Mouse', '🐭', 'Pocket Change', '8% chance to find 5-20 coins when you land a fish.', { find: { chance: 0.08, min: 5, max: 20 } }),
  // ---- uncommon ----
  otterpup: pet('uncommon', 'Otter Pup', '🦦', 'Trout Tracker', 'Trout and salmon are 50% more likely.', { affinity: { trout: 1.5 } }),
  flamingo: pet('uncommon', 'Flamingo', '🦩', 'Patient Wader', '0.5 extra seconds to hook every bite.', { biteWindow: 0.5 }),
  hermit: pet('uncommon', 'Hermit Crab', '🐚', 'Hotspot Hermit', '+20% points in hotspots.', { hotspot: 1.2 }),
  turtle: pet('uncommon', 'Pond Turtle', '🐢', 'Slow Burn', 'Line tension builds 10% slower.', { tension: 0.9 }),
  kingfisher: pet('uncommon', 'Kingfisher', '🐦', 'Long Shot', 'Cast 40 further.', { castRange: 40 }),
  // ---- rare ----
  raccoon: pet('rare', 'Raccoon', '🦝', 'Light Fingers', '15% chance to find 20-60 coins when you land a fish.', { find: { chance: 0.15, min: 20, max: 60 } }),
  owl: pet('rare', 'Barn Owl', '🦉', 'Keen Eyes', 'Rare fish are 25% more likely.', { rare: 1.25 }),
  beaver: pet('rare', 'Beaver', '🦫', 'Dam Builder', 'Fish slip away 40% slower when you stop reeling.', { hold: 0.6 }),
  penguin: pet('rare', 'Penguin', '🐧', 'Fish Flinger', '8% chance of a Double Catch.', { double: 0.08 }),
  seal: pet('rare', 'Seal Pup', '🦭', 'Sea Pup', '+25% points, coins and XP at sea.', { sea: 1.25 }),
  // ---- epic ----
  snowfox: pet('epic', 'Snow Fox', '🦊', 'Frost Sense', 'Bites 30% faster at Cold Spring, and Frostfin is 3× as likely.', { zone: { zones: ['coldSpring'], bite: 1.3 }, affinity: { frostfin: 3 } }),
  eagle: pet('epic', 'Bald Eagle', '🦅', 'Eagle Eye', 'Legendary fish are twice as likely.', { legendary: 2 }),
  grizzly: pet('epic', 'Grizzly Cub', '🐻', 'Bear Strength', 'Reel 25% faster and line tension builds 15% slower.', { reel: 1.25, tension: 0.85 }),
  octopus: pet('epic', 'Octopus', '🐙', 'Eight Arms', 'Hooked fish fight 20% less hard.', { fight: 0.8 }),
  parrot: pet('epic', 'Pirate Parrot', '🦜', 'Treasure Talk', 'Treasure chests 4× as likely at sea, and 12% chance to find 40-120 coins.', { affinity: { treasure: 4 }, find: { chance: 0.12, min: 40, max: 120 } }),
  // ---- legendary ----
  dragon: pet('legendary', 'Baby Dragon', '🐲', 'Dragon\'s Hoard', '+30% coins and a 15% chance of a Double Catch.', { coins: 1.3, double: 0.15 }),
  peacock: pet('legendary', 'Celestial Peacock', '🦚', 'Second Life', 'Half of the fish you lose (snapped or escaped) are caught anyway.', { rescue: 0.5 }),
  kraken: pet('legendary', 'Kraken Spawn', '🦑', 'Call of the Deep', 'Sea legendaries are 3× as likely, and +20% points at sea.', { affinity: Object.fromEntries(SEA_LEGENDS.map((id) => [id, 3])), sea: 1.2 }),
  unicorn: pet('legendary', 'Unicorn', '🦄', 'Lucky Horn', 'Rare fish 50% more likely, and half your bites don\'t use up bait.', { rare: 1.5, baitSave: 0.5 }),
  spiritkoi: pet('legendary', 'Spirit Koi', '🎏', 'Flow State', 'Reel 30% faster, bites 15% faster and +30% XP.', { reel: 1.3, bite: 1.15, xp: 1.3 }),
  // ---- mythic ----
  phoenix: pet('mythic', 'Phoenix Chick', '🔥', 'Undying Flame', 'Three quarters of the fish you lose are caught anyway, and 30% chance a snapping line holds on.', { rescue: 0.75, snapSave: 0.3 }),
  wyrmling: pet('mythic', 'Leviathan Hatchling', '🐉', 'Abyssal Bond', 'Mythic fish 3× as likely, and +30% points, coins and XP at sea.', { mythic: 3, sea: 1.3 }),
  qilin: pet('mythic', 'Qilin', '🦌', 'Fortune\'s Blessing', '+50% coins and a 25% chance of a Double Catch.', { coins: 1.5, double: 0.25 }),
  moonmoth: pet('mythic', 'Moon Moth', '🦋', 'Moonlit Path', 'Bites 30% faster, rare fish 40% more likely and +25% XP.', { bite: 1.3, rare: 1.4, xp: 1.25 }),
  starwhale: pet('mythic', 'Star Whale', '🐋', 'Cosmic Tide', 'Legendary and mythic fish twice as likely, and 60% of bites don\'t use up bait.', { legendary: 2, mythic: 2, baitSave: 0.6 }),
});

export const PET_IDS = Object.keys(PETS);

export function petPrice(petId) {
  return PET_RARITIES[PETS[petId].rarity].price;
}

// ---- the Travelling Zoo ----------------------------------------------------------

export const ZOO = Object.freeze({
  interval: 900, // seconds between moves (every 15 minutes, on the quarter hour)
  stockSize: 3,
  range: 90, // how close to the wagon you must be to buy
  // Where the wagon parks on Mirror Lake, in turn.
  spots: [
    { x: 2150, y: 2160, area: 'South Beach' },
    { x: 1150, y: 140, area: 'Pine Point' },
    { x: 130, y: 1150, area: 'Lily Marsh' },
    { x: 3070, y: 1500, area: 'the River Mouth' },
  ],
});

function seededRng(seed) {
  let s = (seed % 2147483646) + 1;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/**
 * The zoo at a moment (seconds since the epoch): where it is, which 3 pets
 * it sells and how long until it moves on. Pure, so server and clients agree.
 */
export function zooAt(nowSec, interval = ZOO.interval) {
  const period = Math.floor(nowSec / interval);
  const rng = seededRng(period * 7919 + 13);
  rng();
  const stock = [];
  while (stock.length < ZOO.stockSize) {
    const total = Object.values(PET_RARITIES).reduce((s, r) => s + r.weight, 0);
    let roll = rng() * total;
    let rarity = 'common';
    for (const [id, r] of Object.entries(PET_RARITIES)) {
      roll -= r.weight;
      if (roll <= 0) { rarity = id; break; }
    }
    const options = PET_IDS.filter((id) => PETS[id].rarity === rarity && !stock.includes(id));
    stock.push(options[Math.floor(rng() * options.length)]);
  }
  const spot = ZOO.spots[period % ZOO.spots.length];
  return { period, stock, ...spot, left: (period + 1) * interval - nowSec };
}

// ---- combining pets with armour ----------------------------------------------------

/** Armour bonuses (computeArmour) plus a pet's ability: everything fishing uses. */
export function combineBonuses(armour, petId) {
  const fx = PETS[petId]?.fx ?? {};
  const zones = [...armour.zoneBites];
  if (fx.zone) zones.push({ zones: fx.zone.zones, mult: fx.zone.bite });
  return {
    ...armour,
    coins: armour.coins * (fx.coins ?? 1),
    xp: armour.xp * (fx.xp ?? 1),
    bite: armour.bite * (fx.bite ?? 1),
    rare: armour.rare * (fx.rare ?? 1),
    legendary: armour.legendary * (fx.legendary ?? 1),
    mythic: armour.mythic * (fx.mythic ?? 1),
    tension: armour.tension * (fx.tension ?? 1),
    reel: armour.reel * (fx.reel ?? 1),
    sea: armour.sea * (fx.sea ?? 1),
    double: Math.min(0.6, armour.double + (fx.double ?? 0)),
    snapSave: Math.min(0.6, armour.snapSave + (fx.snapSave ?? 0)),
    zoneBites: zones,
    fight: fx.fight ?? 1,
    hotspot: fx.hotspot ?? 1,
    affinity: fx.affinity ?? null,
    baitSave: fx.baitSave ?? 0,
    rescue: fx.rescue ?? 0,
    find: fx.find ?? null,
    biteWindow: fx.biteWindow ?? 0,
    castRange: fx.castRange ?? 0,
    hold: fx.hold ?? 1,
    pet: PETS[petId] ? petId : null,
  };
}
