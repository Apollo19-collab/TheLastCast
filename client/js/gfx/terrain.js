// Terrain: textured ground and water, baked into cached tiles ("chunks").
//
// Nothing is worked out for the whole map up front: the map is huge, so
// everything is made per 256x256-unit chunk, only when that chunk comes near
// the screen, and old chunks are forgotten again.
//
// 1. Water comes from the same organic field the server uses for collision
//    (fieldAt in shared/world.js: < 0 is water, roughly the distance to the
//    shore), so the shoreline you see is the one you walk on. It drives water
//    depth colour, wet sand and foam.
// 2. Per chunk, `data` holds the ground type of each 8-unit cell (beaches,
//    rocky ground, meadow/forest grass, dirt trails), the blurred per-zone
//    water tint, the surf points along the shore, and the animated extras
//    (sparkles, reeds, current streaks).
// 3. Each chunk is rendered once, per pixel, into two canvases: `water`
//    (opaque) and `land` (transparent over water, with docks and scenery
//    stamped on). The renderer draws animated water between the two. Chunks
//    are made a few per frame and kept in a small cache.
// 4. A low-resolution overview of the whole world (for the minimap) fills in
//    a few rows at a time in spare frame time.
// The terrain extends past the world edge (forest, and the river continues),
// so the centred camera never shows a void.

import { fbm, noise, ridged, seeded, seedFrom, tileNoise } from './noise.js';
import { spritePools, stamp } from './sprites.js';
import { THEME } from '../theme.js';
import { fieldAt, segmentDistance, shapesDistance, warpPoint, zoneAt } from '/shared/world.js';

const CHUNK = 256; // chunk size, world units
const CELL = 8; // ground-type resolution
const CELLS = CHUNK / CELL;
const TINT_CELL = 16; // water-tint resolution
const TINTS = CHUNK / TINT_CELL;
const TINT_BLUR = 3; // box-blur radius (cells), 3 passes
const TINT_PAD = TINT_BLUR * 3;
const MAX_CACHED = 140; // rendered chunk canvases
const MAX_DATA = 700; // chunk data (types, tints, extras)
const OVERVIEW_STEP = 32; // world units per overview pixel
const OV_BLOCK = 16; // overview pixels per block side
const TYPE_INDEX = { grass: 0, sand: 1, rock: 2, dirt: 3 };
const TYPE_NAMES = ['grass', 'sand', 'rock', 'dirt'];

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const smoothstep = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/** A Map that forgets its oldest entries past `max`. */
function remember(map, key, value, max) {
  map.set(key, value);
  if (map.size > max) map.delete(map.keys().next().value);
  return value;
}

export class Terrain {
  constructor(world) {
    this.world = world;
    this.cache = new Map(); // rendered chunks
    this.data = new Map(); // chunk data
    this.decorCache = new Map();
    this.res = 1;
    this.trails = (world.shape.trails ?? []).map((pts) => {
      const xs = pts.map((p) => p[0]);
      const ys = pts.map((p) => p[1]);
      return { pts, x0: Math.min(...xs) - 40, x1: Math.max(...xs) + 40, y0: Math.min(...ys) - 40, y1: Math.max(...ys) + 40 };
    });
  }

  // ---- fields ---------------------------------------------------------------------

  /** Signed distance-ish to the shoreline (world units): + on land, - in water. Extended past the world's edges. */
  sdf(x, y) {
    const w = this.world;
    return fieldAt(w, clamp(x, 0, w.width - 1), clamp(y, 0, w.height - 1));
  }

  /** Distance to the nearest dirt trail. */
  trailDistance(x, y) {
    let d = Infinity;
    for (const t of this.trails) {
      if (x < t.x0 || x > t.x1 || y < t.y0 || y > t.y1) continue;
      for (let i = 1; i < t.pts.length; i++) d = Math.min(d, segmentDistance(x, y, t.pts[i - 1], t.pts[i]));
    }
    return d;
  }

  /**
   * What the ground is at a land point `s` units from the water: rocky
   * ground, beaches (wide where the world marks them, patchy elsewhere), dirt
   * trails, or grass. Edges are roughened with noise so nothing meets in a
   * straight line.
   */
  groundType(x, y, s) {
    const sh = this.world.shape;
    const [wx, wy] = warpPoint(sh, x, y);
    const rough = (fbm(x / 45 + 3, y / 45 + 7, 2) - 0.5) * 50;
    // Rocky ground: solid stone along the water, broken up by grass further in.
    if (shapesDistance(sh.rock, wx, wy) + rough < 0 && (s < 140 || fbm(x / 110 + 5, y / 110 + 9, 2) > 0.5)) return TYPE_INDEX.rock;
    if (s > 90 && fbm(x / 300 + 17, y / 300 + 3, 3) > 0.76) return TYPE_INDEX.rock; // small outcrops in the hills
    if (s < 420 && shapesDistance(sh.beaches, wx, wy) + rough < 0) return TYPE_INDEX.sand;
    // Elsewhere the banks are mostly grass and mud, with the odd sandy cove.
    const beach = 2 + 50 * smoothstep(0.55, 0.8, fbm(x / 420 + 9, y / 420 + 2, 2));
    if (s < beach + rough * 0.3) return TYPE_INDEX.sand;
    if (this.trailDistance(x, y) < 14 + (noise(x / 20, y / 20) - 0.5) * 10) return TYPE_INDEX.dirt;
    return TYPE_INDEX.grass;
  }

  /** 0 (open meadow) .. 1 (deep forest), for ground colour and trees. */
  forestAt(x, y) {
    return smoothstep(0.47, 0.66, fbm(x / 650 + 40, y / 650 + 20, 3));
  }

  // ---- per-chunk data ---------------------------------------------------------------

  /** Everything a chunk needs before it can be drawn (made once, then cached). */
  chunkData(cx, cy) {
    const key = `${cx},${cy}`;
    return this.data.get(key) ?? remember(this.data, key, this.buildData(cx, cy), MAX_DATA);
  }

  buildData(cx, cy) {
    const x0 = cx * CHUNK;
    const y0 = cy * CHUNK;
    const w = this.world;

    // Ground type per cell (-1 = water).
    const types = new Int8Array(CELLS * CELLS);
    for (let j = 0; j < CELLS; j++) {
      for (let i = 0; i < CELLS; i++) {
        const x = x0 + (i + 0.5) * CELL;
        const y = y0 + (j + 0.5) * CELL;
        const s = this.sdf(x, y);
        types[j * CELLS + i] = s < 0 ? -1 : this.groundType(x, y, s);
      }
    }

    // Per-zone water tint, blurred so zones blend softly. Worked out over a
    // padded window so the blur is seamless across chunk edges.
    const n = TINTS + 2 * TINT_PAD;
    const ch = [new Float32Array(n * n), new Float32Array(n * n), new Float32Array(n * n), new Float32Array(n * n)];
    let any = false;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const x = clamp(x0 + (i - TINT_PAD) * TINT_CELL, 0, w.width - 1);
        const y = clamp(y0 + (j - TINT_PAD) * TINT_CELL, 0, w.height - 1);
        const z = zoneAt(w, x, y);
        const tint = z && (THEME.waterTint[z.kind ?? z.id]);
        if (!tint) continue;
        any = true;
        const k = j * n + i;
        ch[0][k] = tint[0] * tint[3];
        ch[1][k] = tint[1] * tint[3];
        ch[2][k] = tint[2] * tint[3];
        ch[3][k] = tint[3];
      }
    }
    let tint = null;
    if (any) {
      const tmp = new Float32Array(n * n);
      const R = TINT_BLUR;
      for (const c of ch) {
        for (let pass = 0; pass < 3; pass++) {
          for (let j = 0; j < n; j++) {
            let acc = 0;
            for (let i = -R; i <= R; i++) acc += c[j * n + clamp(i, 0, n - 1)];
            for (let i = 0; i < n; i++) {
              tmp[j * n + i] = acc / (2 * R + 1);
              acc += c[j * n + clamp(i + R + 1, 0, n - 1)] - c[j * n + clamp(i - R, 0, n - 1)];
            }
          }
          for (let i = 0; i < n; i++) {
            let acc = 0;
            for (let j = -R; j <= R; j++) acc += tmp[clamp(j, 0, n - 1) * n + i];
            for (let j = 0; j < n; j++) {
              c[j * n + i] = acc / (2 * R + 1);
              acc += tmp[clamp(j + R + 1, 0, n - 1) * n + i] - tmp[clamp(j - R, 0, n - 1) * n + i];
            }
          }
        }
      }
      // Keep the chunk's own cells, plus one on each side for interpolation.
      const m = TINTS + 2;
      tint = ch.map((c) => {
        const out = new Float32Array(m * m);
        for (let j = 0; j < m; j++) for (let i = 0; i < m; i++) out[j * m + i] = c[(j + TINT_PAD - 1) * n + (i + TINT_PAD - 1)];
        return out;
      });
    }

    // Animated extras: surf along the shore, sparkles, reeds and current streaks.
    const rnd = seeded(seedFrom('dynamic', cx, cy));
    const coast = [];
    for (let j = 0; j < CELLS; j++) {
      for (let i = (j % 2); i < CELLS; i += 2) {
        const x = x0 + i * CELL;
        const y = y0 + j * CELL;
        const s = this.sdf(x, y);
        if (s >= 0 || s < -CELL * 1.2) continue;
        if (x < -200 || y < -200 || x > w.width + 200 || y > w.height + 200) continue;
        let nx = this.sdf(x - CELL, y) - this.sdf(x + CELL, y);
        let ny = this.sdf(x, y - CELL) - this.sdf(x, y + CELL);
        const len = Math.hypot(nx, ny) || 1;
        nx /= len;
        ny /= len;
        // Irregular spacing, length and rhythm so the surf doesn't look like a dashed line.
        const jitter = (noise(x * 0.31, y * 0.31) - 0.5) * 10;
        if (noise(x * 0.2 + 7, y * 0.2) < 0.3) continue;
        coast.push({
          x: x - ny * jitter, y: y + nx * jitter, nx, ny,
          len: 3 + noise(x * 0.13, y * 0.13 + 3) * 8,
          phase: noise(x * 0.05, y * 0.05) * 12 + noise(x * 0.4, y * 0.4) * 2,
        });
      }
    }
    const glints = [];
    const reeds = [];
    const current = [];
    for (let i = 0; i < 74; i++) {
      const x = x0 + rnd() * CHUNK;
      const y = y0 + rnd() * CHUNK;
      const s = this.sdf(x, y);
      const roll = rnd();
      if (s >= -2) continue;
      if (i < 12 && s < -12) glints.push({ x, y, phase: roll * 100, speed: 0.6 + rnd() * 0.8 });
      const z = zoneAt(w, clamp(x, 0, w.width - 1), clamp(y, 0, w.height - 1));
      if (z?.decor === 'reeds' && s > -160) {
        reeds.push({ x, y, h: 10 + rnd() * 14, phase: rnd() * 6, blades: 2 + Math.floor(rnd() * 3), cattail: rnd() < 0.35 });
      }
      if (z?.decor === 'current' && i % 2 === 0) current.push({ x, y, len: 14 + rnd() * 22, phase: rnd() * 1000, min: x0, span: CHUNK });
    }
    reeds.sort((a, b) => a.y - b.y);
    return { types, tint, coast, glints, reeds, current };
  }

  /** Ground type at a point (-1 = water). */
  typeAt(x, y) {
    const i = Math.floor(x / CELL);
    const j = Math.floor(y / CELL);
    const cx = Math.floor(i / CELLS);
    const cy = Math.floor(j / CELLS);
    const d = this.chunkData(cx, cy);
    return d.types[(j - cy * CELLS) * CELLS + (i - cx * CELLS)];
  }

  /** Writes the blurred water tint at (x, y) into out = [r, g, b, a] (premultiplied). */
  tintAt(x, y, out) {
    const cx = Math.floor(x / CHUNK);
    const cy = Math.floor(y / CHUNK);
    const tint = this.chunkData(cx, cy).tint;
    if (!tint) {
      out[0] = out[1] = out[2] = out[3] = 0;
      return out;
    }
    // Stored node k sits at chunk + (k - 1) * TINT_CELL (one extra node before the chunk).
    const fx = clamp((x - cx * CHUNK) / TINT_CELL + 1, 0, TINTS + 0.999);
    const fy = clamp((y - cy * CHUNK) / TINT_CELL + 1, 0, TINTS + 0.999);
    const i = fx | 0;
    const j = fy | 0;
    const tx = fx - i;
    const ty = fy - j;
    const m = TINTS + 2;
    const k = j * m + i;
    for (let c = 0; c < 4; c++) {
      const g = tint[c];
      const a = g[k] + (g[k + 1] - g[k]) * tx;
      const b = g[k + m] + (g[k + m + 1] - g[k + m]) * tx;
      out[c] = a + (b - a) * ty;
    }
    return out;
  }

  /** The chunk data of every chunk overlapping a view rect (for the animated extras). */
  dataIn(view, margin = 40) {
    const out = [];
    for (let cy = Math.floor((view.y0 - margin) / CHUNK); cy <= Math.floor((view.y1 + margin) / CHUNK); cy++) {
      for (let cx = Math.floor((view.x0 - margin) / CHUNK); cx <= Math.floor((view.x1 + margin) / CHUNK); cx++) {
        out.push(this.chunkData(cx, cy));
      }
    }
    return out;
  }

  // ---- per-pixel colour ------------------------------------------------------------

  waterColor(x, y, e, out, tint) {
    const depth = -e;
    const t = Math.pow(smoothstep(0, 420, depth), 0.8);
    const S = THEME.water.shallow;
    const Dp = THEME.water.deep;
    let r = S[0] + (Dp[0] - S[0]) * t;
    let g = S[1] + (Dp[1] - S[1]) * t;
    let b = S[2] + (Dp[2] - S[2]) * t;
    this.tintAt(x, y, tint);
    if (tint[3] > 0.001) {
      const a = Math.min(tint[3], 1);
      r += (tint[0] / tint[3] - r) * a;
      g += (tint[1] / tint[3] - g) * a;
      b += (tint[2] / tint[3] - b) * a;
    }
    const v = (fbm(x / 70, y / 70, 2) - 0.5) * 18;
    r += v;
    g += v;
    b += v;
    if (depth < 34) {
      // The sandy bottom shows through very shallow water.
      const k = (1 - depth / 34) * 0.35;
      r += (150 - r) * k;
      g += (172 - g) * k;
      b += (140 - b) * k;
    }
    if (depth < 7) {
      const k = (1 - Math.max(depth, 0) / 7) * 0.45; // foam line
      r += (232 - r) * k;
      g += (244 - g) * k;
      b += (238 - b) * k;
    }
    out[0] = r;
    out[1] = g;
    out[2] = b;
  }

  landColor(x, y, e, out) {
    // Warp the lookup so borders between grass, sand and rock wander naturally.
    const wx = x + (noise(x / 34, y / 34) - 0.5) * 26;
    const wy = y + (noise(x / 34 + 40, y / 34 + 40) - 0.5) * 26;
    let type = this.typeAt(wx, wy);
    if (type < 0) type = this.typeAt(x, y);
    if (type < 0) type = 1;
    let r;
    let g;
    let b;
    const wet = clamp(1 - e / 18, 0, 1);
    if (type === 0) {
      const n = fbm(x / 95, y / 95, 3);
      const f = noise(x / 3.5, y / 3.5) - 0.5;
      // Bright, slightly yellow meadows out in the open; dark, mossy floor under the trees.
      const forest = this.forestAt(x, y);
      const dry = smoothstep(0.55, 0.8, fbm(x / 260 + 70, y / 260 + 11, 2)) * (1 - forest);
      r = 64 + n * 44 + f * 16 - forest * 20 + dry * 34;
      g = 104 + n * 50 + f * 18 - forest * 22 + dry * 16;
      b = 44 + n * 26 + f * 10 - forest * 10 - dry * 4;
      if (wet > 0) { // muddy bank
        r += (104 - r) * wet * 0.75;
        g += (96 - g) * wet * 0.75;
        b += (66 - b) * wet * 0.75;
      }
    } else if (type === 1) {
      const n = fbm(x / 130, y / 130, 2);
      const ripple = Math.sin(x * 0.11 + y * 0.03 + n * 7) * 0.5 + 0.5;
      const grain = noise(x / 1.6, y / 1.6) - 0.5;
      r = 206 + n * 26 - ripple * 9 + grain * 18;
      g = 184 + n * 26 - ripple * 9 + grain * 16;
      b = 132 + n * 24 - ripple * 8 + grain * 12;
      if (wet > 0) {
        r += (164 - r) * wet * 0.75;
        g += (140 - g) * wet * 0.75;
        b += (98 - b) * wet * 0.75;
      }
    } else if (type === 3) {
      // A packed dirt trail with ruts and small stones.
      const n = fbm(x / 60, y / 60, 2);
      const grain = noise(x / 2.2, y / 2.2) - 0.5;
      const stone = noise(x / 5 + 11, y / 5 + 4) > 0.86 ? 26 : 0;
      r = 128 + n * 30 + grain * 22 + stone;
      g = 102 + n * 24 + grain * 18 + stone;
      b = 70 + n * 18 + grain * 14 + stone;
      if (wet > 0) {
        r -= wet * 26;
        g -= wet * 22;
        b -= wet * 16;
      }
    } else {
      const n = fbm(x / 48, y / 48, 3);
      const crack = ridged(x / 22, y / 22);
      r = 96 + n * 64;
      g = 99 + n * 62;
      b = 106 + n * 60;
      if (crack > 0.9) {
        r -= 38;
        g -= 38;
        b -= 36;
      }
      if (wet > 0) {
        r -= wet * 22;
        g -= wet * 20;
        b -= wet * 16;
      }
    }
    out[0] = r;
    out[1] = g;
    out[2] = b;
  }

  // ---- chunks -----------------------------------------------------------------------

  /** Pixel density for chunk canvases; changing it discards the cache. */
  setResolution(res) {
    if (res === this.res) return;
    this.res = res;
    this.cache.clear();
  }

  renderChunk(cx, cy) {
    const res = this.res;
    // One extra pixel on every side; draw() crops it off so tile edges never
    // blend with transparent pixels (which shows as faint seams).
    const inner = Math.ceil(CHUNK * res);
    const px = inner + 2;
    const x0 = cx * CHUNK - 1 / res;
    const y0 = cy * CHUNK - 1 / res;
    const waterCanvas = document.createElement('canvas');
    const landCanvas = document.createElement('canvas');
    waterCanvas.width = landCanvas.width = px;
    waterCanvas.height = landCanvas.height = px;
    const wg = waterCanvas.getContext('2d');
    const lg = landCanvas.getContext('2d');
    const wImg = wg.createImageData(px, px);
    const lImg = lg.createImageData(px, px);
    const wd = wImg.data;
    const ld = lImg.data;
    const col = [0, 0, 0];
    const tint = [0, 0, 0, 0];

    for (let j = 0; j < px; j++) {
      const y = y0 + (j + 0.5) / res;
      for (let i = 0; i < px; i++) {
        const x = x0 + (i + 0.5) / res;
        const k = (j * px + i) * 4;
        const e = this.sdf(x, y);
        if (e < 2) {
          this.waterColor(x, y, e, col, tint);
          wd[k] = col[0];
          wd[k + 1] = col[1];
          wd[k + 2] = col[2];
        } else {
          wd[k] = 60;
          wd[k + 1] = 120;
          wd[k + 2] = 120;
        }
        wd[k + 3] = 255;
        if (e > -2) {
          this.landColor(x, y, e, col);
          ld[k] = col[0];
          ld[k + 1] = col[1];
          ld[k + 2] = col[2];
          ld[k + 3] = smoothstep(-1.5, 1.5, e) * 255;
        }
      }
    }
    wg.putImageData(wImg, 0, 0);
    lg.putImageData(lImg, 0, 0);

    for (const g of [wg, lg]) {
      g.setTransform(res, 0, 0, res, -x0 * res, -y0 * res);
    }
    const near = (r, m) => r.x < x0 + CHUNK + m && r.x + r.w > x0 - m && r.y < y0 + CHUNK + m && r.y + r.h > y0 - m;
    // Shadows of docks on the water.
    wg.fillStyle = THEME.structure.shadow;
    for (const st of this.world.structures) if (near(st, 20)) wg.fillRect(st.x + 5, st.y + 7, st.w, st.h);
    // Scenery from this chunk and its neighbours (so sprites crossing a seam aren't cut).
    const items = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) items.push(...this.decorFor(cx + dx, cy + dy));
    items.sort((a, b) => a.layer - b.layer || a.y - b.y);
    const pools = spritePools();
    for (const d of items) {
      const sprite = pools[d.kind][d.variant % pools[d.kind].length];
      const half = (sprite.w * d.scale) / 2;
      if (d.x + half < x0 || d.x - half > x0 + CHUNK || d.y + half < y0 || d.y - half > y0 + CHUNK) continue;
      stamp(d.kind === 'lily' ? wg : lg, sprite, d.x, d.y, d.scale);
    }
    for (const st of this.world.structures) if (near(st, 10)) drawStructure(lg, st);

    return { water: waterCanvas, land: landCanvas, inner };
  }

  /** Deterministic scenery for one chunk. */
  decorFor(cx, cy) {
    const key = `${cx},${cy}`;
    if (this.decorCache.has(key)) return this.decorCache.get(key);
    const rnd = seeded(seedFrom('decor', cx, cy));
    const w = this.world;
    const out = [];
    const x0 = cx * CHUNK;
    const y0 = cy * CHUNK;
    const structures = w.structures.filter((s) => s.x < x0 + CHUNK + 80 && s.x + s.w > x0 - 80 && s.y < y0 + CHUNK + 80 && s.y + s.h > y0 - 80);
    const nearStructure = (x, y, m) => structures.some((s) => x > s.x - m && x < s.x + s.w + m && y > s.y - m && y < s.y + s.h + m);
    const add = (kind, x, y, layer, scale = 0.85 + rnd() * 0.3) => out.push({ kind, variant: Math.floor(rnd() * 100), x, y, layer, scale });
    for (let n = 0; n < 90; n++) {
      const x = x0 + rnd() * CHUNK;
      const y = y0 + rnd() * CHUNK;
      const s = this.sdf(x, y);
      const outside = x < 0 || y < 0 || x > w.width || y > w.height;
      if (s < -5) {
        const z = zoneAt(w, clamp(x, 0, w.width - 1), clamp(y, 0, w.height - 1));
        if (z?.decor === 'lilies' && rnd() < 0.55) add('lily', x, y, 0);
        continue;
      }
      if (s < 5) continue;
      const type = this.typeAt(x, y);
      const roll = rnd();
      if (type === 0) {
        const forest = this.forestAt(x, y);
        const pineCountry = (y < 1150 && x > 700 && x < 2300) || (outside && y < 600) || noise(x / 900 + 2, y / 900 + 5) > 0.62;
        if (s > 55 && !nearStructure(x, y, 60) && roll < (outside ? 0.85 : 0.08 + 0.72 * forest)) {
          add(pineCountry || rnd() < 0.15 ? 'pine' : 'tree', x, y, 2);
        } else if (s > 18 && roll < 0.25 + 0.35 * forest) add('bush', x, y, 1);
        else if (roll < 0.62 + 0.25 * forest) add('tuft', x, y, 0);
        else add('flowers', x, y, 0);
      } else if (type === 3) {
        if (roll < 0.12) add('pebbles', x, y, 0, 0.6 + rnd() * 0.3);
      } else if (type === 1) {
        if (s < 30 && roll < 0.06) add('driftwood', x, y, 0);
        else if (roll < 0.18) add('pebbles', x, y, 0);
      } else if (type === 2) {
        if (roll < 0.35) add('boulder', x, y, 1);
        else if (roll < 0.8) add('stone', x, y, 0);
      }
    }
    return remember(this.decorCache, key, out, MAX_DATA);
  }

  /**
   * Draw one layer ('water' or 'land') for the visible world rect.
   * budget.until = performance.now() deadline for rendering new chunks this
   * frame (at least one is always allowed when budget.first is true).
   */
  draw(ctx, view, layer, budget) {
    const c0 = Math.floor(view.x0 / CHUNK);
    const c1 = Math.floor(view.x1 / CHUNK);
    const r0 = Math.floor(view.y0 / CHUNK);
    const r1 = Math.floor(view.y1 / CHUNK);
    // Render nearest-first so the area around the player fills in first.
    const mx = (c0 + c1) / 2;
    const my = (r0 + r1) / 2;
    const cells = [];
    for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) cells.push([cx, cy]);
    cells.sort((a, b) => Math.hypot(a[0] - mx, a[1] - my) - Math.hypot(b[0] - mx, b[1] - my));
    for (const [cx, cy] of cells) {
      const key = `${cx},${cy}`;
      let entry = this.cache.get(key);
      if (!entry && this.mayRender(budget)) entry = this.ensure(cx, cy);
      // Crop the 1px border and overlap by a hair so seams never show a gap.
      if (entry) ctx.drawImage(entry[layer], 1, 1, entry.inner, entry.inner, cx * CHUNK, cy * CHUNK, CHUNK + 0.4, CHUNK + 0.4);
      else this.drawPlaceholder(ctx, cx, cy, layer);
    }
  }

  mayRender(budget) {
    if (!budget) return false;
    if (budget.first) {
      budget.first = false;
      return true;
    }
    return performance.now() < budget.until;
  }

  ensure(cx, cy) {
    const key = `${cx},${cy}`;
    return this.cache.get(key) ?? remember(this.cache, key, this.renderChunk(cx, cy), MAX_CACHED);
  }

  /** With any time left this frame, render chunks just outside the view so walking reveals finished tiles. */
  prefetch(view, budget) {
    const pad = CHUNK;
    for (let cy = Math.floor((view.y0 - pad) / CHUNK); cy <= Math.floor((view.y1 + pad) / CHUNK); cy++) {
      for (let cx = Math.floor((view.x0 - pad) / CHUNK); cx <= Math.floor((view.x1 + pad) / CHUNK); cx++) {
        if (this.cache.has(`${cx},${cy}`)) continue;
        if (performance.now() >= budget.until) return;
        this.ensure(cx, cy);
      }
    }
  }

  /** Flat colours while a chunk hasn't been rendered yet (from its cell types). */
  drawPlaceholder(ctx, cx, cy, layer) {
    const x0 = cx * CHUNK;
    const y0 = cy * CHUNK;
    if (layer === 'water') {
      ctx.fillStyle = THEME.water.placeholder;
      ctx.fillRect(x0, y0, CHUNK, CHUNK);
      return;
    }
    const d = this.chunkData(cx, cy);
    if (!d.placeholder) {
      const c = document.createElement('canvas');
      c.width = c.height = CELLS;
      const g = c.getContext('2d');
      const img = g.createImageData(CELLS, CELLS);
      const colours = TYPE_NAMES.map((t) => rgb(THEME.land[t]));
      for (let k = 0; k < CELLS * CELLS; k++) {
        const t = d.types[k];
        const col = colours[t] ?? colours[0];
        img.data[k * 4] = col[0];
        img.data[k * 4 + 1] = col[1];
        img.data[k * 4 + 2] = col[2];
        img.data[k * 4 + 3] = t < 0 ? 0 : 255;
      }
      g.putImageData(img, 0, 0);
      d.placeholder = c;
    }
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(d.placeholder, x0, y0, CHUNK, CHUNK);
    ctx.fillStyle = THEME.structure.deck;
    for (const s of this.world.structures) {
      if (s.x < x0 + CHUNK && s.x + s.w > x0 && s.y < y0 + CHUNK && s.y + s.h > y0) ctx.fillRect(s.x, s.y, s.w, s.h);
    }
  }

  // ---- the overview (minimap) -----------------------------------------------------------

  /**
   * A low-resolution colour picture of the whole world for the minimap,
   * OVERVIEW_STEP units per pixel. It starts blank and fills in block by
   * block, nearest the player first (growOverview), so a huge map never
   * stalls a frame.
   */
  overview() {
    if (!this.ov) {
      const w = Math.ceil(this.world.width / OVERVIEW_STEP);
      const h = Math.ceil(this.world.height / OVERVIEW_STEP);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const g = canvas.getContext('2d');
      g.fillStyle = THEME.land.grass;
      g.fillRect(0, 0, w, h);
      this.ov = { canvas, g, w, h, step: OVERVIEW_STEP, done: new Set(), left: Math.ceil(w / OV_BLOCK) * Math.ceil(h / OV_BLOCK) };
    }
    return this.ov;
  }

  /** Render overview blocks, nearest to (x, y) first, until the deadline (always at least one). */
  growOverview(x, y, until) {
    const ov = this.overview();
    if (!ov.left) return;
    const bw = Math.ceil(ov.w / OV_BLOCK);
    const bh = Math.ceil(ov.h / OV_BLOCK);
    const size = OV_BLOCK * ov.step;
    const todo = [];
    for (let by = 0; by < bh; by++) {
      for (let bx = 0; bx < bw; bx++) {
        if (!ov.done.has(by * bw + bx)) todo.push([bx, by, Math.hypot((bx + 0.5) * size - x, (by + 0.5) * size - y)]);
      }
    }
    todo.sort((a, b) => a[2] - b[2]);
    let first = true;
    for (const [bx, by] of todo) {
      if (!first && performance.now() >= until) return;
      first = false;
      this.renderOverviewBlock(bx, by);
      ov.done.add(by * bw + bx);
      ov.left -= 1;
    }
  }

  renderOverviewBlock(bx, by) {
    const ov = this.ov;
    const colours = TYPE_NAMES.map((t) => rgb(THEME.land[t]));
    const S = THEME.water.shallow;
    const D = THEME.water.deep;
    const w = Math.min(OV_BLOCK, ov.w - bx * OV_BLOCK);
    const h = Math.min(OV_BLOCK, ov.h - by * OV_BLOCK);
    const img = ov.g.createImageData(w, h);
    for (let j = 0; j < h; j++) {
      const y = (by * OV_BLOCK + j + 0.5) * ov.step;
      for (let i = 0; i < w; i++) {
        const x = (bx * OV_BLOCK + i + 0.5) * ov.step;
        const s = this.sdf(x, y);
        let c;
        if (s < 0) {
          const t = smoothstep(0, 400, -s);
          c = [S[0] + (D[0] - S[0]) * t, S[1] + (D[1] - S[1]) * t, S[2] + (D[2] - S[2]) * t];
        } else {
          const base = colours[this.groundType(x, y, s)];
          const shade = 1 - this.forestAt(x, y) * 0.25;
          c = [base[0] * shade, base[1] * shade, base[2] * shade];
        }
        img.data.set([c[0], c[1], c[2], 255], (j * w + i) * 4);
      }
    }
    ov.g.putImageData(img, bx * OV_BLOCK, by * OV_BLOCK);
    // Docks and bridges in this block.
    const x0 = bx * OV_BLOCK * ov.step;
    const y0 = by * OV_BLOCK * ov.step;
    const size = OV_BLOCK * ov.step;
    ov.g.fillStyle = THEME.structure.deck;
    for (const r of this.world.structures) {
      if (r.x < x0 + size && r.x + r.w > x0 && r.y < y0 + size && r.y + r.h > y0) {
        ov.g.fillRect(r.x / ov.step - 1, r.y / ov.step - 1, r.w / ov.step + 2, r.h / ov.step + 2);
      }
    }
  }

  // ---- extras -------------------------------------------------------------------------

  /** Seamless 256px texture of bright caustic lines, for the moving water overlay. */
  static causticTile() {
    const size = 256;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const img = g.createImageData(size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const a = 1 - Math.abs(tileNoise(x / 32, y / 32, 8) * 2 - 1);
        const b = 1 - Math.abs(tileNoise(x / 16 + 3, y / 16 + 7, 16) * 2 - 1);
        const v = Math.pow(a, 8) * 0.8 + Math.pow(b, 10) * 0.5;
        const k = (y * size + x) * 4;
        img.data[k] = 255;
        img.data[k + 1] = 255;
        img.data[k + 2] = 255;
        img.data[k + 3] = clamp(v, 0, 1) * 255;
      }
    }
    g.putImageData(img, 0, 0);
    return c;
  }
}

// ---- docks, jetties and bridges ------------------------------------------------------

function drawStructure(g, s) {
  const rnd = seeded(seedFrom('structure', s.x, s.y));
  const vertical = s.h > s.w;
  const long = vertical ? s.h : s.w;
  const T = THEME.structure;
  // Posts along both long edges.
  g.fillStyle = T.post;
  for (let d = 6; d < long; d += 44) {
    for (const side of [-2, (vertical ? s.w : s.h) + 2]) {
      const x = vertical ? s.x + side : s.x + d;
      const y = vertical ? s.y + d : s.y + side;
      g.beginPath();
      g.arc(x, y, 3.6, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.fillStyle = T.deck;
  g.fillRect(s.x, s.y, s.w, s.h);
  // Planks run across the structure, each a slightly different shade.
  const plank = 7;
  for (let d = 0; d < long; d += plank) {
    const shade = (rnd() - 0.5) * 26;
    g.fillStyle = `rgb(${T.plank[0] + shade},${T.plank[1] + shade},${T.plank[2] + shade})`;
    if (vertical) g.fillRect(s.x + 1, s.y + d + 0.6, s.w - 2, plank - 1.2);
    else g.fillRect(s.x + d + 0.6, s.y + 1, plank - 1.2, s.h - 2);
    g.fillStyle = T.nail;
    const n1 = vertical ? [s.x + 4, s.y + d + plank / 2] : [s.x + d + plank / 2, s.y + 4];
    const n2 = vertical ? [s.x + s.w - 4, s.y + d + plank / 2] : [s.x + d + plank / 2, s.y + s.h - 4];
    for (const [nx, ny] of [n1, n2]) g.fillRect(nx - 0.5, ny - 0.5, 1, 1);
  }
  g.strokeStyle = T.edge;
  g.lineWidth = 1.2;
  g.strokeRect(s.x + 0.5, s.y + 0.5, s.w - 1, s.h - 1);
  if (s.type === 'bridge') {
    g.fillStyle = T.rail;
    if (vertical) {
      g.fillRect(s.x - 1, s.y, 4, s.h);
      g.fillRect(s.x + s.w - 3, s.y, 4, s.h);
    } else {
      g.fillRect(s.x, s.y - 1, s.w, 4);
      g.fillRect(s.x, s.y + s.h - 3, s.w, 4);
    }
  }
}
