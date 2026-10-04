// World (fishing location) definitions and geometry helpers.
//
// A location is plain data:
//   shape       organic water and land (see "Organic shapes" below); or, for
//   land        simple worlds like the boat deck, rectangles you can walk on
//   structures  docks, jetties, bridges: walkable, sitting on top of water
//   zones       water areas that decide what bites where
//   areas       named places around the map (HUD + map labels only)
//   solid       optional: neither walkable nor water (e.g. a boat's cabin)
// To add a new lake, add another object to LOCATIONS. The sea "world" used on
// boat voyages is built by makeSeaWorld() in voyage.js.

import { fbm, seeded, seedFrom } from './noise.js';

// ---- Organic shapes ---------------------------------------------------------------
//
// Water is a union of soft ellipses `e: [cx, cy, rx, ry]` and rivers
// `line: [[x, y], ...]` with half-width `w`. `land` shapes are carved back out
// of the water (peninsulas, points, islands). The whole lot is domain-warped
// and roughened with noise, so shorelines wander naturally instead of running
// in straight lines. Server collision and client rendering both sample the
// same field (waterField below), so what you see is what you walk on.
//
// The rest is for the client's ground textures only: `beaches` and `rock` are
// soft regions of sand and stone, and `trails` are dirt paths.

// The river: it enters at the far east edge of the map and winds all the way
// to Mirror Lake at the River Mouth. The boat follows it in (BOAT.path in voyage.js).
export const RIVER = [
  [2780, 1000], [3300, 995], [3700, 985], [4100, 1030], [4500, 1000], [4900, 990], [5400, 1000],
  [6200, 1140], [7000, 1060], [7800, 1240], [8600, 1150], [9400, 1300], [10200, 1210], [11000, 1350],
  [11800, 1260], [12600, 1320], [13200, 1300],
];

/** Zone rectangles hugging the river from `fromX` eastwards. */
function riverRects(fromX) {
  const rects = [];
  for (let i = 1; i < RIVER.length; i++) {
    const [ax, ay] = RIVER[i - 1];
    const [bx, by] = RIVER[i];
    if (bx <= fromX) continue;
    const x0 = Math.max(fromX, Math.min(ax, bx));
    rects.push({ x: x0, y: Math.min(ay, by) - 230, w: Math.max(ax, bx) - x0, h: Math.abs(by - ay) + 460 });
  }
  return rects;
}

const e = (cx, cy, rx, ry) => ({ e: [cx, cy, rx, ry] });

export const LOCATIONS = {
  mirrorLake: {
    id: 'mirrorLake',
    name: 'Mirror Lake',
    // The hand-made valley around Mirror Lake fills the top-left 5120 x 3840;
    // the wilds beyond it are generated (extendWorld, below).
    width: 12800,
    height: 9600,
    spawn: { x: 1500, y: 2150 },

    shape: {
      warp: { amp: 26, scale: 320 },
      bump: { amp: 11, scale: 70 },
      water: [
        // ---- Mirror Lake ----
        e(1600, 1130, 1300, 820), // the main body
        e(1500, 1820, 1000, 200), // the southern shallows
        e(520, 900, 300, 520), // Lily Marsh
        e(480, 1700, 260, 330), // the Reed Bed
        e(1080, 520, 260, 300), // Weedy Cove
        e(1810, 520, 250, 300), // Cold Spring
        e(2760, 1000, 260, 230), // the River Mouth
        e(2560, 1720, 330, 300), // the Rocky Drop-off
        { line: RIVER, w: 100 },
        // ---- the ponds ----
        e(4250, 470, 340, 230), e(4500, 620, 200, 150), // Willow Pond
        e(650, 3050, 300, 220), e(860, 3210, 180, 150), // Frog Pond
        e(2150, 3150, 380, 260), // Crystal Pond
        e(3500, 2950, 360, 280), e(3760, 3160, 220, 180), // Black Bog
        e(4500, 2050, 380, 300), e(4260, 2250, 170, 130), // Mill Pond
      ],
      land: [
        e(1450, 450, 170, 470), // Pine Point
        e(3050, 2150, 420, 450), // the rocky point
        e(2150, 3160, 75, 60), // the island in Crystal Pond
      ],
      beaches: [e(1500, 2200, 1750, 300), e(2150, 2860, 220, 70), e(4500, 1740, 220, 60)],
      rock: [e(3050, 2150, 470, 500), e(2560, 1450, 200, 120), e(4900, 300, 300, 260), e(200, 3700, 260, 200)],
      trails: [
        [[1250, 2250], [900, 2400], [700, 2700], [640, 2820]], // to Frog Pond
        [[1750, 2300], [1950, 2550], [2120, 2800], [2150, 2850]], // to Crystal Pond
        [[2300, 2330], [2800, 2480], [3100, 2620], [3120, 2900]], // to Black Bog
        [[3100, 2620], [3700, 2520], [4100, 2440], [4500, 2420]], // to Mill Pond
        [[4500, 2420], [4700, 2000], [4560, 1720], [4420, 1300], [4410, 1140]], // Mill Pond to the river
        [[3070, 1180], [3500, 1300], [4000, 1250], [4410, 1140]], // along the south bank
        [[3070, 820], [3600, 790], [4100, 800], [4250, 780]], // to Willow Pond
        [[4410, 860], [4300, 800]],
      ],
    },

    // Walkable structures that sit on top of water.
    structures: [
      { x: 1572, y: 1640, w: 56, h: 440, type: 'dock' }, // South Beach dock
      { x: 1490, y: 1600, w: 220, h: 50, type: 'dock' },
      { x: 1418, y: 820, w: 64, h: 350, type: 'dock' }, // Pine Point jetty
      { x: 140, y: 880, w: 440, h: 40, type: 'dock' }, // Lily Marsh boardwalk
      { x: 3040, y: 840, w: 60, h: 320, type: 'bridge' }, // bridge over the river mouth
      { x: 4380, y: 840, w: 60, h: 320, type: 'bridge' }, // bridge over the east river
      { x: 4230, y: 560, w: 40, h: 260, type: 'dock' }, // Willow Pond jetty
      { x: 630, y: 3080, w: 40, h: 300, type: 'dock' }, // Frog Pond jetty
      { x: 2130, y: 2820, w: 40, h: 290, type: 'dock' }, // Crystal Pond: boardwalk to the island
      { x: 3060, y: 2930, w: 380, h: 40, type: 'dock' }, // Black Bog boardwalk
      { x: 4480, y: 1680, w: 40, h: 280, type: 'dock' }, // Mill Pond dock
    ],

    // Shops: walk up and press E. The stall itself is solid.
    // The three travelling tackle shops are out in the wilds by the great
    // lakes; each sells its own stock (see `shop` in gear.js).
    shops: [
      { id: 'bait', name: 'Bait Shop', x: 1395, y: 2075, range: 70 },
      {
        id: 'stillwater', kind: 'tackle', name: 'Stillwater Finesse Co.', keeper: 'Mae', x: 2560, y: 6920, range: 80,
        sign: 'FINESSE', awning: ['#2a9d8f', '#e9f5db'], minimap: '#7bd389',
        greeting: 'Light lines, soft rods and a gentle touch. Shy fish never know you\'re there.',
      },
      {
        id: 'silvermere', kind: 'tackle', name: 'Silvermere Outfitters', keeper: 'Brannock', x: 7200, y: 4640, range: 80,
        sign: 'OUTFITTERS', awning: ['#3a4a6b', '#ced4da'], minimap: '#9ad1ff',
        greeting: 'Heavy rods, big reels and line you could tow a boat with. For the monsters.',
      },
      {
        id: 'ember', kind: 'tackle', name: 'The Ember Curio', keeper: 'Old Ysolde', x: 10960, y: 5400, range: 80,
        sign: 'CURIO', awning: ['#9d0208', '#ffba08'], minimap: '#ff7b54',
        greeting: 'You walked a long way, angler. Everything here is old, rare and a little bit lucky.',
      },
    ],
    solid: [
      { x: 1365, y: 2050, w: 60, h: 40 }, // the Bait Shop stall
      { x: 2530, y: 6895, w: 60, h: 40 }, // the tackle shop stalls
      { x: 7170, y: 4615, w: 60, h: 40 },
      { x: 10930, y: 5375, w: 60, h: 40 },
    ],

    // Water zones, checked in order; the first match wins.
    // `rect` (or `rects` for an L-shaped zone); `rect: null` is the default for
    // any other water. biteRate > 1 means faster bites. `fish` maps species id
    // -> weight. `label: false` hides the name painted on the water. `decor`
    // picks a renderer decoration ('reeds', 'lilies', 'current').
    zones: [
      // ---- River Mouth (east) ----
      {
        id: 'river',
        name: 'River Mouth',
        rect: { x: 2600, y: 780, w: 600, h: 440 },
        biteRate: 1.0,
        decor: 'current',
        // Fresh, moving water draws in fish running up from the lake.
        fish: {
          boot: 2, mooneye: 25, chub: 12, sucker: 10, smallmouth: 18, walleye: 15, trout: 15,
          sauger: 10, redhorse: 10, steelhead: 10, chinook: 7, paddlefish: 3, riverking: 0.5,
        },
      },
      // ---- the East River, flowing in from the edge of the map ----
      {
        id: 'eastRiver',
        name: 'East River',
        rects: riverRects(3200),
        biteRate: 1.05,
        decor: 'current',
        fish: {
          boot: 2, fallfish: 25, logperch: 18, chub: 12, smallmouth: 12, browntrout: 18, trout: 10,
          steelhead: 6, atlanticsalmon: 4, shovelnose: 4, rapidsrunner: 0.5,
        },
      },
      // ---- Pine Point (north) ----
      {
        id: 'coldSpring',
        name: 'Cold Spring',
        rect: { x: 1560, y: 180, w: 500, h: 640 },
        biteRate: 0.8,
        // A spring under the point keeps this water cold all year.
        fish: {
          boot: 2, cisco: 15, brooktrout: 30, trout: 15, whitefish: 15, grayling: 15,
          laketrout: 10, burbot: 8, goldentrout: 3, frostfin: 0.5, aurora: 0.03,
        },
      },
      {
        id: 'weedyCove',
        name: 'Weedy Cove',
        rect: { x: 800, y: 180, w: 500, h: 640 },
        biteRate: 1.1,
        decor: 'reeds',
        fish: { boot: 4, perch: 25, bluegill: 15, rockbass: 12, pickerel: 20, bass: 15, pike: 10, muskie: 3, emeraldjaw: 0.5 },
      },
      // ---- Lily Marsh (west) ----
      {
        id: 'marsh',
        name: 'Lily Marsh',
        rect: { x: 180, y: 350, w: 600, h: 1050 },
        biteRate: 1.2,
        decor: 'lilies',
        fish: {
          boot: 5, bullhead: 30, crappie: 20, pumpkinseed: 15, pickerel: 12,
          bowfin: 12, gar: 5, alligatorgar: 2, marshqueen: 0.5,
        },
      },
      // ---- the middle of the lake: reach it from the Pine Point jetty ----
      {
        id: 'basin',
        name: 'Deep Basin',
        rect: { x: 1000, y: 950, w: 1000, h: 400 },
        biteRate: 0.55,
        fish: {
          boot: 1, cisco: 20, whitefish: 15, catfish: 12, laketrout: 18,
          burbot: 12, sturgeon: 15, pike: 5, paddlefish: 4, ghost: 1.2, lakewyrm: 0.03,
        },
      },
      // ---- South Beach ----
      {
        id: 'deep',
        name: 'Deep Water',
        rect: { x: 1250, y: 1380, w: 700, h: 220 },
        biteRate: 0.6,
        // Cold, deep fish. Reachable from the end of the South Beach dock.
        fish: {
          boot: 2, cisco: 25, whitefish: 20, carp: 8, catfish: 18, walleye: 10,
          sauger: 6, laketrout: 15, burbot: 12, pike: 6, sturgeon: 12, ghost: 0.5, lakewyrm: 0.03,
        },
      },
      {
        id: 'dockShade',
        name: 'Dock Shade',
        rect: { x: 1540, y: 1650, w: 120, h: 210 },
        label: false, // the dock covers the middle of this zone
        biteRate: 1.1,
        // Fish that hide under structure.
        fish: { boot: 4, bluegill: 25, crappie: 30, rockbass: 15, perch: 20, catfish: 12, bass: 10, walleye: 3, dockmaster: 0.5 },
      },
      {
        id: 'reeds',
        name: 'Reed Bed',
        rect: { x: 180, y: 1400, w: 560, h: 680 },
        biteRate: 1.0,
        decor: 'reeds',
        // Weedy ambush hunters.
        fish: {
          boot: 4, shiner: 15, chub: 10, rudd: 25, perch: 25, bluegill: 10, tench: 15,
          bowfin: 10, bass: 12, pike: 10, muskie: 4, mossback: 0.5,
        },
      },
      {
        id: 'rocks',
        name: 'Rocky Drop-off',
        rect: { x: 2300, y: 1450, w: 640, h: 650 },
        biteRate: 0.9,
        // The lake bed falls away steeply here, so deep-water fish come in close.
        fish: {
          boot: 3, perch: 12, rockbass: 15, smallmouth: 30, trout: 25, walleye: 18, sauger: 8, bass: 12,
          burbot: 7, laketrout: 7, sturgeon: 2, stonejaw: 0.5,
        },
      },
      {
        id: 'shallows',
        name: 'Shallows',
        rect: { x: 700, y: 1860, w: 1600, h: 240 },
        biteRate: 1.3,
        fish: { boot: 8, bluegill: 35, pumpkinseed: 30, shiner: 25, chub: 10, perch: 20, carp: 12, bass: 3, koi: 2, emberkoi: 0.012 },
      },
      // ---- the ponds around Mirror Lake ----
      {
        id: 'willowPond',
        name: 'Willow Pond',
        rect: { x: 3800, y: 150, w: 1000, h: 700 },
        biteRate: 1.1,
        decor: 'reeds',
        // Clear, cool and weedy: stocked trout and feral goldfish.
        fish: {
          boot: 3, goldfish: 25, warmouth: 22, pumpkinseed: 12, redfin: 18, brooktrout: 10,
          tigertrout: 5, pike: 4, willowwisp: 0.5,
        },
      },
      {
        id: 'frogPond',
        name: 'Frog Pond',
        rect: { x: 280, y: 2760, w: 840, h: 680 },
        biteRate: 1.35,
        decor: 'lilies',
        // Shallow and muddy: the fish bite fast, and some get big.
        fish: {
          boot: 6, mudminnow: 28, greensunfish: 25, yellowbullhead: 22, bullhead: 10,
          bowfin: 6, flathead: 4, oldwhiskers: 0.5,
        },
      },
      {
        id: 'crystalPond',
        name: 'Crystal Pond',
        rect: { x: 1700, y: 2840, w: 900, h: 620 },
        biteRate: 0.75,
        // A deep spring pond, cold and so clear the fish are wary.
        fish: {
          boot: 1, cisco: 15, cutthroat: 25, splake: 20, brooktrout: 12, grayling: 10,
          arcticchar: 8, goldentrout: 3, crystalchar: 0.5, glimmerfin: 0.03,
        },
      },
      {
        id: 'blackBog',
        name: 'Black Bog',
        rect: { x: 3080, y: 2620, w: 980, h: 760 },
        biteRate: 1.0,
        decor: 'lilies',
        // Dark, tea-coloured water full of ancient, toothy things.
        fish: {
          boot: 6, blackbullhead: 26, dollarsunfish: 20, americaneel: 14, spottedgar: 12, bowfin: 10,
          snakehead: 5, nightbowfin: 0.5, mirefang: 0.03,
        },
      },
      {
        id: 'millPond',
        name: 'Mill Pond',
        rect: { x: 4040, y: 1700, w: 900, h: 720 },
        biteRate: 0.95,
        // Warm, deep water behind the old mill dam: big bass and bigger carp.
        fish: {
          boot: 4, whitecrappie: 25, bluegill: 12, buffalo: 16, hybridbass: 14, spottedbass: 14,
          carp: 10, bigheadcarp: 5, millstone: 0.5,
        },
      },
      {
        id: 'open',
        name: 'Open Lake',
        rect: null,
        biteRate: 0.9,
        fish: {
          boot: 5, crappie: 22, bluegill: 15, perch: 15, carp: 22, trout: 12,
          walleye: 10, gar: 8, catfish: 8, pike: 4, sucker: 12, redhorse: 6, alligatorgar: 1,
        },
      },
    ],

    // Named places, checked in order. `label` is where the name is painted.
    areas: [
      { id: 'pinePoint', name: 'Pine Point', rect: { x: 850, y: 0, w: 1250, h: 1200 }, label: { x: 1450, y: 130 } },
      { id: 'riverMouth', name: 'River Mouth', rect: { x: 2450, y: 600, w: 750, h: 800 }, label: { x: 3070, y: 700 } },
      { id: 'lilyMarsh', name: 'Lily Marsh', rect: { x: 0, y: 300, w: 800, h: 1100 }, label: { x: 110, y: 1040 } },
      { id: 'southBeach', name: 'South Beach', rect: { x: 0, y: 1350, w: 3200, h: 1050 }, label: { x: 1100, y: 2250 } },
      { id: 'willowmere', name: 'Willowmere', rect: { x: 3200, y: 0, w: 1920, h: 880 }, label: { x: 3700, y: 420 } },
      { id: 'millside', name: 'Millside', rect: { x: 3200, y: 880, w: 1920, h: 1660 }, label: { x: 3800, y: 1600 } },
      { id: 'frogHollow', name: 'Frog Hollow', rect: { x: 0, y: 2400, w: 1400, h: 1440 }, label: { x: 650, y: 2620 } },
      { id: 'crystalSprings', name: 'Crystal Springs', rect: { x: 1400, y: 2400, w: 1500, h: 1440 }, label: { x: 2150, y: 3560 } },
      { id: 'blackBog', name: 'The Black Bog', rect: { x: 2900, y: 2540, w: 2220, h: 1300 }, label: { x: 3600, y: 3500 } },
    ],

    hotspots: { count: 30, radius: 70, minLife: 45, maxLife: 90 },
  },
};

export const DEFAULT_LOCATION = 'mirrorLake';

function inRect(r, x, y) {
  return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
}

/** A zone's rectangles, or null for the default zone. */
export function zoneRects(zone) {
  return zone.rects ?? (zone.rect ? [zone.rect] : null);
}

export function inBounds(world, x, y) {
  return x >= 0 && y >= 0 && x < world.width && y < world.height;
}

// ---- the organic water field ----------------------------------------------------------

/** Approximate signed distance to a soft shape: negative inside. */
function shapeDistance(s, x, y) {
  if (s.e) {
    const [cx, cy, rx, ry] = s.e;
    const dx = (x - cx) / rx;
    const dy = (y - cy) / ry;
    return (Math.sqrt(dx * dx + dy * dy) - 1) * Math.min(rx, ry);
  }
  let best = Infinity;
  const pts = s.line;
  for (let i = 1; i < pts.length; i++) best = Math.min(best, segmentDistance(x, y, pts[i - 1], pts[i]));
  return best - s.w;
}

export function segmentDistance(x, y, [ax, ay], [bx, by]) {
  const vx = bx - ax;
  const vy = by - ay;
  const t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy || 1)));
  return Math.hypot(x - ax - vx * t, y - ay - vy * t);
}

/** Smallest distance from a point to a set of soft shapes (negative inside any). */
export function shapesDistance(shapes, x, y) {
  let d = Infinity;
  for (const s of shapes ?? []) d = Math.min(d, shapeDistance(s, x, y));
  return d;
}

/** The same gentle wobble the shorelines get, for anything that should line up with them. */
export function warpPoint(shape, x, y) {
  const { amp, scale } = shape.warp;
  return [
    x + (fbm(x / scale, y / scale, 2) - 0.5) * 2 * amp,
    y + (fbm(x / scale + 31.7, y / scale + 12.3, 2) - 0.5) * 2 * amp,
  ];
}

// Beyond this distance from any shape, the field just reads "far from water".
const FIELD_CAP = 600;

function shapeBox(sh) {
  if (sh.e) {
    const [cx, cy, rx, ry] = sh.e;
    return [cx - rx, cy - ry, cx + rx, cy + ry];
  }
  const xs = sh.line.map((pt) => pt[0]);
  const ys = sh.line.map((pt) => pt[1]);
  return [Math.min(...xs) - sh.w, Math.min(...ys) - sh.w, Math.max(...xs) + sh.w, Math.max(...ys) + sh.w];
}

/** The shapes that can matter inside a box (anything within FIELD_CAP of it). */
function shapesNear(list, x0, y0, x1, y1) {
  const m = FIELD_CAP;
  return (list ?? []).filter((sh) => {
    const b = sh.box ?? (sh.box = shapeBox(sh));
    return b[0] < x1 + m && b[2] > x0 - m && b[1] < y1 + m && b[3] > y0 - m;
  });
}

/**
 * Raw field value: < 0 is water, > 0 is land (roughly the distance to the
 * shore, capped at FIELD_CAP). `near` optionally limits which shapes are
 * checked (see shapesNear).
 */
export function waterValue(shape, x, y, near = null) {
  const [wx, wy] = warpPoint(shape, x, y);
  let v = Math.min(FIELD_CAP, shapesDistance(near?.water ?? shape.water, wx, wy));
  const land = near?.land ?? shape.land;
  if (land?.length) v = Math.max(v, -shapesDistance(land, wx, wy));
  const { amp, scale } = shape.bump;
  return v + (fbm(x / scale + 5.1, y / scale + 9.4, 2) - 0.5) * 2 * amp;
}

const FIELD_CELL = 8;
const BLOCK = 64; // field cells per block side (512 world units)
const fields = new WeakMap();

/**
 * The world's water field, sampled on a grid. Blocks are filled in only
 * when something first looks at them, so a huge map costs nothing until
 * someone walks (or casts, or looks) there.
 */
export function waterField(world) {
  let f = fields.get(world);
  if (!f) {
    f = {
      bw: Math.ceil(world.width / FIELD_CELL / BLOCK),
      bh: Math.ceil(world.height / FIELD_CELL / BLOCK),
      blocks: new Map(),
    };
    fields.set(world, f);
  }
  return f;
}

function fieldBlock(world, bx, by) {
  const f = waterField(world);
  const key = by * 4096 + bx;
  let block = f.blocks.get(key);
  if (block) return block;
  const size = BLOCK * FIELD_CELL;
  const x0 = bx * size;
  const y0 = by * size;
  const amp = world.shape.warp.amp;
  const near = {
    water: shapesNear(world.shape.water, x0 - amp, y0 - amp, x0 + size + amp, y0 + size + amp),
    land: shapesNear(world.shape.land, x0 - amp, y0 - amp, x0 + size + amp, y0 + size + amp),
  };
  block = new Float32Array((BLOCK + 1) * (BLOCK + 1));
  for (let j = 0; j <= BLOCK; j++) {
    for (let i = 0; i <= BLOCK; i++) block[j * (BLOCK + 1) + i] = waterValue(world.shape, x0 + i * FIELD_CELL, y0 + j * FIELD_CELL, near);
  }
  f.blocks.set(key, block);
  return block;
}

/** Field value at any point (bilinear), clamped to the world's edges. */
export function fieldAt(world, x, y) {
  const fx = Math.max(0, Math.min(world.width / FIELD_CELL - 0.001, x / FIELD_CELL));
  const fy = Math.max(0, Math.min(world.height / FIELD_CELL - 0.001, y / FIELD_CELL));
  const bx = Math.floor(fx / BLOCK);
  const by = Math.floor(fy / BLOCK);
  const block = fieldBlock(world, bx, by);
  const lx = fx - bx * BLOCK;
  const ly = fy - by * BLOCK;
  const i = Math.min(BLOCK - 1, lx | 0);
  const j = Math.min(BLOCK - 1, ly | 0);
  const tx = lx - i;
  const ty = ly - j;
  const W = BLOCK + 1;
  const k = j * W + i;
  const a = block[k] + (block[k + 1] - block[k]) * tx;
  const b = block[k + W] + (block[k + W + 1] - block[k + W]) * tx;
  return a + (b - a) * ty;
}

function onLand(world, x, y) {
  if (world.shape) return fieldAt(world, x, y) >= 0;
  return world.land.some((r) => inRect(r, x, y));
}

function onStructure(world, x, y) {
  return world.structures.some((r) => inRect(r, x, y));
}

function onSolid(world, x, y) {
  return !!world.solid?.some((r) => inRect(r, x, y));
}

export function isWalkable(world, x, y) {
  return inBounds(world, x, y) && !onSolid(world, x, y) && (onLand(world, x, y) || onStructure(world, x, y));
}

export function isWater(world, x, y) {
  return inBounds(world, x, y) && !onLand(world, x, y) && !onStructure(world, x, y) && !onSolid(world, x, y);
}

/** The water zone at a point, or null if the point is not water. */
export function zoneAt(world, x, y) {
  if (!isWater(world, x, y)) return null;
  for (const z of world.zones) {
    const rects = zoneRects(z);
    if (!rects || rects.some((r) => inRect(r, x, y))) return z;
  }
  return null;
}

/** The named area at a point (e.g. "Pine Point"), or null. */
export function areaAt(world, x, y) {
  return world.areas?.find((a) => inRect(a.rect, x, y)) ?? null;
}

/**
 * Advance a position by one movement step. Used by the server (authoritative)
 * and can be used by the client for prediction later.
 * Axes are resolved separately so players slide along shorelines.
 */
export function stepMovement(world, pos, input, speed, dt) {
  let dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  let dy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
  if (dx === 0 && dy === 0) return { x: pos.x, y: pos.y, moved: false };
  const len = Math.hypot(dx, dy);
  dx = (dx / len) * speed * dt;
  dy = (dy / len) * speed * dt;
  let { x, y } = pos;
  if (isWalkable(world, x + dx, y)) x += dx;
  if (isWalkable(world, x, y + dy)) y += dy;
  return { x, y, moved: x !== pos.x || y !== pos.y };
}

// ---- the wilds: generated ponds, lakes, trails and bridges ------------------------------
//
// Everything outside the hand-made valley is generated from a fixed seed, so
// every server and every player gets exactly the same map. Ponds copy one of
// the valley's pond types (fish, bite rate, decor) under their own name;
// their zones keep `kind` = the type, so achievements and gear that care
// about a type of water count them all.

const WILD_LAKE = {
  id: 'wildLake', name: 'Wild Lake', biteRate: 0.85,
  fish: {
    boot: 3, cisco: 15, perch: 15, walleye: 14, smallmouth: 10, pike: 10, whitefish: 10, laketrout: 10,
    muskie: 4, sturgeon: 4, chinook: 3, stonejaw: 0.3, mossback: 0.3,
  },
};

const PREFIXES = [
  'Heron', 'Otter', 'Mossy', 'Cedar', 'Hollow', 'Bramble', 'Fox', 'Lantern', 'Misty', 'Copper', 'Silver', 'Reedy',
  'Stony', 'Amber', 'Raven', 'Birch', 'Thistle', 'Kingfisher', 'Moonlit', 'Owl', 'Badger', 'Hazel', 'Juniper',
  'Wren', 'Elder', 'Fern', 'Glimmer', 'Hart', 'Ivy', 'Larch', 'Marten', 'Nettle', 'Oak', 'Pebble', 'Quill', 'Rowan',
  'Sedge', 'Tansy', 'Umber', 'Vole', 'Whistle', 'Yarrow', 'Alder', 'Bluebell', 'Cobble', 'Dipper', 'Ember', 'Frost',
  'Gorse', 'Heather', 'Kestrel', 'Lark', 'Marsh', 'Newt', 'Osprey', 'Plover', 'Robin', 'Sparrow', 'Teal', 'Willet',
  'Aspen', 'Bracken', 'Clover', 'Dusk', 'Echo', 'Finch', 'Gully', 'Hidden', 'Iron', 'Jade',
];
const NOUNS = { willowPond: 'Pond', frogPond: 'Pool', crystalPond: 'Tarn', blackBog: 'Mire', millPond: 'Millpond', wildLake: 'Lake' };

/** Named regions of the wilds (checked after the valley's own areas). */
const WILD_AREAS = [
  ['northernWilds', 'Northern Wilds', 5120, 0, 3840, 3300],
  ['frostpine', 'Frostpine Reach', 8960, 0, 3840, 3300],
  ['heartwood', 'Heartwood', 5120, 3300, 3840, 3100],
  ['easternMarches', 'Eastern Marches', 8960, 3300, 3840, 3100],
  ['southernFens', 'Southern Fens', 0, 3840, 5120, 2560],
  ['lostValley', 'Lost Valley', 0, 6400, 4300, 3200],
  ['mistmoor', 'Mistmoor', 4300, 6400, 4300, 3200],
  ['farReaches', 'The Far Reaches', 8600, 6400, 4200, 3200],
];

function riverDistance(x, y) {
  let d = Infinity;
  for (let i = 1; i < RIVER.length; i++) d = Math.min(d, segmentDistance(x, y, RIVER[i - 1], RIVER[i]));
  return d;
}

/** Where the river crosses the segment a-b, or null. */
function riverCrossing(a, b) {
  for (let i = 1; i < RIVER.length; i++) {
    const p = RIVER[i - 1];
    const q = RIVER[i];
    const d = (b[0] - a[0]) * (q[1] - p[1]) - (b[1] - a[1]) * (q[0] - p[0]);
    if (!d) continue;
    const t = ((p[0] - a[0]) * (q[1] - p[1]) - (p[1] - a[1]) * (q[0] - p[0])) / d;
    const u = ((p[0] - a[0]) * (b[1] - a[1]) - (p[1] - a[1]) * (b[0] - a[0])) / d;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
  }
  return null;
}

function pondKind(x, y) {
  // Thresholds sit at the noise's quintiles, so each type is about as common.
  const b = fbm(x / 2600 + 3.3, y / 2600 + 8.1, 2);
  if (b < 0.403) return 'blackBog';
  if (b < 0.486) return 'frogPond';
  if (b < 0.567) return 'millPond';
  if (b < 0.647) return 'willowPond';
  return 'crystalPond';
}

function extendWorld(world) {
  const rnd = seeded(seedFrom('the wilds', world.id));
  const sh = world.shape;
  const VALLEY = { w: 5120, h: 3840 };
  const templates = Object.fromEntries(world.zones.map((z) => [z.id, z]));
  templates.wildLake = WILD_LAKE;
  const names = [...PREFIXES];
  for (let i = names.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [names[i], names[j]] = [names[j], names[i]];
  }

  // 1. Two great lakes of the wilds, then ponds (and the odd big lake) on a jittered grid.
  const lake = (name, x, y, rx, ry, lobes) => ({ name, x, y, rx, ry, reach: Math.max(rx, ry) * 1.3, lobes: [e(x, y, rx, ry), ...lobes], kind: 'wildLake' });
  const ponds = [
    lake('Silvermere', 8300, 5000, 900, 560, [e(8900, 5350, 420, 300), e(7700, 4750, 380, 260)]),
    lake('Stillwater Lake', 2900, 7500, 760, 480, [e(2400, 7700, 360, 260), e(3350, 7250, 320, 220)]),
  ];
  const CELL = 1000;
  for (let gy = 0; gy < Math.ceil(world.height / CELL); gy++) {
    for (let gx = 0; gx < Math.ceil(world.width / CELL); gx++) {
      const roll = rnd();
      const cx = (gx + 0.5) * CELL + (rnd() - 0.5) * CELL * 0.55;
      const cy = (gy + 0.5) * CELL + (rnd() - 0.5) * CELL * 0.55;
      const big = rnd() < 0.16;
      const rx = big ? 560 + rnd() * 240 : 190 + rnd() * 190;
      const ry = rx * (0.6 + rnd() * 0.35);
      const extra = [rnd(), rnd(), rnd(), rnd(), rnd()];
      if (roll < 0.2) continue; // open country
      const reach = Math.max(rx, ry) * 1.35;
      if (cx < VALLEY.w + reach + 150 && cy < VALLEY.h + reach + 150) continue;
      if (cx < reach + 200 || cy < reach + 200 || cx > world.width - reach - 200 || cy > world.height - reach - 200) continue;
      if (riverDistance(cx, cy) < reach + 320) continue;
      if (ponds.some((q) => Math.hypot(q.x - cx, q.y - cy) < reach + q.reach + 260)) continue;
      const lobes = [e(cx, cy, rx, ry)];
      lobes.push(e(cx + (extra[0] - 0.5) * rx * 1.1, cy + (extra[1] - 0.5) * ry * 1.1, rx * (0.45 + extra[2] * 0.3), ry * (0.45 + extra[3] * 0.3)));
      if (extra[4] < 0.5) lobes.push(e(cx - (extra[1] - 0.5) * rx, cy - (extra[0] - 0.5) * ry, rx * 0.4, ry * 0.45));
      ponds.push({ x: cx, y: cy, rx, ry, reach, lobes, kind: big ? 'wildLake' : pondKind(cx, cy) });
    }
  }
  for (const p of ponds) sh.water.push(...p.lobes);

  // 2. Zones, jetties and trail anchors.
  const zones = [];
  const anchors = [[4500, 2420], [4250, 840], [3120, 2900], [640, 2820], [2150, 2850], [4900, 3300]];
  ponds.forEach((p, i) => {
    const t = templates[p.kind];
    const name = p.name ?? `${names[i % names.length]} ${NOUNS[p.kind]}${i >= names.length ? ' II' : ''}`;
    const x0 = Math.min(...p.lobes.map((l) => l.e[0] - l.e[2])) - 90;
    const y0 = Math.min(...p.lobes.map((l) => l.e[1] - l.e[3])) - 90;
    const x1 = Math.max(...p.lobes.map((l) => l.e[0] + l.e[2])) + 90;
    const y1 = Math.max(...p.lobes.map((l) => l.e[1] + l.e[3])) + 90;
    zones.push({
      ...t, id: `wild${i}`, kind: p.kind, name, rect: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, label: true,
    });
    // A jetty from the nearest shore (of the four compass directions) out into the water.
    let best = null;
    const R = 1700;
    const near = { water: shapesNear(sh.water, p.x - R, p.y - R, p.x + R, p.y + R), land: shapesNear(sh.land, p.x - R, p.y - R, p.x + R, p.y + R) };
    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      let d = 0;
      while (d < 1600 && waterValue(sh, p.x + dx * d, p.y + dy * d, near) < 0) d += 12;
      if (d < 1600 && (!best || d < best.d)) best = { dx, dy, d };
    }
    if (!best) return;
    const out = Math.min(best.d * 0.55, 260);
    const inLand = 70;
    const [sx, sy] = [p.x + best.dx * best.d, p.y + best.dy * best.d];
    const a = [sx - best.dx * out, sy - best.dy * out];
    const b = [sx + best.dx * inLand, sy + best.dy * inLand];
    const vertical = best.dx === 0;
    world.structures.push(vertical
      ? { x: sx - 20, y: Math.min(a[1], b[1]), w: 40, h: Math.abs(b[1] - a[1]), type: 'dock' }
      : { x: Math.min(a[0], b[0]), y: sy - 20, w: Math.abs(b[0] - a[0]), h: 40, type: 'dock' });
    p.anchor = [sx + best.dx * (inLand + 30), sy + best.dy * (inLand + 30)];
  });
  const open = world.zones.findIndex((z) => z.id === 'open');
  world.zones.splice(open, 0, ...zones);

  // 3. Trails: connect every jetty to the valley's trails, nearest first, and
  //    bridge the river wherever a trail crosses it.
  const done = [...anchors];
  const todo = ponds.filter((p) => p.anchor).map((p) => p.anchor);
  const bridges = world.structures.filter((st) => st.type === 'bridge').map((st) => st.x + st.w / 2);
  while (todo.length) {
    let pick = null;
    for (let i = 0; i < todo.length; i++) {
      for (const d of done) {
        const dist = Math.hypot(todo[i][0] - d[0], todo[i][1] - d[1]);
        if (!pick || dist < pick.dist) pick = { i, d, dist };
      }
    }
    const [a] = todo.splice(pick.i, 1);
    const b = pick.d;
    const mid = [(a[0] + b[0]) / 2 + (rnd() - 0.5) * pick.dist * 0.25, (a[1] + b[1]) / 2 + (rnd() - 0.5) * pick.dist * 0.25];
    sh.trails.push([a, mid, b]);
    done.push(a);
    for (const [p, q] of [[a, mid], [mid, b]]) {
      const c = riverCrossing(p, q);
      if (c && !bridges.some((x) => Math.abs(x - c[0]) < 500)) {
        bridges.push(c[0]);
        world.structures.push({ x: Math.round(c[0] - 30), y: Math.round(c[1] - 170), w: 60, h: 340, type: 'bridge' });
      }
    }
  }

  // Fixed crossings further east, so the north and south wilds connect.
  for (const x of [6600, 9000, 11400]) {
    const i = RIVER.findIndex(([rx]) => rx > x);
    const [ax, ay] = RIVER[i - 1];
    const [bx, by] = RIVER[i];
    const y = ay + ((by - ay) * (x - ax)) / (bx - ax);
    world.structures.push({ x: x - 30, y: Math.round(y - 170), w: 60, h: 340, type: 'bridge' });
  }

  // 4. Named regions.
  for (const [id, name, x, y, w, h] of WILD_AREAS) {
    world.areas.push({ id, name, rect: { x, y, w, h }, label: { x: x + w / 2, y: y + h / 2 } });
  }
  world.wildPonds = ponds.length;
}

extendWorld(LOCATIONS.mirrorLake);
