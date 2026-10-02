// World (fishing location) definitions and geometry helpers.
//
// A location is plain data: land rectangles players can walk on, structures
// (docks, piers) that are walkable over water, and water zones that decide
// what bites where. To add a new location, add another object to LOCATIONS.

export const LOCATIONS = {
  mirrorLake: {
    id: 'mirrorLake',
    name: 'Mirror Lake',
    width: 1600,
    height: 1000,
    spawn: { x: 560, y: 880 },

    // Walkable ground. `type` is only used for rendering.
    land: [
      { x: 0, y: 800, w: 1600, h: 200, type: 'sand' },
      { x: 0, y: 0, w: 180, h: 1000, type: 'grass' },
      { x: 0, y: 0, w: 1600, h: 90, type: 'grass' },
      { x: 1400, y: 540, w: 200, h: 460, type: 'rock' },
    ],

    // Walkable structures that sit on top of water.
    structures: [
      { x: 772, y: 420, w: 56, h: 390, type: 'dock' },
      { x: 690, y: 380, w: 220, h: 50, type: 'dock' },
    ],

    // Water zones, checked in order; the first match wins.
    // A zone with `rect: null` is the default for any other water.
    // biteRate > 1 means faster bites. `fish` maps species id -> weight.
    zones: [
      {
        id: 'deep',
        name: 'Deep Water',
        rect: { x: 480, y: 120, w: 700, h: 240 },
        biteRate: 0.6,
        fish: { boot: 2, carp: 20, catfish: 30, trout: 15, pike: 15, sturgeon: 15, ghost: 1 },
      },
      {
        id: 'reeds',
        name: 'Reed Bed',
        rect: { x: 180, y: 90, w: 230, h: 710 },
        biteRate: 1.0,
        fish: { boot: 4, bluegill: 20, perch: 35, bass: 20, pike: 12 },
      },
      {
        id: 'rocks',
        name: 'Rocky Drop-off',
        rect: { x: 1150, y: 420, w: 250, h: 380 },
        biteRate: 0.9,
        fish: { boot: 3, perch: 15, trout: 35, bass: 30, catfish: 12, pike: 5 },
      },
      {
        id: 'shallows',
        name: 'Shallows',
        rect: { x: 180, y: 660, w: 1220, h: 140 },
        biteRate: 1.3,
        fish: { boot: 8, bluegill: 45, perch: 30, carp: 15, bass: 2 },
      },
      {
        id: 'open',
        name: 'Open Lake',
        rect: null,
        biteRate: 0.9,
        fish: { boot: 5, bluegill: 20, perch: 20, carp: 25, trout: 15, catfish: 10, pike: 5 },
      },
    ],

    hotspots: { count: 2, radius: 70, minLife: 45, maxLife: 90 },
  },
};

export const DEFAULT_LOCATION = 'mirrorLake';

function inRect(r, x, y) {
  return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
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

export function isWalkable(world, x, y) {
  return inBounds(world, x, y) && (onLand(world, x, y) || onStructure(world, x, y));
}

export function isWater(world, x, y) {
  return inBounds(world, x, y) && !onLand(world, x, y) && !onStructure(world, x, y);
}

/** The water zone at a point, or null if the point is not water. */
export function zoneAt(world, x, y) {
  if (!isWater(world, x, y)) return null;
  for (const z of world.zones) {
    if (!z.rect || inRect(z.rect, x, y)) return z;
  }
  return null;
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
