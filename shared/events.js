// Map events: co-op happenings at a lake or pond, one every 10 minutes.
//
// The schedule follows the wall clock and a fixed seed, so the server and
// every client agree on what's coming without asking each other: the Events
// window lists upcoming events straight from eventsAround(). The server
// (server/events.js) runs the live part: progress, bonuses and rewards.
//
// All three types reward fishing together:
//   shoal  Feeding Shoal: bites get faster the more anglers fish in it, and
//          the end-of-event bonus is multiplied by the size of the group.
//   haul   The Great Haul: everyone shares one catch goal (bigger with more
//          anglers online); hit it in time and everyone who helped is paid,
//          by how much they helped.
//   tide   Golden Tide: every catch in the area fills a shared meter; when
//          it's full, everyone there gets a Golden Rush (double points).

import { seeded, seedFrom } from './noise.js';
import { zoneAt } from './world.js';

export const EVENT_SLOT = 600; // one event per 10 minutes
export const EVENT_LEAD = 60; // ...starting a minute into its slot

export const EVENT_TYPES = Object.freeze({
  shoal: {
    name: 'Feeding Shoal', icon: '🐟', color: '#4cc9f0', duration: 360, radius: 230,
    desc: 'A huge shoal is feeding. Bites come faster with every angler fishing in it, and the bonus at the end is multiplied by the size of the group.',
  },
  haul: {
    name: 'The Great Haul', icon: '🧺', color: '#7bd389', duration: 480, radius: 420,
    desc: 'Everyone works together to land the goal in time. Hit it and everyone who helped is paid by how many fish they caught.',
  },
  tide: {
    name: 'Golden Tide', icon: '✨', color: '#ffd166', duration: 480, radius: 420,
    desc: 'Every catch in the area fills a shared golden meter. Fill it and everyone there gets a Golden Rush: double points and better odds.',
  },
});
export const EVENT_IDS = Object.keys(EVENT_TYPES);

// Tuning (see server/events.js; a test keeps the rewards in line with fishing).
export const EVENT_TUNING = Object.freeze({
  shoal: { bite: 1.25, perAngler: 0.3, maxBite: 2.6, rare: 1.4, coinsPerFish: 5, maxGroup: 4, maxFish: 40 },
  haul: { goalBase: 10, goalPerAngler: 6, maxAnglers: 10, bite: 1.15, coins: 150, coinsPerFish: 15, maxFish: 40, xp: 250, failCoinsPerFish: 5 },
  tide: { meterBase: 250, meterPerAngler: 120, maxAnglers: 10, rush: 45, points: 2, rare: 1.5, coins: 50, coinsPerRush: 40 },
});

// The waters events can happen at: the valley's lake and ponds, and wild
// ponds within reach of South Beach.
const PLACE_ZONES = ['coldSpring', 'weedyCove', 'marsh', 'basin', 'rocks', 'reeds', 'shallows', 'river', 'eastRiver',
  'willowPond', 'frogPond', 'crystalPond', 'blackBog', 'millPond'];
const WILD_REACH = 7000;
const places = new WeakMap();

/** Every water an event can be held at: { zoneId, name, x, y }, a point in that zone's water. */
export function eventPlaces(world) {
  let list = places.get(world);
  if (list) return list;
  list = [];
  for (const z of world.zones) {
    const wild = z.id.startsWith('wild');
    if (!PLACE_ZONES.includes(z.id) && !wild) continue;
    const r = z.rect ?? z.rects?.[0];
    if (!r) continue;
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    if (wild && Math.hypot(cx - world.spawn.x, cy - world.spawn.y) > WILD_REACH) continue;
    // Spiral out from the middle of the zone to a point in its water.
    let found = null;
    for (let d = 0; d <= 500 && !found; d += 25) {
      for (let a = 0; a < 16 && !found; a++) {
        const x = cx + Math.cos((a / 16) * Math.PI * 2) * d;
        const y = cy + Math.sin((a / 16) * Math.PI * 2) * d;
        if (zoneAt(world, x, y) === z) found = { x: Math.round(x), y: Math.round(y) };
      }
    }
    if (found) list.push({ zoneId: z.id, name: z.name, ...found });
  }
  places.set(world, list);
  return list;
}

/** The event in a 10-minute slot (slot = floor(seconds / EVENT_SLOT)). */
export function eventForSlot(world, slot) {
  // The types take turns (so each comes round every 30 minutes); the place is random.
  const type = EVENT_IDS[((slot % EVENT_IDS.length) + EVENT_IDS.length) % EVENT_IDS.length];
  const list = eventPlaces(world);
  const rnd = seeded(seedFrom('map event place', slot));
  const place = list[Math.floor(rnd() * list.length)];
  const start = slot * EVENT_SLOT + EVENT_LEAD;
  return { id: slot, type, start, end: start + EVENT_TYPES[type].duration, place, radius: EVENT_TYPES[type].radius };
}

/** { current, upcoming[] } at a moment (seconds since the epoch). */
export function eventsAround(world, nowSec, count = 5) {
  const slot = Math.floor(nowSec / EVENT_SLOT);
  const here = eventForSlot(world, slot);
  const current = nowSec >= here.start && nowSec < here.end ? here : null;
  const upcoming = [];
  for (let s = here.start > nowSec ? slot : slot + 1; upcoming.length < count; s++) upcoming.push(eventForSlot(world, s));
  return { current, upcoming };
}

/** Whether a point is inside an event's area. */
export function inEvent(ev, x, y) {
  return !!ev && Math.hypot(x - ev.place.x, y - ev.place.y) <= ev.radius;
}

/** The Great Haul's goal for this many anglers online. */
export function haulGoal(anglers) {
  const t = EVENT_TUNING.haul;
  return t.goalBase + t.goalPerAngler * Math.min(t.maxAnglers, Math.max(1, anglers));
}

/** Golden Tide's meter size for this many anglers online. */
export function tideMeter(anglers) {
  const t = EVENT_TUNING.tide;
  return t.meterBase + t.meterPerAngler * Math.min(t.maxAnglers, Math.max(1, anglers));
}

/** Feeding Shoal bite multiplier with `n` anglers fishing in it. */
export function shoalBite(n) {
  const t = EVENT_TUNING.shoal;
  return Math.min(t.maxBite, t.bite + t.perAngler * Math.max(0, n - 1));
}

/** Compass direction and distance from (x, y) to a point, e.g. "1.2 km north-east". */
export function directionTo(x, y, tx, ty) {
  const dx = tx - x;
  const dy = ty - y;
  const d = Math.hypot(dx, dy);
  if (d < 300) return 'here';
  const names = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'];
  const dir = names[(Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) + 8) % 8];
  return `${(d / 1000).toFixed(1)} km ${dir}`;
}
