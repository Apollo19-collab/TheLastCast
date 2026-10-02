// Small, deterministic noise helpers for procedural textures.
// Same inputs always give the same output, so every player sees the same lake.

const PERM = new Uint8Array(512);
{
  // Fixed-seed shuffle of 0..255.
  let s = 1234567;
  const rnd = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) PERM[i] = p[i & 255];
}

function hash(ix, iy) {
  return PERM[(PERM[ix & 255] + iy) & 255] / 255;
}

const smooth = (t) => t * t * (3 - 2 * t);

/** Smooth value noise in [0, 1]. */
export function noise(x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = smooth(x - ix);
  const fy = smooth(y - iy);
  const a = hash(ix, iy);
  const b = hash(ix + 1, iy);
  const c = hash(ix, iy + 1);
  const d = hash(ix + 1, iy + 1);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

/** Fractal noise in roughly [0, 1]: `octaves` layers of noise at doubling frequency. */
export function fbm(x, y, octaves = 3) {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += noise(x, y) * amp;
    norm += amp;
    x = x * 2.03 + 17.1;
    y = y * 2.03 + 9.7;
    amp *= 0.5;
  }
  return sum / norm;
}

/** Ridged noise: thin bright lines where noise crosses 0.5 (cracks, caustics). */
export function ridged(x, y) {
  return 1 - Math.abs(noise(x, y) * 2 - 1);
}

/** Noise that repeats every `period` units, for seamless tiling textures. */
export function tileNoise(x, y, period) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = smooth(x - ix);
  const fy = smooth(y - iy);
  const w = (v) => ((v % period) + period) % period;
  const a = hash(w(ix), w(iy));
  const b = hash(w(ix + 1), w(iy));
  const c = hash(w(ix), w(iy + 1));
  const d = hash(w(ix + 1), w(iy + 1));
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

/** Seeded random number generator (mulberry32). */
export function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable integer seed from a string or numbers. */
export function seedFrom(...parts) {
  let h = 2166136261;
  for (const ch of parts.join('|')) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
