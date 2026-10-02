// World (fishing location) definitions and geometry helpers.
//
// A location is plain data:
//   land        rectangles players can walk on
//   structures  docks, jetties, bridges: walkable, sitting on top of water
//   zones       water areas that decide what bites where
//   areas       named places around the lake (HUD + map labels only)
//   solid       optional: neither walkable nor water (e.g. a boat's cabin)
// To add a new lake, add another object to LOCATIONS. The sea "world" used on
// boat voyages is built by makeSeaWorld() in voyage.js.

export const LOCATIONS = {
  mirrorLake: {
    id: 'mirrorLake',
    name: 'Mirror Lake',
    width: 3200,
    height: 2400,
    spawn: { x: 1500, y: 2150 },

    // Walkable ground. `type` is only used for rendering. A ring of shore
    // surrounds the lake so players can walk all the way around it.
    land: [
      { x: 0, y: 2000, w: 3200, h: 400, type: 'sand' }, // South Beach
      { x: 0, y: 0, w: 3200, h: 260, type: 'grass' }, // north shore
      { x: 0, y: 0, w: 260, h: 2400, type: 'grass' }, // west shore
      { x: 2940, y: 0, w: 260, h: 900, type: 'grass' }, // east shore, north of the river
      { x: 2940, y: 1100, w: 260, h: 1300, type: 'grass' }, // east shore, south of the river
      { x: 2700, y: 1750, w: 500, h: 650, type: 'rock' }, // rocky point
      { x: 1300, y: 260, w: 300, h: 640, type: 'grass' }, // Pine Point peninsula
    ],

    // Walkable structures that sit on top of water.
    structures: [
      { x: 1572, y: 1640, w: 56, h: 370, type: 'dock' }, // South Beach dock
      { x: 1490, y: 1600, w: 220, h: 50, type: 'dock' },
      { x: 1418, y: 890, w: 64, h: 280, type: 'dock' }, // Pine Point jetty
      { x: 250, y: 880, w: 330, h: 40, type: 'dock' }, // Lily Marsh boardwalk
      { x: 3040, y: 880, w: 60, h: 240, type: 'bridge' }, // bridge over the river
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
        rects: [{ x: 2600, y: 820, w: 340, h: 360 }, { x: 2940, y: 900, w: 260, h: 200 }],
        biteRate: 1.0,
        decor: 'current',
        // Fresh, moving water draws in fish running up from the lake.
        fish: {
          boot: 2, mooneye: 25, smallmouth: 18, walleye: 15, trout: 15,
          steelhead: 10, chinook: 7, riverking: 0.5,
        },
      },
      // ---- Pine Point (north) ----
      {
        id: 'coldSpring',
        name: 'Cold Spring',
        rect: { x: 1600, y: 260, w: 420, h: 520 },
        biteRate: 0.8,
        // A spring under the point keeps this water cold all year.
        fish: {
          boot: 2, cisco: 15, brooktrout: 30, trout: 15, whitefish: 15,
          laketrout: 10, burbot: 8, frostfin: 0.5,
        },
      },
      {
        id: 'weedyCove',
        name: 'Weedy Cove',
        rect: { x: 860, y: 260, w: 440, h: 520 },
        biteRate: 1.1,
        decor: 'reeds',
        fish: { boot: 4, perch: 25, bluegill: 15, pickerel: 20, bass: 15, pike: 10, muskie: 3 },
      },
      // ---- Lily Marsh (west) ----
      {
        id: 'marsh',
        name: 'Lily Marsh',
        rect: { x: 260, y: 450, w: 480, h: 900 },
        biteRate: 1.2,
        decor: 'lilies',
        fish: {
          boot: 5, bullhead: 30, crappie: 20, pumpkinseed: 15, pickerel: 12,
          bowfin: 12, gar: 5, marshqueen: 0.5,
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
          burbot: 12, sturgeon: 15, pike: 5, ghost: 1.2,
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
          laketrout: 15, burbot: 12, pike: 6, sturgeon: 12, ghost: 0.5,
        },
      },
      {
        id: 'dockShade',
        name: 'Dock Shade',
        rect: { x: 1540, y: 1650, w: 120, h: 210 },
        label: false, // the dock covers the middle of this zone
        biteRate: 1.1,
        // Fish that hide under structure.
        fish: { boot: 4, bluegill: 25, crappie: 30, perch: 20, catfish: 12, bass: 10, walleye: 3 },
      },
      {
        id: 'reeds',
        name: 'Reed Bed',
        rect: { x: 260, y: 1400, w: 440, h: 600 },
        biteRate: 1.0,
        decor: 'reeds',
        // Weedy ambush hunters.
        fish: {
          boot: 4, shiner: 15, rudd: 25, perch: 25, bluegill: 10, tench: 15,
          bowfin: 10, bass: 12, pike: 10, muskie: 4, mossback: 0.5,
        },
      },
      {
        id: 'rocks',
        name: 'Rocky Drop-off',
        rect: { x: 2300, y: 1450, w: 640, h: 550 },
        biteRate: 0.9,
        // The lake bed falls away steeply here, so deep-water fish come in close.
        fish: {
          boot: 3, perch: 12, smallmouth: 30, trout: 25, walleye: 18, bass: 12,
          burbot: 7, laketrout: 7, sturgeon: 2, stonejaw: 0.5,
        },
      },
      {
        id: 'shallows',
        name: 'Shallows',
        rect: { x: 700, y: 1860, w: 1600, h: 140 },
        biteRate: 1.3,
        fish: { boot: 8, bluegill: 35, pumpkinseed: 30, shiner: 25, perch: 20, carp: 12, bass: 3, koi: 2 },
      },
      {
        id: 'open',
        name: 'Open Lake',
        rect: null,
        biteRate: 0.9,
        fish: {
          boot: 5, crappie: 22, bluegill: 15, perch: 15, carp: 22, trout: 12,
          walleye: 10, gar: 8, catfish: 8, pike: 4,
        },
      },
    ],

    // Named places, checked in order. `label` is where the name is painted.
    areas: [
      { id: 'pinePoint', name: 'Pine Point', rect: { x: 850, y: 0, w: 1250, h: 1200 }, label: { x: 1450, y: 130 } },
      { id: 'riverMouth', name: 'River Mouth', rect: { x: 2450, y: 600, w: 750, h: 800 }, label: { x: 3070, y: 780 } },
      { id: 'lilyMarsh', name: 'Lily Marsh', rect: { x: 0, y: 300, w: 800, h: 1100 }, label: { x: 130, y: 820 } },
      { id: 'southBeach', name: 'South Beach', rect: { x: 0, y: 1350, w: 3200, h: 1050 }, label: { x: 1100, y: 2250 } },
    ],

    hotspots: { count: 5, radius: 70, minLife: 45, maxLife: 90 },
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

function onLand(world, x, y) {
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
