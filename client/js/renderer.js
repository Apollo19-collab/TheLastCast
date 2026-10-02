// Canvas renderer. All drawing lives here and reads its look from theme.js.
// To upgrade graphics later, replace individual draw* methods (e.g. with
// sprite drawing) without touching networking or game logic.

import { THEME } from './theme.js';
import { castDistance, FishingState } from '/shared/constants.js';
import { zoneAt, zoneRects, isWalkable } from '/shared/world.js';

// Approximate area of the world visible on screen, in world units.
const VIEW_W = 1100;
const VIEW_H = 750;
const CAST_ANIM_MS = 600;
const MINIMAP_WIDTH = 200; // CSS pixels (smaller on narrow screens)

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * t;

function seededRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Renderer {
  constructor(canvas, world) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.world = world;
    this.camera = { x: world.spawn.x, y: world.spawn.y, zoom: 1 };
    this.effects = [];
    this.decor = this.buildDecor();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    this.dpr = dpr;
    this.canvas.width = Math.floor(window.innerWidth * dpr);
    this.canvas.height = Math.floor(window.innerHeight * dpr);
    this.canvas.style.width = `${window.innerWidth}px`;
    this.canvas.style.height = `${window.innerHeight}px`;
  }

  // ---- camera ---------------------------------------------------------------

  /** Keep the player in the centre of the screen. */
  updateCamera(focusX, focusY) {
    const { width: w, height: h } = this.canvas;
    const c = this.camera;
    c.zoom = Math.min(w / VIEW_W, h / VIEW_H);
    c.x = focusX;
    c.y = focusY;
  }

  /** Is a world point (plus margin) on screen? Used to skip off-screen decoration. */
  onScreen(x, y, margin = 60) {
    const c = this.camera;
    const halfW = this.canvas.width / c.zoom / 2 + margin;
    const halfH = this.canvas.height / c.zoom / 2 + margin;
    return Math.abs(x - c.x) < halfW && Math.abs(y - c.y) < halfH;
  }

  screenToWorld(clientX, clientY) {
    const c = this.camera;
    return {
      x: (clientX * this.dpr - this.canvas.width / 2) / c.zoom + c.x,
      y: (clientY * this.dpr - this.canvas.height / 2) / c.zoom + c.y,
    };
  }

  // ---- effects (splashes, floating text) -------------------------------------

  addEffect(effect) {
    this.effects.push({ ...effect, t0: performance.now() });
  }

  // ---- frame -------------------------------------------------------------------

  /**
   * frame: { time, players, hotspots, meId, aim }
   * players: interpolated snapshot entries, plus optional `castStart` (ms).
   * aim: null or { x, y, angle, power, range } for the local player's cast preview.
   */
  draw(frame) {
    const { ctx, canvas, camera: c } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = THEME.background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(c.zoom, 0, 0, c.zoom, canvas.width / 2 - c.x * c.zoom, canvas.height / 2 - c.y * c.zoom);

    this.drawWater(frame.time);
    this.drawWaterDecor(frame.time);
    this.drawLand();
    this.drawStructures();
    this.drawAreaLabels();
    this.drawReeds(frame.time);
    for (const h of frame.hotspots) this.drawHotspot(h, frame.time);
    for (const p of frame.players) if (p.s !== FishingState.IDLE) this.drawLineAndBobber(p, frame.time);
    if (frame.aim) this.drawAim(frame.aim);
    for (const p of frame.players) this.drawPlayer(p, p.id === frame.meId);
    for (const p of frame.players) if (p.s === FishingState.REELING) this.drawReelBars(p);
    this.drawEffects(frame.time);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.drawMinimap(frame);
  }

  // ---- world -------------------------------------------------------------------

  buildDecor() {
    const rnd = seededRandom(1337);
    const w = this.world;
    const decor = { reeds: [], lilies: [], current: [], trees: [], stones: [], waves: [] };

    // Water decoration, per zone (see `decor` in world.js).
    for (const z of w.zones) {
      if (!z.decor) continue;
      for (const r of zoneRects(z) || []) {
        const density = { reeds: 1200, lilies: 2200, current: 2500 }[z.decor];
        for (let i = 0; i < (r.w * r.h) / density; i++) {
          const x = r.x + rnd() * r.w;
          const y = r.y + rnd() * r.h;
          if (zoneAt(w, x, y) !== z) continue;
          if (z.decor === 'reeds') decor.reeds.push({ x, y, h: 10 + rnd() * 14, phase: rnd() * 6 });
          if (z.decor === 'lilies') decor.lilies.push({ x, y, r: 6 + rnd() * 7, rot: rnd() * 6, flower: rnd() < 0.15 });
          if (z.decor === 'current') decor.current.push({ x, y, len: 14 + rnd() * 18, phase: rnd() * 1000, min: r.x, span: r.w });
        }
      }
    }

    // Trees on grass, kept back from the water so the shore path stays clear.
    const inland = (x, y) => [[70, 0], [-70, 0], [0, 70], [0, -70]].every(([dx, dy]) => {
      const px = x + dx;
      const py = y + dy;
      const offMap = px < 0 || py < 0 || px >= w.width || py >= w.height;
      return offMap || isWalkable(w, px, py);
    });
    for (const land of w.land) {
      const count = Math.floor((land.w * land.h) / 5000);
      for (let i = 0; i < count; i++) {
        const x = land.x + rnd() * land.w;
        const y = land.y + rnd() * land.h;
        if (land.type === 'grass' && inland(x, y) && !w.structures.some((st) => Math.abs(st.x + st.w / 2 - x) < 90 && Math.abs(st.y + st.h / 2 - y) < st.h / 2 + 90)) {
          decor.trees.push({ x, y, r: 14 + rnd() * 12 });
        }
        if (land.type === 'rock' && rnd() < 0.5) decor.stones.push({ x, y, r: 6 + rnd() * 12 });
      }
    }

    for (let i = 0; i < (w.width * w.height) / 25000; i++) {
      const x = rnd() * w.width;
      const y = rnd() * w.height;
      if (zoneAt(w, x, y)) decor.waves.push({ x, y, phase: rnd() * 6 });
    }
    return decor;
  }

  drawWaterDecor(time) {
    const { ctx } = this;
    // Lily pads: green discs with a notch, some with a flower.
    for (const l of this.decor.lilies) {
      if (!this.onScreen(l.x, l.y)) continue;
      ctx.fillStyle = THEME.lilyPad;
      ctx.beginPath();
      ctx.moveTo(l.x, l.y);
      ctx.arc(l.x, l.y, l.r, l.rot, l.rot + Math.PI * 1.8);
      ctx.closePath();
      ctx.fill();
      if (l.flower) {
        ctx.fillStyle = THEME.lilyFlower;
        ctx.beginPath();
        ctx.arc(l.x, l.y, l.r * 0.35, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // River current: streaks drifting into the lake (westward).
    ctx.strokeStyle = THEME.current;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (const c of this.decor.current) {
      const x = c.min + (((c.x - c.min) - time * 0.04 - c.phase) % c.span + c.span) % c.span;
      if (!this.onScreen(x, c.y)) continue;
      ctx.moveTo(x, c.y);
      ctx.lineTo(x + c.len, c.y);
    }
    ctx.stroke();
  }

  drawWater(time) {
    const { ctx, world } = this;
    ctx.fillStyle = THEME.water;
    ctx.fillRect(0, 0, world.width, world.height);
    for (const z of world.zones) {
      const rects = zoneRects(z);
      if (!rects || !THEME.zoneTint[z.id]) continue;
      ctx.fillStyle = THEME.zoneTint[z.id];
      for (const r of rects) ctx.fillRect(r.x, r.y, r.w, r.h);
    }
    ctx.strokeStyle = THEME.waterHighlight;
    ctx.lineWidth = 2;
    for (const wv of this.decor.waves) {
      if (!this.onScreen(wv.x, wv.y)) continue;
      const dx = Math.sin(time / 1500 + wv.phase) * 8;
      ctx.beginPath();
      ctx.moveTo(wv.x + dx - 10, wv.y);
      ctx.quadraticCurveTo(wv.x + dx, wv.y - 4, wv.x + dx + 10, wv.y);
      ctx.stroke();
    }
    ctx.font = '700 28px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = THEME.zoneLabel;
    for (const z of world.zones) {
      const r = zoneRects(z)?.[0];
      if (r && z.label !== false) ctx.fillText(z.name.toUpperCase(), r.x + r.w / 2, r.y + r.h / 2);
    }
  }

  drawLand() {
    const { ctx, world } = this;
    // Foam along the shoreline: a thick stroke that the land fill half-covers.
    ctx.strokeStyle = THEME.shoreEdge;
    ctx.lineWidth = 8;
    for (const r of world.land) ctx.strokeRect(r.x, r.y, r.w, r.h);
    for (const r of world.land) {
      ctx.fillStyle = THEME.land[r.type] || THEME.land.grass;
      ctx.fillRect(r.x, r.y, r.w, r.h);
    }
    for (const s of this.decor.stones) {
      ctx.fillStyle = THEME.stone;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const t of this.decor.trees) {
      if (!this.onScreen(t.x, t.y)) continue;
      ctx.fillStyle = THEME.treeDark;
      ctx.beginPath();
      ctx.arc(t.x + 3, t.y + 4, t.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = THEME.tree;
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawStructures() {
    const { ctx, world } = this;
    for (const s of world.structures) {
      ctx.fillStyle = s.type === 'bridge' ? THEME.bridge : THEME.dock;
      ctx.fillRect(s.x, s.y, s.w, s.h);
      if (s.type === 'bridge') {
        ctx.fillStyle = THEME.bridgeRail;
        ctx.fillRect(s.x - 3, s.y, 4, s.h);
        ctx.fillRect(s.x + s.w - 1, s.y, 4, s.h);
      }
      ctx.strokeStyle = THEME.dockPlank;
      ctx.lineWidth = 2;
      ctx.beginPath();
      const vertical = s.h > s.w;
      for (let i = 10; i < (vertical ? s.h : s.w); i += 12) {
        if (vertical) { ctx.moveTo(s.x, s.y + i); ctx.lineTo(s.x + s.w, s.y + i); }
        else { ctx.moveTo(s.x + i, s.y); ctx.lineTo(s.x + i, s.y + s.h); }
      }
      ctx.stroke();
    }
  }

  /** Big place names painted on the land ("Pine Point", "River Mouth", ...). */
  drawAreaLabels() {
    const { ctx } = this;
    ctx.font = THEME.areaLabel.font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const a of this.world.areas || []) {
      if (!a.label || !this.onScreen(a.label.x, a.label.y, 300)) continue;
      ctx.fillStyle = THEME.areaLabel.shadow;
      ctx.fillText(a.name.toUpperCase(), a.label.x + 2, a.label.y + 2);
      ctx.fillStyle = THEME.areaLabel.color;
      ctx.fillText(a.name.toUpperCase(), a.label.x, a.label.y);
    }
  }

  drawReeds(time) {
    const { ctx } = this;
    ctx.strokeStyle = THEME.reed;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (const r of this.decor.reeds) {
      if (!this.onScreen(r.x, r.y)) continue;
      const sway = Math.sin(time / 900 + r.phase) * 3;
      ctx.moveTo(r.x, r.y);
      ctx.quadraticCurveTo(r.x, r.y - r.h / 2, r.x + sway, r.y - r.h);
    }
    ctx.stroke();
  }

  drawHotspot(h, time) {
    const { ctx } = this;
    const fade = clamp(h.life / 5, 0, 1);
    ctx.globalAlpha = fade;
    ctx.fillStyle = THEME.hotspotFill;
    ctx.beginPath();
    ctx.arc(h.x, h.y, h.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = THEME.hotspot;
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      const t = ((time / 2000 + i / 3) % 1);
      ctx.globalAlpha = fade * (1 - t);
      ctx.beginPath();
      ctx.arc(h.x, h.y, h.r * t, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // ---- players and lines ---------------------------------------------------------

  rodTip(p) {
    const len = THEME.player.rodLength;
    return { x: p.x + Math.cos(p.f) * len, y: p.y + Math.sin(p.f) * len };
  }

  bobberPos(p, time) {
    if (p.s === FishingState.CASTING) {
      const t = clamp((time - (p.castStart ?? time)) / CAST_ANIM_MS, 0, 1);
      return { x: lerp(p.x, p.bx, t), y: lerp(p.y, p.by, t) - Math.sin(Math.PI * t) * 40, inAir: t < 1 };
    }
    if (p.s === FishingState.REELING) {
      const k = clamp(p.pg ?? 0, 0, 1) * 0.8;
      const shake = p.pl ? Math.sin(time / 25) * 2.5 : 0;
      return { x: lerp(p.bx, p.x, k) + shake, y: lerp(p.by, p.y, k) };
    }
    if (p.s === FishingState.BITE) return { x: p.bx, y: p.by + 2 + Math.sin(time / 50) * 2.5 };
    return { x: p.bx, y: p.by + Math.sin(time / 400) * 1.5 };
  }

  drawLineAndBobber(p, time) {
    const { ctx } = this;
    const tip = this.rodTip(p);
    const b = this.bobberPos(p, time);
    const tight = p.s === FishingState.REELING;
    ctx.strokeStyle = THEME.line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(tip.x, tip.y);
    ctx.quadraticCurveTo((tip.x + b.x) / 2, (tip.y + b.y) / 2 + (tight ? 0 : 18), b.x, b.y);
    ctx.stroke();

    const r = THEME.bobberRadius;
    ctx.fillStyle = THEME.bobberBottom;
    ctx.beginPath();
    ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = THEME.bobberTop;
    ctx.beginPath();
    ctx.arc(b.x, b.y, r, Math.PI, Math.PI * 2);
    ctx.fill();

    if (p.s === FishingState.BITE) {
      ctx.font = '800 18px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffd166';
      ctx.fillText('!', b.x, b.y - 14);
    }
  }

  drawPlayer(p, isSelf) {
    const { ctx } = this;
    const P = THEME.player;
    const tip = this.rodTip(p);
    ctx.strokeStyle = P.rod;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(tip.x, tip.y);
    ctx.stroke();

    ctx.fillStyle = p.color;
    ctx.strokeStyle = isSelf ? P.selfRing : P.outline;
    ctx.lineWidth = isSelf ? 3 : 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, P.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.font = THEME.name.font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = THEME.name.shadow;
    ctx.fillText(p.name, p.x + 1, p.y - P.radius - 7);
    ctx.fillStyle = THEME.name.color;
    ctx.fillText(p.name, p.x, p.y - P.radius - 8);
  }

  drawReelBars(p) {
    const { ctx } = this;
    const B = THEME.bars;
    const x = p.x - B.width / 2;
    let y = p.y + THEME.player.radius + 8;
    const bar = (value, color) => {
      ctx.fillStyle = B.back;
      ctx.fillRect(x - 1, y - 1, B.width + 2, B.height + 2);
      ctx.fillStyle = color;
      ctx.fillRect(x, y, B.width * clamp(value, 0, 1), B.height);
      y += B.height + 4;
    };
    bar(p.pg ?? 0, B.progress);
    bar(p.tn ?? 0, (p.tn ?? 0) > 0.7 ? B.tension : B.tensionSafe);
  }

  drawAim(aim) {
    const { ctx, world } = this;
    const dist = castDistance(aim.power, aim.range);
    const tx = aim.x + Math.cos(aim.angle) * dist;
    const ty = aim.y + Math.sin(aim.angle) * dist;
    const zone = zoneAt(world, tx, ty);
    ctx.strokeStyle = zone ? THEME.aim : THEME.aimBad;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(aim.x, aim.y);
    ctx.lineTo(tx, ty);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(tx, ty, 8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.font = THEME.aimFont;
    ctx.textAlign = 'center';
    ctx.fillStyle = zone ? '#fff' : THEME.aimBad;
    const label = zone ? zone.name : isWalkable(world, tx, ty) ? 'Dry land' : 'Out of reach';
    ctx.fillText(label, tx, ty - 14);
  }

  drawEffects(time) {
    const { ctx } = this;
    this.effects = this.effects.filter((e) => time - e.t0 < (e.duration ?? 1500));
    for (const e of this.effects) {
      const t = (time - e.t0) / (e.duration ?? 1500);
      if (e.type === 'splash') {
        ctx.strokeStyle = THEME.splash;
        ctx.globalAlpha = 1 - t;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(e.x, e.y, 4 + t * 22, 0, Math.PI * 2);
        ctx.stroke();
      } else if (e.type === 'text') {
        ctx.globalAlpha = 1 - t * t;
        ctx.font = THEME.floatFont;
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillText(e.text, e.x + 1, e.y - 30 - t * 30 + 1);
        ctx.fillStyle = e.color || '#fff';
        ctx.fillText(e.text, e.x, e.y - 30 - t * 30);
      }
    }
    ctx.globalAlpha = 1;
  }

  // ---- minimap (screen space, bottom-right) ---------------------------------------

  /** The lake drawn once to an offscreen canvas; players and hotspots go on top each frame. */
  buildMinimap(width) {
    const w = this.world;
    const scale = width / w.width;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width);
    canvas.height = Math.round(w.height * scale);
    const g = canvas.getContext('2d');
    g.scale(scale, scale);
    g.fillStyle = THEME.water;
    g.fillRect(0, 0, w.width, w.height);
    for (const z of w.zones) {
      if (!THEME.zoneTint[z.id]) continue;
      g.fillStyle = THEME.zoneTint[z.id];
      for (const r of zoneRects(z) || []) g.fillRect(r.x, r.y, r.w, r.h);
    }
    for (const r of w.land) {
      g.fillStyle = THEME.land[r.type] || THEME.land.grass;
      g.fillRect(r.x, r.y, r.w, r.h);
    }
    g.fillStyle = THEME.dock;
    for (const r of w.structures) g.fillRect(r.x - 10, r.y - 10, r.w + 20, r.h + 20); // thickened so they show up
    this.minimap = { canvas, scale, width };
  }

  drawMinimap(frame) {
    const { ctx, dpr } = this;
    const cssWidth = window.innerWidth < 800 ? 140 : MINIMAP_WIDTH;
    const width = cssWidth * dpr;
    if (!this.minimap || this.minimap.width !== width) this.buildMinimap(width);
    const { canvas: mm, scale } = this.minimap;
    const margin = 12 * dpr;
    const x0 = this.canvas.width - mm.width - margin;
    const y0 = this.canvas.height - mm.height - (window.innerWidth < 800 ? 12 : 56) * dpr;

    ctx.globalAlpha = 0.9;
    ctx.drawImage(mm, x0, y0);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = THEME.minimap.border;
    ctx.lineWidth = 2 * dpr;
    ctx.strokeRect(x0, y0, mm.width, mm.height);

    // What the main view currently shows.
    const c = this.camera;
    const vw = (this.canvas.width / c.zoom) * scale;
    const vh = (this.canvas.height / c.zoom) * scale;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, y0, mm.width, mm.height);
    ctx.clip();
    ctx.strokeStyle = THEME.minimap.view;
    ctx.lineWidth = 1 * dpr;
    ctx.strokeRect(x0 + c.x * scale - vw / 2, y0 + c.y * scale - vh / 2, vw, vh);

    ctx.fillStyle = THEME.minimap.hotspot;
    for (const h of frame.hotspots) {
      ctx.beginPath();
      ctx.arc(x0 + h.x * scale, y0 + h.y * scale, 2.5 * dpr, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const p of frame.players) {
      const self = p.id === frame.meId;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(x0 + p.x * scale, y0 + p.y * scale, (self ? 4 : 3) * dpr, 0, Math.PI * 2);
      ctx.fill();
      if (self) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5 * dpr;
        ctx.stroke();
      }
    }
    ctx.restore();
  }
}
