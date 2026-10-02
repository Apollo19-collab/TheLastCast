// Canvas renderer. All drawing lives here and reads its look from theme.js.
// To upgrade graphics later, replace individual draw* methods (e.g. with
// sprite drawing) without touching networking or game logic.

import { THEME } from './theme.js';
import { castDistance, FishingState } from '/shared/constants.js';
import { zoneAt, isWalkable } from '/shared/world.js';

// Approximate area of the world visible on screen, in world units.
const VIEW_W = 1100;
const VIEW_H = 750;
const CAST_ANIM_MS = 600;

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

  updateCamera(focusX, focusY, dt) {
    const { width: w, height: h } = this.canvas;
    const c = this.camera;
    c.zoom = Math.min(w / VIEW_W, h / VIEW_H);
    const halfW = w / c.zoom / 2;
    const halfH = h / c.zoom / 2;
    const tx = halfW * 2 >= this.world.width ? this.world.width / 2 : clamp(focusX, halfW, this.world.width - halfW);
    const ty = halfH * 2 >= this.world.height ? this.world.height / 2 : clamp(focusY, halfH, this.world.height - halfH);
    const k = Math.min(1, dt * 6);
    c.x = lerp(c.x, tx, k);
    c.y = lerp(c.y, ty, k);
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
    this.drawLand();
    this.drawStructures();
    this.drawReeds(frame.time);
    for (const h of frame.hotspots) this.drawHotspot(h, frame.time);
    for (const p of frame.players) if (p.s !== FishingState.IDLE) this.drawLineAndBobber(p, frame.time);
    if (frame.aim) this.drawAim(frame.aim);
    for (const p of frame.players) this.drawPlayer(p, p.id === frame.meId);
    for (const p of frame.players) if (p.s === FishingState.REELING) this.drawReelBars(p);
    this.drawEffects(frame.time);
  }

  // ---- world -------------------------------------------------------------------

  buildDecor() {
    const rnd = seededRandom(1337);
    const w = this.world;
    const reeds = [];
    const reedZone = w.zones.find((z) => z.id === 'reeds');
    if (reedZone?.rect) {
      const r = reedZone.rect;
      for (let i = 0; i < 160; i++) {
        const x = r.x + rnd() * r.w * 0.6;
        const y = r.y + rnd() * r.h;
        if (zoneAt(w, x, y)) reeds.push({ x, y, h: 10 + rnd() * 14, phase: rnd() * 6 });
      }
    }
    const trees = [];
    const stones = [];
    for (const land of w.land) {
      const count = Math.floor((land.w * land.h) / 4000);
      for (let i = 0; i < count; i++) {
        const x = land.x + rnd() * land.w;
        const y = land.y + rnd() * land.h;
        if (land.type === 'grass' && (x < 130 || y < 60)) trees.push({ x, y, r: 14 + rnd() * 12 });
        if (land.type === 'rock' && rnd() < 0.5) stones.push({ x, y, r: 6 + rnd() * 12 });
      }
    }
    const waves = [];
    for (let i = 0; i < 70; i++) waves.push({ x: rnd() * w.width, y: rnd() * w.height, phase: rnd() * 6 });
    return { reeds, trees, stones, waves: waves.filter((p) => zoneAt(w, p.x, p.y)) };
  }

  drawWater(time) {
    const { ctx, world } = this;
    ctx.fillStyle = THEME.water;
    ctx.fillRect(0, 0, world.width, world.height);
    for (const z of world.zones) {
      if (!z.rect || !THEME.zoneTint[z.id]) continue;
      ctx.fillStyle = THEME.zoneTint[z.id];
      ctx.fillRect(z.rect.x, z.rect.y, z.rect.w, z.rect.h);
    }
    ctx.strokeStyle = THEME.waterHighlight;
    ctx.lineWidth = 2;
    for (const wv of this.decor.waves) {
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
      if (z.rect && z.label !== false) ctx.fillText(z.name.toUpperCase(), z.rect.x + z.rect.w / 2, z.rect.y + z.rect.h / 2);
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
      ctx.fillStyle = THEME.dock;
      ctx.fillRect(s.x, s.y, s.w, s.h);
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

  drawReeds(time) {
    const { ctx } = this;
    ctx.strokeStyle = THEME.reed;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (const r of this.decor.reeds) {
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
}
