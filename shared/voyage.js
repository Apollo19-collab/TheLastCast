// Ocean voyages (inspired by Ocean Fishing in Final Fantasy XIV).
//
// Every 15 minutes a boat sails in through the River Mouth and docks beside
// the South Beach dock. Anglers have 2 minutes to board, then it sails out to
// sea and visits 4 of the 8 locations below, picked at random. Each location
// has its own fish, a legendary and a special event that happens once per
// stop (faster bites, rarer fish, double points...). The crew shares a set of
// missions, and everyone gets bonus coins at the end based on how they did.
//
// Plain data and pure helpers, shared by the server (boat.js, voyage.js) and
// the client (drawing the boat, the HUD and the sea).

// ---- the boat on Mirror Lake -------------------------------------------------------

export const BOAT = Object.freeze({
  interval: 900, // seconds between visits: it docks on the quarter hour
  arrive: 30, // seconds sailing in
  board: 120, // seconds docked (the boarding window)
  depart: 30, // seconds sailing out with its passengers
  dock: { x: 1765, y: 1800, h: Math.PI / 2 }, // docked beside the South Beach dock, bow south
  length: 260,
  beam: 76,
  boardRange: 190, // how close to the boat you must stand to board
  landing: { x: 1600, y: 1800 }, // where passengers step off, on the dock
  // Route from beyond the east edge of the map, up the river, across the lake to the dock.
  path: [[3360, 1000], [3000, 1000], [2640, 1010], [2260, 1200], [1960, 1440], [1795, 1600], [1765, 1800]],
});

/** A smooth curve through points (Catmull-Rom), sampled by distance along it. */
function buildPath(points, samples = 240) {
  const pts = [];
  const P = (i) => points[Math.max(0, Math.min(points.length - 1, i))];
  for (let i = 0; i < points.length - 1; i++) {
    const [p0, p1, p2, p3] = [P(i - 1), P(i), P(i + 1), P(i + 2)];
    const n = Math.ceil(samples / (points.length - 1));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      pts.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  pts.push(points[points.length - 1]);
  const dist = [0];
  for (let i = 1; i < pts.length; i++) dist.push(dist[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, dist, total: dist[dist.length - 1] };
}

const ROUTE = buildPath(BOAT.path);

/** Position and heading at fraction s (0..1) of the route into the dock. */
function routeAt(s) {
  const target = Math.max(0, Math.min(1, s)) * ROUTE.total;
  let i = 1;
  while (i < ROUTE.dist.length - 1 && ROUTE.dist[i] < target) i++;
  const [a, b] = [ROUTE.pts[i - 1], ROUTE.pts[i]];
  const seg = ROUTE.dist[i] - ROUTE.dist[i - 1] || 1;
  const k = (target - ROUTE.dist[i - 1]) / seg;
  return { x: a[0] + (b[0] - a[0]) * k, y: a[1] + (b[1] - a[1]) * k, h: Math.atan2(b[1] - a[1], b[0] - a[0]) };
}

function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

/**
 * Where the boat is at a given time (seconds since the epoch). The schedule
 * follows the wall clock, so it survives server restarts.
 * Returns { phase: 'arriving' | 'docked' | 'departing' | 'away', left (seconds
 * left in this phase), nextDock (seconds until it next docks), x, y, h }.
 * x/y/h are null while the boat is away.
 */
export function boatState(nowSec, interval = BOAT.interval) {
  const c = ((nowSec % interval) + interval) % interval;
  const { arrive, board, depart, dock } = BOAT;
  let phase;
  let t;
  let len;
  if (c < board) [phase, t, len] = ['docked', c, board];
  else if (c < board + depart) [phase, t, len] = ['departing', c - board, depart];
  else if (c >= interval - arrive) [phase, t, len] = ['arriving', c - (interval - arrive), arrive];
  else [phase, t, len] = ['away', c - board - depart, interval - arrive - board - depart];
  const u = t / len;
  let pose = { x: null, y: null, h: null };
  if (phase === 'docked') pose = { ...dock };
  else if (phase === 'arriving') pose = routeAt(1 - (1 - u) ** 2); // slows down as it docks
  else if (phase === 'departing') {
    const p = routeAt(1 - u * u); // the same route backwards, speeding up
    // It swings round from its docked heading before heading off.
    pose = { x: p.x, y: p.y, h: lerpAngle(dock.h, p.h + Math.PI, Math.min(1, u * 3)) };
  }
  return { phase, left: len - t, nextDock: phase === 'docked' ? 0 : interval - c, ...pose };
}

/** World position of passenger slot i on a boat at pose {x, y, h}. */
export function boatSlot(pose, i, length = BOAT.length, beam = BOAT.beam) {
  const perSide = 8;
  const side = i % 2 ? 1 : -1;
  const row = Math.floor(i / 2) % perSide;
  const along = (length * 0.28) - row * ((length * 0.56) / (perSide - 1)) + Math.floor(i / (perSide * 2)) * 7;
  const across = side * beam * 0.24;
  const cos = Math.cos(pose.h);
  const sin = Math.sin(pose.h);
  return { x: pose.x + along * cos - across * sin, y: pose.y + along * sin + across * cos };
}

// ---- out at sea -------------------------------------------------------------------

export const VOYAGE = Object.freeze({
  stops: 4, // locations visited per voyage, out of the 8 below
  outbound: 15, // seconds sailing out before the first stop
  fishing: 135, // seconds of fishing at each stop
  sailing: 15, // seconds between stops (lines in)
  bossIntro: 8, // seconds between the last stop and the boss surfacing
  boss: 120, // seconds to defeat the boss before it escapes
  results: 15, // seconds on the results screen before heading home
  eventEarliest: 20, // a stop's special event starts this many seconds in, or later
  eventLength: 50, // ...and lasts this long
  missions: 3, // crew missions per voyage
  missionReward: 100, // bonus coins per completed mission, for everyone
  pointsBonus: 0.25, // bonus coins = this x your voyage points
  rankBonus: [300, 150, 75], // extra bonus coins for the top 3 anglers
});

export const TIMES_OF_DAY = ['Morning', 'Afternoon', 'Sunset', 'Night'];

// The sea "world": a trawler in the middle of open water. Walk on the deck,
// cast over the rail. The cabin at the stern is solid.
export const SEA_BOAT = Object.freeze({ x: 850, y: 600, length: 560, beam: 120 });

export function makeSeaWorld() {
  return {
    id: 'sea',
    kind: 'sea',
    name: 'Open Sea',
    width: 1700,
    height: 1200,
    spawn: { x: 880, y: 600 },
    land: [],
    structures: [
      { x: 680, y: 552, w: 400, h: 96, type: 'deck' }, // main deck
      { x: 1080, y: 570, w: 40, h: 60, type: 'deck' }, // bow
    ],
    solid: [{ x: 575, y: 545, w: 105, h: 110 }], // cabin
    zones: [{ id: 'sea', name: 'Open Sea', rect: null, biteRate: 1, fish: { herring: 1 } }],
    areas: [],
    hotspots: { count: 2, radius: 60, minLife: 30, maxLife: 60, area: { x: 400, y: 250, w: 900, h: 700 } },
    crowdPenalty: 0.25, // a crowded deck is normal on a fishing boat
    castFail: 'That would land on the boat. Cast over the rail.',
  };
}

/** Where passenger i stands on the trawler's deck. */
export function deckSlot(i) {
  const perRail = 10;
  const rail = i % 2;
  const k = Math.floor(i / 2) % perRail;
  const extra = Math.floor(i / (perRail * 2));
  return { x: 700 + k * 40 + extra * 12, y: rail ? 638 : 562 };
}

// Special events. mods are applied to everyone's fishing while it lasts:
//   biteSpeed, rareBoost, reelSpeed: multipliers
//   tension: multiplier on how fast line tension builds
//   fight: multiplier on how hard fish fight
//   points: multiplier on catch points
//   extraFish: { speciesId: weight } added to the location's fish
export const SEA_EVENTS = Object.freeze({
  frenzy: { name: 'Feeding Frenzy', color: '#7bd389', desc: 'The water boils with baitfish: bites come three times as fast!', mods: { biteSpeed: 3 } },
  spectral: { name: 'Spectral Current', color: '#c77dff', desc: 'A shimmering current rolls in: rare fish four times as likely, and catches score 1.5x.', mods: { rareBoost: 4, points: 1.5 } },
  whalesong: { name: 'Whale Song', color: '#9ad1ff', desc: 'A pod of whales calms the sea: reel 60% faster and line tension builds half as fast.', mods: { reelSpeed: 1.6, tension: 0.5 } },
  treasure: { name: 'Treasure Tide', color: '#ffd166', desc: 'Chests are drifting up from the wreck. Hook one for a fortune!', mods: { extraFish: { treasure: 30 } } },
  squall: { name: 'Squall', color: '#f8961e', desc: 'Rough seas: fish fight 30% harder, but every catch scores double.', mods: { fight: 1.3, points: 2 } },
  golden: { name: 'Golden Hour', color: '#f9c74f', desc: 'The sea turns to gold: double points and faster bites.', mods: { points: 2, biteSpeed: 1.4 } },
  leviathan: { name: 'Leviathan Rising', color: '#ff4d6d', desc: 'Something enormous stirs in the deep. The Leviathan can bite!', mods: { rareBoost: 1.5 } },
  glowtide: { name: 'Glowtide', color: '#90e0ef', desc: 'The sea glows: bites twice as fast and rare fish twice as likely.', mods: { biteSpeed: 2, rareBoost: 2 } },
});

// The 8 locations. water: [deep, shallow] colours. legendary: the
// location's legendary fish, which bites mostly (or, with eventOnly, only)
// during the special event.
export const SEA_LOCATIONS = Object.freeze({
  kelpForest: {
    name: 'Kelp Forest', desc: 'Towering kelp sways in the swell.', water: ['#164f40', '#2f7d63'], biteRate: 1.1,
    fish: { boot: 2, herring: 25, mackerel: 25, sardine: 15, cod: 12, seabass: 10, sheephead: 22 },
    legendary: 'kelpbeard', mythic: 'tidemother', event: 'frenzy',
  },
  coralGardens: {
    name: 'Coral Gardens', desc: 'Warm, clear water over bright coral.', water: ['#0f6d7d', '#2bb3b8'], biteRate: 1.0,
    fish: { boot: 1, herring: 20, mackerel: 20, sardine: 15, seabass: 12, mahimahi: 8, parrotfish: 14, flounder: 8 },
    legendary: 'prismwrasse', mythic: 'tidemother', event: 'spectral',
  },
  whaleRoad: {
    name: 'Whale Road', desc: 'Deep blue water where the whales travel.', water: ['#123a66', '#25628f'], biteRate: 0.95,
    fish: { boot: 1, herring: 30, mackerel: 25, cod: 15, mahimahi: 8, bluefin: 10, marlin: 5 },
    legendary: 'thunderfin', mythic: 'abyssking', event: 'whalesong',
  },
  sunkenGalleon: {
    name: 'Sunken Galleon', desc: 'A wreck lies just below the surface.', water: ['#183a48', '#2c5d6b'], biteRate: 0.95,
    fish: { boot: 6, herring: 15, cod: 20, seabass: 12, grouper: 12, treasure: 1.5 },
    legendary: 'drownedcaptain', mythic: 'abyssking', event: 'treasure',
  },
  stormBanks: {
    name: 'Storm Banks', desc: 'Grey, restless water under heavy clouds.', water: ['#1f3344', '#3b5568'], biteRate: 1.0,
    fish: { boot: 2, mackerel: 25, cod: 20, seabass: 15, swordfish: 10, bluefin: 5, marlin: 6 },
    legendary: 'stormcaller', mythic: 'abyssking', event: 'squall',
  },
  glassShallows: {
    name: 'Glass Shallows', desc: 'So clear you can see the sand below.', water: ['#2a8fa8', '#6fd3d8'], biteRate: 1.15,
    fish: { boot: 2, herring: 25, mackerel: 15, sardine: 20, flounder: 25, seabass: 10, mahimahi: 5, parrotfish: 5 },
    legendary: 'glasshalibut', mythic: 'tidemother', event: 'golden',
  },
  abyssalTrench: {
    name: 'Abyssal Trench', desc: 'The sea floor drops away into darkness.', water: ['#050f22', '#0f2c4d'], biteRate: 0.8,
    fish: { boot: 1, herring: 10, mackerel: 10, cod: 20, grouper: 6, oarfish: 12 },
    legendary: 'leviathan', mythic: 'abyssking', event: 'leviathan', eventOnly: true,
  },
  moonlitReef: {
    name: 'Moonlit Reef', desc: 'A reef that glows faintly after dark.', water: ['#123358', '#1f5b7a'], biteRate: 1.0,
    fish: { boot: 1, herring: 20, mackerel: 15, flounder: 10, mahimahi: 6, parrotfish: 8, opah: 12 },
    legendary: 'silvermoon', mythic: 'tidemother', event: 'glowtide',
  },
});

const LEGENDARY_WEIGHT = { base: 0.4, event: 5 };
// Each location's mythic fish: a tiny chance all stop, better during the event.
const MYTHIC_WEIGHT = { base: 0.02, event: 0.25 };

/** The fishing zone for a location (fish weights depend on whether its event is on). */
export function seaZone(locId, eventActive = false) {
  const loc = SEA_LOCATIONS[locId];
  if (!loc) return { id: 'sea', name: 'Open Sea', rect: null, biteRate: 1, fish: { herring: 1 } };
  const fish = { ...loc.fish };
  const legendaryWeight = eventActive ? LEGENDARY_WEIGHT.event : loc.eventOnly ? 0 : LEGENDARY_WEIGHT.base;
  if (legendaryWeight) fish[loc.legendary] = legendaryWeight;
  if (loc.mythic) fish[loc.mythic] = eventActive ? MYTHIC_WEIGHT.event : MYTHIC_WEIGHT.base;
  return { id: locId, name: loc.name, rect: null, biteRate: loc.biteRate, fish };
}

// ---- the boss at the end of every voyage ----------------------------------------
//
// The crew fights it together by fishing: every fish landed deals its points
// as damage, and fish caught in the boss's glowing weak spot (a moving
// hotspot) deal double. The boss telegraphs attacks (3 s warning), and
// attacks more often once it drops below 30% health. Health scales with the
// crew: hp = (base + perAngler x crew) x the boss's own multiplier.

export const BOSS = Object.freeze({
  base: 80,
  perAngler: 260,
  weakSpotRadius: 75,
  weakSpotMove: 15, // seconds before the weak spot moves
  attackEvery: [18, 24], // seconds between attacks (random in range)
  enragedEvery: [10, 14], // ...below 30% health
  enrageAt: 0.3,
  warning: 3,
  // Rewards for everyone still aboard.
  win: { coins: 400, xp: 800, damageCoins: 0.15, mvpCoins: 250 },
  lose: { coins: 100, xp: 200 },
});

export const BOSS_ATTACKS = Object.freeze({
  thrash: { name: 'Thrash', desc: 'Line tension spikes for anyone fighting a fish. Ease off!', tension: 0.35 },
  ink: { name: 'Ink Cloud', desc: 'Murky water: bites are half as fast for 10 seconds.', seconds: 10, mods: { biteSpeed: 0.5 } },
  whirlpool: { name: 'Whirlpool', desc: 'Fish fight 40% harder for 10 seconds.', seconds: 10, mods: { fight: 1.4 } },
});

export const BOSSES = Object.freeze({
  kraken: {
    name: 'The Kraken', desc: 'Tentacles as long as the boat curl up from the deep.', color: '#9d4edd', hp: 1.0,
    attacks: ['thrash', 'ink'], fish: { herring: 20, mackerel: 20, cod: 15, oarfish: 6, grouper: 4 },
  },
  megalodon: {
    name: 'Megalodon', desc: 'A shark the size of a whale circles the trawler.', color: '#8d99ae', hp: 1.15,
    attacks: ['thrash', 'whirlpool'], fish: { mackerel: 25, herring: 15, bluefin: 10, swordfish: 6, seabass: 10 },
  },
  serpent: {
    name: 'The Sea Serpent', desc: 'Coils of green scale break the surface all around.', color: '#2a9d8f', hp: 1.0,
    attacks: ['ink', 'whirlpool'], fish: { herring: 20, cod: 15, sheephead: 12, oarfish: 8, seabass: 10 },
  },
  ghostwhale: {
    name: 'The Ghost Whale', desc: 'A pale, glowing whale rises silently beneath you.', color: '#bde0fe', hp: 0.9,
    attacks: ['thrash', 'ink', 'whirlpool'], fish: { herring: 25, mackerel: 15, opah: 8, flounder: 12, cod: 10 },
  },
});

export function bossHp(bossId, crewSize) {
  return Math.round((BOSS.base + BOSS.perAngler * Math.max(1, crewSize)) * BOSSES[bossId].hp);
}

/** The water during the boss fight: the boss's own minions. */
export function bossZone(bossId) {
  const b = BOSSES[bossId];
  return { id: 'boss', name: `${b.name}'s waters`, rect: null, biteRate: 1.1, fish: { ...b.fish } };
}

// Crew missions: 3 are picked per voyage. Goals scale with the crew size:
// goal = max(min, round(perAngler x crew)).
export const MISSIONS = Object.freeze([
  { id: 'haul', text: 'Catch {n} fish', perAngler: 6, min: 10 },
  { id: 'rare', text: 'Land {n} rare, legendary or mythic fish', perAngler: 1, min: 2 },
  { id: 'event', text: 'Catch {n} fish during special events', perAngler: 2, min: 4 },
  { id: 'heavy', text: 'Land {n} fish of 10 kg or more', perAngler: 1, min: 2 },
  { id: 'variety', text: 'Catch {n} different species', perAngler: 0, min: 9 },
  { id: 'legend', text: 'Land a legendary fish', perAngler: 0, min: 1 },
]);

export function missionGoal(mission, crewSize) {
  return Math.max(mission.min, Math.round(mission.perAngler * crewSize));
}

export function missionText(mission, goal) {
  return mission.text.replace('{n}', goal);
}

/** Where a sea species can be caught, for the Fish Index. */
export function seaLocationsFor(speciesId) {
  return Object.values(SEA_LOCATIONS)
    .filter((l) => l.fish[speciesId] || l.legendary === speciesId || l.mythic === speciesId)
    .map((l) => (l.legendary === speciesId ? `${l.name} (during ${SEA_EVENTS[l.event].name})` : l.name));
}
