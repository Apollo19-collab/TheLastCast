// Graphics quality: Low, Medium or High (Options menu). Saved in this browser.
//
// Each level is a set of switches the renderer and terrain read:
//   pixelRatio   max canvas pixels per CSS pixel (Low draws below screen
//                resolution and lets the browser scale it up)
//   tileRes      max terrain tile resolution (pixels per world unit)
//   decor        how much scenery (trees, bushes, flowers) per tile, 0..1
//   caustics     moving light layers on the water (0-2)
//   glints, surf, reeds, current, rain: animated extras on or off
//   prefetch     render tiles just off screen in spare time
//   tileBudget   ms per frame spent rendering new terrain tiles

const KEY = 'lastcast.graphics';

export const QUALITY = Object.freeze({
  low: {
    label: 'Low', desc: 'Fastest. Lower resolution, fewer trees, no water shimmer or sparkles.',
    pixelRatio: 0.75, tileRes: 1, decor: 0.45, caustics: 0, glints: false, surf: false, reeds: false, current: false, rain: 0.3,
    prefetch: false, tileBudget: 5,
  },
  medium: {
    label: 'Medium', desc: 'Balanced. Full scenery and water effects at standard resolution.',
    pixelRatio: 1, tileRes: 1.5, decor: 0.8, caustics: 1, glints: true, surf: true, reeds: true, current: true, rain: 0.7,
    prefetch: true, tileBudget: 7,
  },
  high: {
    label: 'High', desc: 'Best looking. Sharp on high-DPI screens, every effect on.',
    pixelRatio: 2, tileRes: 2, decor: 1, caustics: 2, glints: true, surf: true, reeds: true, current: true, rain: 1,
    prefetch: true, tileBudget: 8,
  },
});

function load() {
  try {
    const v = localStorage.getItem(KEY);
    if (v && QUALITY[v]) return v;
  } catch { /* storage unavailable */ }
  return 'high';
}

const listeners = new Set();

export const graphics = {
  level: load(),
  get settings() {
    return QUALITY[this.level];
  },
  set(level) {
    if (!QUALITY[level] || level === this.level) return;
    this.level = level;
    try { localStorage.setItem(KEY, level); } catch { /* not saved */ }
    for (const fn of listeners) fn(this.settings);
  },
  /** Call fn(settings) whenever the level changes. */
  onChange(fn) {
    listeners.add(fn);
  },
};
