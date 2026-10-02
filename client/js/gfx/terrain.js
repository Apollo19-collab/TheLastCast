// Terrain: textured ground and water, baked into cached tiles ("chunks").
//
// 1. A signed distance field says how far every point is from the shoreline
//    (positive on land, negative in water). It drives water depth colour,
//    wet sand, foam and the slightly wavy, natural-looking coastline.
// 2. Each 256x256-unit chunk is rendered once, per pixel, into two canvases:
//    `water` (opaque) and `land` (transparent over water, with docks and
//    scenery stamped on). The renderer draws animated water between the two.
// 3. Chunks are made lazily, a few per frame, and kept in a small cache.
//
// Collision is unchanged: it still uses the rectangles in shared/world.js.
// The terrain extends past the world edge (forest, and the river continues),
// so the centred camera never shows a void.

import { fbm, noise, ridged, seeded, seedFrom, tileNoise } from './noise.js';
import { spritePools, stamp } from './sprites.js';
import { THEME } from '../theme.js';
import { zoneAt } from '/shared/world.js';

const CELL = 8; // distance-field resolution, world units
const MARGIN = 1200; // how far terrain extends beyond the world edge
const CHUNK = 256; // chunk size, world units
const TINT_CELL = 16;
const MAX_CACHED = 140;
const TYPE_INDEX = { grass: 0, sand: 1, rock: 2 };

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const smoothstep = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

export class Terrain {
  constructor(world) {
    this.world = world;
    this.cache = new Map();
    this.decorCache = new Map();
    this.res = 1;
    this.buildFields();
    this.buildTints();
    this.buildCoast();
  }

  // ---- fields -------------------------------------------------------------------

  /** Land type index at a point (-1 = water), with the world's edges extended outward. */
  typeRaw(x, y) {
    const w = this.world;
    const cx = clamp(x, 0, w.width - 1);
    const cy = clamp(y, 0, w.height - 1);
    let t = -1;
    for (const r of w.land) {
      if (cx >= r.x && cx < r.x + r.w && cy >= r.y && cy < r.y + r.h) t = TYPE_INDEX[r.type] ?? 0;
    }
    return t;
  }

  buildFields() {
    const gw = Math.ceil((this.world.width + 2 * MARGIN) / CELL) + 1;
    const gh = Math.ceil((this.world.height + 2 * MARGIN) / CELL) + 1;
    const n = gw * gh;
    const type = new Int8Array(n);
    const dIn = new Float32Array(n);
    const dOut = new Float32Array(n);
    for (let j = 0; j < gh; j++) {
      for (let i = 0; i < gw; i++) {
        const k = j * gw + i;
        const t = this.typeRaw(-MARGIN + i * CELL, -MARGIN + j * CELL);
        type[k] = t;
        dIn[k] = t >= 0 ? 1e9 : 0;
        dOut[k] = t >= 0 ? 0 : 1e9;
      }
    }
    // Two-pass chamfer distance transform, for both land and water.
    const D = Math.SQRT2;
    for (const d of [dIn, dOut]) {
      for (let j = 0; j < gh; j++) {
        for (let i = 0; i < gw; i++) {
          const k = j * gw + i;
          let v = d[k];
          if (i > 0) v = Math.min(v, d[k - 1] + 1);
          if (j > 0) {
            v = Math.min(v, d[k - gw] + 1);
            if (i > 0) v = Math.min(v, d[k - gw - 1] + D);
            if (i < gw - 1) v = Math.min(v, d[k - gw + 1] + D);
          }
          d[k] = v;
        }
      }
      for (let j = gh - 1; j >= 0; j--) {
        for (let i = gw - 1; i >= 0; i--) {
          const k = j * gw + i;
          let v = d[k];
          if (i < gw - 1) v = Math.min(v, d[k + 1] + 1);
          if (j < gh - 1) {
            v = Math.min(v, d[k + gw] + 1);
            if (i < gw - 1) v = Math.min(v, d[k + gw + 1] + D);
            if (i > 0) v = Math.min(v, d[k + gw - 1] + D);
          }
          d[k] = v;
        }
      }
    }
    const sdf = new Float32Array(n);
    for (let k = 0; k < n; k++) sdf[k] = type[k] >= 0 ? (dIn[k] - 0.5) * CELL : -(dOut[k] - 0.5) * CELL;
    Object.assign(this, { gw, gh, type, sdfGrid: sdf });
  }

  /** Signed distance to the shoreline (world units): + on land, - in water. */
  sdf(x, y) {
    const fx = clamp((x + MARGIN) / CELL, 0, this.gw - 1.001);
    const fy = clamp((y + MARGIN) / CELL, 0, this.gh - 1.001);
    const i = fx | 0;
    const j = fy | 0;
    const tx = fx - i;
    const ty = fy - j;
    const g = this.sdfGrid;
    const k = j * this.gw + i;
    const a = g[k] + (g[k + 1] - g[k]) * tx;
    const b = g[k + this.gw] + (g[k + this.gw + 1] - g[k + this.gw]) * tx;
    return a + (b - a) * ty;
  }

  typeAt(x, y) {
    const i = clamp(Math.round((x + MARGIN) / CELL), 0, this.gw - 1);
    const j = clamp(Math.round((y + MARGIN) / CELL), 0, this.gh - 1);
    return this.type[j * this.gw + i];
  }

  /** Blurred per-zone water tint (premultiplied rgba grid), so zones blend softly. */
  buildTints() {
    const tw = Math.ceil((this.world.width + 2 * MARGIN) / TINT_CELL) + 1;
    const th = Math.ceil((this.world.height + 2 * MARGIN) / TINT_CELL) + 1;
    const ch = [new Float32Array(tw * th), new Float32Array(tw * th), new Float32Array(tw * th), new Float32Array(tw * th)];
    const w = this.world;
    for (let j = 0; j < th; j++) {
      for (let i = 0; i < tw; i++) {
        const x = clamp(-MARGIN + i * TINT_CELL, 0, w.width - 1);
        const y = clamp(-MARGIN + j * TINT_CELL, 0, w.height - 1);
        const z = zoneAt(w, x, y);
        const tint = z && THEME.waterTint[z.id];
        if (!tint) continue;
        const k = j * tw + i;
        ch[0][k] = tint[0] * tint[3];
        ch[1][k] = tint[1] * tint[3];
        ch[2][k] = tint[2] * tint[3];
        ch[3][k] = tint[3];
      }
    }
    // Box blur, 3 passes each direction (approximates a Gaussian).
    const tmp = new Float32Array(tw * th);
    const R = 3;
    for (const c of ch) {
      for (let pass = 0; pass < 3; pass++) {
        for (let j = 0; j < th; j++) {
          let acc = 0;
          for (let i = -R; i <= R; i++) acc += c[j * tw + clamp(i, 0, tw - 1)];
          for (let i = 0; i < tw; i++) {
            tmp[j * tw + i] = acc / (2 * R + 1);
            acc += c[j * tw + clamp(i + R + 1, 0, tw - 1)] - c[j * tw + clamp(i - R, 0, tw - 1)];
          }
        }
        for (let i = 0; i < tw; i++) {
          let acc = 0;
          for (let j = -R; j <= R; j++) acc += tmp[clamp(j, 0, th - 1) * tw + i];
          for (let j = 0; j < th; j++) {
            c[j * tw + i] = acc / (2 * R + 1);
            acc += tmp[clamp(j + R + 1, 0, th - 1) * tw + i] - tmp[clamp(j - R, 0, th - 1) * tw + i];
          }
        }
      }
    }
    Object.assign(this, { tw, th, tint: ch });
  }

  /** Writes the blurred tint at (x, y) into out = [r, g, b, a]. */
  tintAt(x, y, out) {
    const fx = clamp((x + MARGIN) / TINT_CELL, 0, this.tw - 1.001);
    const fy = clamp((y + MARGIN) / TINT_CELL, 0, this.th - 1.001);
    const i = fx | 0;
    const j = fy | 0;
    const tx = fx - i;
    const ty = fy - j;
    const k = j * this.tw + i;
    for (let c = 0; c < 4; c++) {
      const g = this.tint[c];
      const a = g[k] + (g[k + 1] - g[k]) * tx;
      const b = g[k + this.tw] + (g[k + this.tw + 1] - g[k + this.tw]) * tx;
      out[c] = a + (b - a) * ty;
    }
    return out;
  }

  /** Points just offshore, with outward normals, for animated surf. */
  buildCoast() {
    const pts = [];
    const { gw, gh, sdfGrid } = this;
    const w = this.world;
    for (let j = 1; j < gh - 1; j++) {
      for (let i = 1; i < gw - 1; i++) {
        const k = j * gw + i;
        const s = sdfGrid[k];
        if (s >= 0 || s < -CELL * 1.2 || (i + j) % 2) continue;
        const x = -MARGIN + i * CELL;
        const y = -MARGIN + j * CELL;
        if (x < -200 || y < -200 || x > w.width + 200 || y > w.height + 200) continue;
        let nx = sdfGrid[k - 1] - sdfGrid[k + 1];
        let ny = sdfGrid[k - gw] - sdfGrid[k + gw];
        const len = Math.hypot(nx, ny) || 1;
        nx /= len;
        ny /= len;
        // Irregular spacing, length and rhythm so the surf doesn't look like a dashed line.
        const jitter = (noise(x * 0.31, y * 0.31) - 0.5) * 10;
        if (noise(x * 0.2 + 7, y * 0.2) < 0.3) continue;
        pts.push({
          x: x - ny * jitter,
          y: y + nx * jitter,
          nx,
          ny,
          len: 3 + noise(x * 0.13, y * 0.13 + 3) * 8,
          phase: noise(x * 0.05, y * 0.05) * 12 + noise(x * 0.4, y * 0.4) * 2,
        });
      }
    }
    this.coast = pts;
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
      r = 64 + n * 44 + f * 16;
      g = 104 + n * 50 + f * 18;
      b = 44 + n * 26 + f * 10;
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
        const s = this.sdf(x, y);
        // Wobble the coastline a little so it isn't a straight rectangle edge.
        const e = Math.abs(s) < 24 ? s + (fbm(x / 40, y / 40, 2) - 0.5) * 14 : s;
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
    const nearStructure = (x, y, m) => w.structures.some((s) => x > s.x - m && x < s.x + s.w + m && y > s.y - m && y < s.y + s.h + m);
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
        const pineCountry = (y < 1150 && x > 700 && x < 2300) || (outside && y < 600);
        if (s > 55 && !nearStructure(x, y, 60) && roll < (outside ? 0.85 : 0.4)) {
          add(pineCountry || rnd() < 0.15 ? 'pine' : 'tree', x, y, 2);
        } else if (s > 18 && roll < 0.55) add('bush', x, y, 1);
        else if (roll < 0.8) add('tuft', x, y, 0);
        else add('flowers', x, y, 0);
      } else if (type === 1) {
        if (s < 30 && roll < 0.06) add('driftwood', x, y, 0);
        else if (roll < 0.18) add('pebbles', x, y, 0);
      } else if (type === 2) {
        if (roll < 0.35) add('boulder', x, y, 1);
        else if (roll < 0.8) add('stone', x, y, 0);
      }
    }
    this.decorCache.set(key, out);
    return out;
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
    let entry = this.cache.get(key);
    if (!entry) {
      entry = this.renderChunk(cx, cy);
      this.cache.set(key, entry);
      if (this.cache.size > MAX_CACHED) this.cache.delete(this.cache.keys().next().value);
    }
    return entry;
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

  /** Flat colours while a chunk hasn't been rendered yet. */
  drawPlaceholder(ctx, cx, cy, layer) {
    const x0 = cx * CHUNK;
    const y0 = cy * CHUNK;
    if (layer === 'water') {
      ctx.fillStyle = THEME.water.placeholder;
      ctx.fillRect(x0, y0, CHUNK, CHUNK);
      return;
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, y0, CHUNK, CHUNK);
    ctx.clip();
    const w = this.world;
    for (const r of w.land) {
      ctx.fillStyle = THEME.land[r.type] || THEME.land.grass;
      ctx.fillRect(r.x, r.y, r.w, r.h);
    }
    ctx.fillStyle = THEME.land.grass;
    if (x0 < 0) ctx.fillRect(x0, y0, -x0, CHUNK);
    if (y0 < 0) ctx.fillRect(x0, y0, CHUNK, -y0);
    if (x0 + CHUNK > w.width) ctx.fillRect(w.width, y0, x0 + CHUNK - w.width, CHUNK);
    if (y0 + CHUNK > w.height) ctx.fillRect(x0, w.height, CHUNK, y0 + CHUNK - w.height);
    ctx.fillStyle = THEME.structure.deck;
    for (const s of w.structures) ctx.fillRect(s.x, s.y, s.w, s.h);
    ctx.restore();
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

  /** A small rendered map of the whole lake for the minimap. */
  minimapImage(widthPx) {
    const w = this.world;
    const scale = widthPx / w.width;
    const hpx = Math.round(w.height * scale);
    const c = document.createElement('canvas');
    c.width = widthPx;
    c.height = hpx;
    const g = c.getContext('2d');
    const img = g.createImageData(widthPx, hpx);
    const col = [0, 0, 0];
    const tint = [0, 0, 0, 0];
    for (let j = 0; j < hpx; j++) {
      for (let i = 0; i < widthPx; i++) {
        const x = (i + 0.5) / scale;
        const y = (j + 0.5) / scale;
        const s = this.sdf(x, y);
        if (s < 0) this.waterColor(x, y, s, col, tint);
        else this.landColor(x, y, s + 20, col);
        const k = (j * widthPx + i) * 4;
        img.data[k] = col[0];
        img.data[k + 1] = col[1];
        img.data[k + 2] = col[2];
        img.data[k + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    g.scale(scale, scale);
    g.fillStyle = THEME.structure.deck;
    for (const r of w.structures) g.fillRect(r.x - 8, r.y - 8, r.w + 16, r.h + 16);
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
