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

import { fbm } from './noise.js';

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

// The river: it enters at the east edge of the map and flows into Mirror Lake
// at the River Mouth. The boat follows it in (BOAT.path in voyage.js).
export const RIVER = [[2780, 1000], [3300, 995], [3700, 985], [4100, 1030], [4500, 1000], [4900, 990], [5400, 1000]];

const e = (cx, cy, rx, ry) => ({ e: [cx, cy, rx, ry] });

export const LOCATIONS = {
  mirrorLake: {
    id: 'mirrorLake',
    name: 'Mirror Lake',
    width: 5120,
    height: 3840,
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
    shops: [{ id: 'bait', name: 'Bait Shop', x: 1395, y: 2075, range: 70 }],
    solid: [{ x: 1365, y: 2050, w: 60, h: 40 }], // the Bait Shop stall

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
        rect: { x: 3200, y: 780, w: 1920, h: 440 },
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

    hotspots: { count: 9, radius: 70, minLife: 45, maxLife: 90 },
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

/** Raw field value: < 0 is water, > 0 is land (roughly the distance to the shore). */
export function waterValue(shape, x, y) {
  const [wx, wy] = warpPoint(shape, x, y);
  let v = shapesDistance(shape.water, wx, wy);
  if (shape.land) v = Math.max(v, -shapesDistance(shape.land, wx, wy));
  const { amp, scale } = shape.bump;
  return v + (fbm(x / scale + 5.1, y / scale + 9.4, 2) - 0.5) * 2 * amp;
}

const FIELD_CELL = 8;
const fields = new WeakMap();

/** The world's water field, sampled on a grid once and cached. */
export function waterField(world) {
  let f = fields.get(world);
  if (f) return f;
  const gw = Math.ceil(world.width / FIELD_CELL) + 1;
  const gh = Math.ceil(world.height / FIELD_CELL) + 1;
  const v = new Float32Array(gw * gh);
  for (let j = 0; j < gh; j++) {
    for (let i = 0; i < gw; i++) v[j * gw + i] = waterValue(world.shape, i * FIELD_CELL, j * FIELD_CELL);
  }
  f = { gw, gh, v };
  fields.set(world, f);
  return f;
}

/** Field value at any point (bilinear), clamped to the world's edges. */
export function fieldAt(world, x, y) {
  const { gw, gh, v } = waterField(world);
  const fx = Math.max(0, Math.min(gw - 1.001, x / FIELD_CELL));
  const fy = Math.max(0, Math.min(gh - 1.001, y / FIELD_CELL));
  const i = fx | 0;
  const j = fy | 0;
  const tx = fx - i;
  const ty = fy - j;
  const k = j * gw + i;
  const a = v[k] + (v[k + 1] - v[k]) * tx;
  const b = v[k + gw] + (v[k + gw + 1] - v[k + gw]) * tx;
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
