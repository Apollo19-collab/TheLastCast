// Canvas renderer: puts the layers together each frame.
//
//   terrain water tiles  ->  moving light / sparkles / river current
//   terrain land tiles   ->  surf, reeds, place names
//   hotspots, lines and bobbers, anglers, name tags, effects, minimap
//
// At sea (world.kind === 'sea') there is no terrain: the SeaScene draws the
// ocean, then the trawler, anglers, the time-of-day light, and the HUD bits.
//
// What things look like lives in gfx/ (terrain, sprites, characters, fish art)
// and theme.js; this file only decides what to draw where.

import { THEME } from './theme.js';
import { castDistance, FishingState } from '/shared/constants.js';
import { isWalkable, zoneAt, zoneRects } from '/shared/world.js';
import { Terrain } from './gfx/terrain.js';
import { seeded } from './gfx/noise.js';
import { drawAngler, drawLineAndBobber, drawNameTag, drawReelBars } from './gfx/characters.js';
import { FISH_SPRITE_SIZE, fishSprite } from './gfx/fishArt.js';
import { drawBoat, drawBoatLights, drawGangplank, drawWake } from './gfx/boat.js';
import { SeaScene } from './gfx/sea.js';
import { drawBaitShop, drawChumBucket, drawPet, drawZoo } from './gfx/shop.js';
import { PETS, PET_RARITIES } from '/shared/pets.js';
import { CHUM } from '/shared/chum.js';
import { BOAT, SEA_BOAT } from '/shared/voyage.js';

// Approximate area of the world visible on screen, in world units.
const VIEW_W = 950;
const VIEW_H = 650;
const MINIMAP_WIDTH = 200; // CSS pixels (smaller on narrow screens)

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export class Renderer {
  constructor(canvas, world) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.world = world;
    this.camera = { x: world.spawn.x, y: world.spawn.y, zoom: 1 };
    this.effects = [];
    this.anims = new Map(); // player id -> { x, y, phase, moving }
    this.petPos = new Map(); // player id -> where their pet is
    if (world.kind === 'sea') {
      this.sea = new SeaScene(this.ctx);
    } else {
      this.terrain = new Terrain(world);
      this.causticPattern = this.ctx.createPattern(Terrain.causticTile(), 'repeat');
      this.dynamic = this.buildDynamicDecor();
    }
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
    // Terrain tiles are rendered at (roughly) screen resolution, capped for speed.
    this.terrain?.setResolution(clamp(Math.round(c.zoom * 2) / 2, 1, 2));
  }

  viewRect(margin = 0) {
    const c = this.camera;
    const halfW = this.canvas.width / c.zoom / 2 + margin;
    const halfH = this.canvas.height / c.zoom / 2 + margin;
    return { x0: c.x - halfW, y0: c.y - halfH, x1: c.x + halfW, y1: c.y + halfH };
  }

  onScreen(x, y, margin = 60) {
    const c = this.camera;
    return Math.abs(x - c.x) < this.canvas.width / c.zoom / 2 + margin
      && Math.abs(y - c.y) < this.canvas.height / c.zoom / 2 + margin;
  }

  screenToWorld(clientX, clientY) {
    const c = this.camera;
    return {
      x: (clientX * this.dpr - this.canvas.width / 2) / c.zoom + c.x,
      y: (clientY * this.dpr - this.canvas.height / 2) / c.zoom + c.y,
    };
  }

  // ---- effects --------------------------------------------------------------

  /** { type: 'splash' | 'text' | 'fishPop', x, y, duration?, ... } */
  addEffect(effect) {
    this.effects.push({ ...effect, t0: performance.now() });
  }

  // ---- frame ----------------------------------------------------------------

  /**
   * frame: { time, players, hotspots, meId, aim, boat?, sea? }
   * players: interpolated snapshot entries, plus optional `castStart` (ms).
   * aim: null or { x, y, angle, power, range } for the local player's cast preview.
   * boat (lake): { x, y, h, ph } while the boat is on the map.
   * sea (voyage): { loc, time, event, sailing }.
   */
  draw(frame) {
    if (this.sea) {
      this.drawSeaFrame(frame);
      return;
    }
    const { ctx, canvas, camera: c } = this;
    const time = frame.time;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = THEME.background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(c.zoom, 0, 0, c.zoom, canvas.width / 2 - c.x * c.zoom, canvas.height / 2 - c.y * c.zoom);
    ctx.imageSmoothingQuality = 'high';

    const view = this.viewRect(0);
    // Time allowed for rendering new terrain tiles this frame; more while on
    // the join screen. At least one visible tile is always rendered.
    const budget = { until: performance.now() + (frame.meId ? 8 : 40), first: true };
    this.terrain.draw(ctx, view, 'water', budget);
    this.drawCaustics(view, time);
    this.drawGlints(time);
    this.drawCurrent(time);
    this.drawZoneLabels();
    // The visiting boat sits between the water and land layers, so it
    // passes under the river bridge.
    const boat = frame.boat?.x != null && this.onScreen(frame.boat.x, frame.boat.y, BOAT.length * 1.5) ? frame.boat : null;
    if (boat) {
      const moving = boat.ph === 'arriving' || boat.ph === 'departing';
      if (moving) drawWake(ctx, boat, { length: BOAT.length, beam: BOAT.beam, speed: 0.8, time });
      drawBoat(ctx, boat, { length: BOAT.length, beam: BOAT.beam, time, bob: moving ? 1.5 : 1 });
    }
    this.terrain.draw(ctx, view, 'land', null);
    if (boat?.ph === 'docked') drawGangplank(ctx, BOAT.landing.x + 26, boat.x - BOAT.beam / 2 + 4, boat.y);
    this.drawSurf(time);
    this.drawReeds(time);
    for (const shop of this.world.shops ?? []) if (this.onScreen(shop.x, shop.y, 80)) drawBaitShop(ctx, shop.x, shop.y);
    if (frame.zoo && this.onScreen(frame.zoo.x, frame.zoo.y, 120)) drawZoo(ctx, frame.zoo.x, frame.zoo.y, time);
    this.drawAreaLabels();

    for (const h of frame.hotspots) this.drawHotspot(h, time);
    this.drawChums(frame, time);
    this.updateAnims(frame.players);
    for (const p of frame.players) if (p.s !== FishingState.IDLE && p.bx != null) drawLineAndBobber(ctx, p, time);
    if (frame.aim) this.drawAim(frame.aim);
    const sorted = [...frame.players].sort((a, b) => a.y - b.y);
    for (const p of sorted) drawAngler(ctx, p, { self: p.id === frame.meId, time, anim: this.anims.get(p.id) });
    this.drawPets(frame.players, time);
    for (const p of sorted) drawNameTag(ctx, p, p.id === frame.meId);
    // Your own fight bars last, so nothing covers them.
    for (const p of frame.players) if (p.s === FishingState.REELING && p.id !== frame.meId) drawReelBars(ctx, p, false, time);
    for (const p of frame.players) if (p.s === FishingState.REELING && p.id === frame.meId) drawReelBars(ctx, p, true, time);
    this.drawEffects(time);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.drawMinimap(frame);
    this.terrain.prefetch(view, budget);
  }

  drawSeaFrame(frame) {
    const { ctx, canvas, camera: c } = this;
    const { time } = frame;
    const sea = frame.sea ?? { loc: null, time: 'Afternoon', event: null, sailing: true };
    const toWorld = () => ctx.setTransform(c.zoom, 0, 0, c.zoom, canvas.width / 2 - c.x * c.zoom, canvas.height / 2 - c.y * c.zoom);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0c2a40';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    toWorld();
    ctx.imageSmoothingQuality = 'high';
    const view = this.viewRect(0);
    this.sea.drawWater(ctx, view, time, sea);
    for (const h of frame.hotspots) this.drawHotspot(h, time);

    const pose = { x: SEA_BOAT.x, y: SEA_BOAT.y, h: 0 };
    const size = { length: SEA_BOAT.length, beam: SEA_BOAT.beam };
    if (sea.sailing) drawWake(ctx, pose, { ...size, speed: 1, time });
    const evening = sea.time === 'Night' || sea.time === 'Sunset';
    drawBoat(ctx, pose, { ...size, time, bob: sea.sailing ? 2.5 : 1, lights: evening });
    this.drawChums(frame, time);

    this.updateAnims(frame.players);
    for (const p of frame.players) if (p.s !== FishingState.IDLE && p.bx != null) drawLineAndBobber(ctx, p, time);
    if (frame.aim) this.drawAim(frame.aim);
    const sorted = [...frame.players].sort((a, b) => a.y - b.y);
    for (const p of sorted) drawAngler(ctx, p, { self: p.id === frame.meId, time, anim: this.anims.get(p.id) });
    this.drawPets(frame.players, time);

    // Daylight, night and weather over the scene; lanterns shine through.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.sea.drawSky(ctx, canvas.width, canvas.height, time, sea);
    toWorld();
    if (evening) drawBoatLights(ctx, pose, size);

    for (const p of sorted) drawNameTag(ctx, p, p.id === frame.meId);
    for (const p of frame.players) if (p.s === FishingState.REELING && p.id !== frame.meId) drawReelBars(ctx, p, false, time);
    for (const p of frame.players) if (p.s === FishingState.REELING && p.id === frame.meId) drawReelBars(ctx, p, true, time);
    this.drawEffects(time);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  /** Pets trot after their owners, settling just behind them. */
  drawPets(players, time) {
    const seen = new Set();
    for (const p of players) {
      const pet = PETS[p.pt];
      if (!pet) continue;
      seen.add(p.id);
      const tx = p.x - Math.cos(p.f) * 24 + Math.sin(p.f) * 16;
      const ty = p.y - Math.sin(p.f) * 24 - Math.cos(p.f) * 16 + 4;
      let pos = this.petPos.get(p.id);
      if (!pos) {
        pos = { x: tx, y: ty, phase: Math.random() * 6, moving: false, flip: false };
        this.petPos.set(p.id, pos);
      }
      const dx = tx - pos.x;
      const dy = ty - pos.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 300) Object.assign(pos, { x: tx, y: ty }); // teleported (new room)
      else {
        pos.x += dx * 0.12;
        pos.y += dy * 0.12;
      }
      pos.moving = dist > 3;
      if (Math.abs(dx) > 1) pos.flip = dx > 0;
      if (this.onScreen(pos.x, pos.y)) drawPet(this.ctx, pos, pet, PET_RARITIES[pet.rarity].color, time);
    }
    for (const id of this.petPos.keys()) if (!seen.has(id)) this.petPos.delete(id);
  }

  drawChums(frame, time) {
    for (const c of frame.chums ?? []) {
      if (!this.onScreen(c.x, c.y, CHUM.radius)) continue;
      drawChumBucket(this.ctx, c, time, c.o === frame.meId, { radius: CHUM.radius, attract: CHUM.attractRadius });
    }
  }

  updateAnims(players) {
    const seen = new Set();
    for (const p of players) {
      seen.add(p.id);
      let a = this.anims.get(p.id);
      if (!a) {
        a = { x: p.x, y: p.y, phase: 0, moving: false };
        this.anims.set(p.id, a);
      }
      const d = Math.hypot(p.x - a.x, p.y - a.y);
      a.moving = d > 0.15;
      a.phase += d * 0.22;
      a.x = p.x;
      a.y = p.y;
    }
    for (const id of this.anims.keys()) if (!seen.has(id)) this.anims.delete(id);
  }

  // ---- water ------------------------------------------------------------------

  buildDynamicDecor() {
    const rnd = seeded(4242);
    const w = this.world;
    const t = this.terrain;
    const glints = [];
    for (let i = 0; i < 1400; i++) {
      const x = -400 + rnd() * (w.width + 800);
      const y = -400 + rnd() * (w.height + 800);
      if (t.sdf(x, y) < -12) glints.push({ x, y, phase: rnd() * 100, speed: 0.6 + rnd() * 0.8 });
    }
    const reeds = [];
    const current = [];
    for (const z of w.zones) {
      for (const r of zoneRects(z) || []) {
        if (z.decor === 'reeds') {
          for (let i = 0; i < (r.w * r.h) / 900; i++) {
            const x = r.x + rnd() * r.w;
            const y = r.y + rnd() * r.h;
            if (zoneAt(w, x, y) === z && t.sdf(x, y) > -160) {
              reeds.push({ x, y, h: 10 + rnd() * 14, phase: rnd() * 6, blades: 2 + Math.floor(rnd() * 3), cattail: rnd() < 0.35 });
            }
          }
        }
        if (z.decor === 'current') {
          for (let i = 0; i < (r.w * r.h) / 1800; i++) {
            const x = r.x + rnd() * r.w;
            const y = r.y + rnd() * r.h;
            if (zoneAt(w, x, y) === z) current.push({ x, y, len: 14 + rnd() * 22, phase: rnd() * 1000, min: r.x, span: r.w });
          }
        }
      }
    }
    // The river keeps flowing past the edge of the map.
    const river = w.zones.find((z) => z.decor === 'current');
    const channel = river && zoneRects(river).find((r) => r.x + r.w >= w.width);
    if (channel) {
      for (let i = 0; i < 60; i++) {
        current.push({ x: w.width + rnd() * 600, y: channel.y + rnd() * channel.h, len: 14 + rnd() * 22, phase: rnd() * 1000, min: channel.x, span: 600 + (w.width - channel.x) });
      }
    }
    reeds.sort((a, b) => a.y - b.y);
    return { glints, reeds, current };
  }

  drawCaustics(view, time) {
    const { ctx } = this;
    const p = this.causticPattern;
    if (!p) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const [alpha, sx, sy, scale] of [[THEME.caustics.alpha, 0.011, 0.007, 1.4], [THEME.caustics.alpha2, -0.008, 0.01, 2.3]]) {
      p.setTransform(new DOMMatrix().translateSelf(time * sx, time * sy).scaleSelf(scale, scale));
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p;
      ctx.fillRect(view.x0, view.y0, view.x1 - view.x0, view.y1 - view.y0);
    }
    ctx.restore();
  }

  drawGlints(time) {
    const { ctx } = this;
    ctx.fillStyle = '#ffffff';
    for (const g of this.dynamic.glints) {
      const s = Math.sin(time * 0.0016 * g.speed + g.phase);
      if (s < 0.94 || !this.onScreen(g.x, g.y)) continue;
      const k = (s - 0.94) / 0.06;
      const r = 1 + k * 2.4;
      ctx.globalAlpha = k * 0.9;
      ctx.beginPath();
      ctx.moveTo(g.x - r, g.y);
      ctx.lineTo(g.x, g.y - r * 0.3);
      ctx.lineTo(g.x + r, g.y);
      ctx.lineTo(g.x, g.y + r * 0.3);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  drawCurrent(time) {
    const { ctx } = this;
    ctx.strokeStyle = THEME.current;
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (const c of this.dynamic.current) {
      // Streaks drift west, into the lake.
      const x = c.min + ((((c.x - c.min) - time * 0.045 - c.phase) % c.span) + c.span) % c.span;
      if (!this.onScreen(x, c.y)) continue;
      ctx.moveTo(x, c.y);
      ctx.lineTo(x + c.len, c.y + Math.sin(x * 0.05) * 1.5);
    }
    ctx.stroke();
  }

  drawZoneLabels() {
    const { ctx } = this;
    ctx.font = '700 24px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = THEME.zoneLabel;
    if ('letterSpacing' in ctx) ctx.letterSpacing = '4px';
    for (const z of this.world.zones) {
      const r = zoneRects(z)?.[0];
      if (!r || z.label === false || !this.onScreen(r.x + r.w / 2, r.y + r.h / 2, 200)) continue;
      ctx.fillText(z.name.toUpperCase(), r.x + r.w / 2, r.y + r.h / 2);
    }
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  }

  drawSurf(time) {
    const { ctx } = this;
    ctx.lineCap = 'round';
    ctx.lineWidth = 1.6;
    for (const p of this.terrain.coast) {
      if (!this.onScreen(p.x, p.y, 20)) continue;
      // Each bit of shoreline washes in and out on its own rhythm.
      const wave = 0.5 + 0.5 * Math.sin(time * 0.0016 + p.phase);
      const off = 2 + wave * 6;
      const x = p.x + p.nx * off;
      const y = p.y + p.ny * off;
      ctx.strokeStyle = `rgba(255,255,255,${0.12 + (1 - wave) * 0.4})`;
      ctx.beginPath();
      ctx.moveTo(x - p.ny * p.len, y + p.nx * p.len);
      ctx.quadraticCurveTo(x + p.nx * 1.5, y + p.ny * 1.5, x + p.ny * p.len, y - p.nx * p.len);
      ctx.stroke();
    }
  }

  drawReeds(time) {
    const { ctx } = this;
    const R = THEME.reed;
    ctx.lineCap = 'round';
    for (const r of this.dynamic.reeds) {
      if (!this.onScreen(r.x, r.y, 30)) continue;
      const sway = Math.sin(time / 900 + r.phase) * 3;
      for (let b = 0; b < r.blades; b++) {
        const dx = (b - r.blades / 2) * 2.2;
        const h = r.h * (0.75 + 0.25 * ((b * 7) % 3) / 2);
        ctx.strokeStyle = b % 2 ? R.dark : R.blade;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(r.x + dx, r.y);
        ctx.quadraticCurveTo(r.x + dx, r.y - h / 2, r.x + dx + sway * (1 + b * 0.2), r.y - h);
        ctx.stroke();
      }
      if (r.cattail) {
        ctx.strokeStyle = R.head;
        ctx.lineWidth = 3.2;
        ctx.beginPath();
        ctx.moveTo(r.x + sway, r.y - r.h + 1);
        ctx.lineTo(r.x + sway * 1.1, r.y - r.h - 5);
        ctx.stroke();
      }
    }
  }

  drawAreaLabels() {
    const { ctx } = this;
    const L = THEME.areaLabel;
    ctx.font = L.font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if ('letterSpacing' in ctx) ctx.letterSpacing = '3px';
    ctx.lineJoin = 'round';
    for (const a of this.world.areas || []) {
      if (!a.label || !this.onScreen(a.label.x, a.label.y, 300)) continue;
      ctx.strokeStyle = L.outline;
      ctx.lineWidth = 6;
      ctx.strokeText(a.name.toUpperCase(), a.label.x, a.label.y);
      ctx.fillStyle = L.color;
      ctx.fillText(a.name.toUpperCase(), a.label.x, a.label.y);
    }
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  }

  // ---- hotspots ----------------------------------------------------------------

  drawHotspot(h, time) {
    const { ctx } = this;
    if (!this.onScreen(h.x, h.y, h.r)) return;
    if (h.b) {
      // The boss's weak spot: a pulsing red target.
      const pulse = 0.5 + 0.5 * Math.sin(time / 180);
      ctx.save();
      const g = ctx.createRadialGradient(h.x, h.y, 0, h.x, h.y, h.r);
      g.addColorStop(0, `rgba(255,60,60,${0.35 + 0.2 * pulse})`);
      g.addColorStop(1, 'rgba(255,60,60,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(h.x, h.y, h.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ff4d4d';
      ctx.lineWidth = 2.5;
      for (const r of [h.r * 0.95, h.r * 0.55]) {
        ctx.beginPath();
        ctx.arc(h.x, h.y, r, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(h.x - h.r, h.y);
      ctx.lineTo(h.x + h.r, h.y);
      ctx.moveTo(h.x, h.y - h.r);
      ctx.lineTo(h.x, h.y + h.r);
      ctx.stroke();
      ctx.font = '900 12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.strokeText('WEAK SPOT ×2', h.x, h.y - h.r - 6);
      ctx.fillStyle = '#ffb4b4';
      ctx.fillText('WEAK SPOT ×2', h.x, h.y - h.r - 6);
      ctx.restore();
      return;
    }
    const H = THEME.hotspot;
    const fade = clamp(h.life / 5, 0, 1);
    ctx.save();
    ctx.globalAlpha = fade;
    // Warm glow of churned-up water.
    const g = ctx.createRadialGradient(h.x, h.y, 0, h.x, h.y, h.r);
    g.addColorStop(0, `${H.glow}0.22)`);
    g.addColorStop(1, `${H.glow}0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(h.x, h.y, h.r, 0, Math.PI * 2);
    ctx.fill();
    // Rotating dashed ring.
    ctx.strokeStyle = H.ring;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([8, 10]);
    ctx.lineDashOffset = -time / 40;
    ctx.beginPath();
    ctx.arc(h.x, h.y, h.r * 0.92, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    // A small school circling under the surface.
    ctx.fillStyle = H.fish;
    for (let i = 0; i < 5; i++) {
      const a = time / 1400 + (i / 5) * Math.PI * 2 + (h.id % 7);
      const rr = h.r * (0.35 + 0.12 * Math.sin(i * 2.1 + time / 900));
      ctx.save();
      ctx.translate(h.x + Math.cos(a) * rr, h.y + Math.sin(a) * rr);
      ctx.rotate(a + Math.PI / 2);
      ctx.beginPath();
      ctx.ellipse(0, 0, 5, 2, 0, 0, Math.PI * 2);
      ctx.moveTo(-4, 0);
      ctx.lineTo(-8, -2.5);
      ctx.lineTo(-8, 2.5);
      ctx.fill();
      ctx.restore();
    }
    // Bubbles popping up.
    ctx.strokeStyle = H.bubble;
    ctx.lineWidth = 1;
    for (let i = 0; i < 7; i++) {
      const cycle = (time / 1100 + i * 0.37 + h.id * 0.13) % 1;
      const a = i * 2.4 + h.id;
      const d = h.r * 0.6 * ((i * 0.37) % 1);
      ctx.globalAlpha = fade * (1 - cycle);
      ctx.beginPath();
      ctx.arc(h.x + Math.cos(a) * d, h.y + Math.sin(a) * d, 1 + cycle * 3, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  // ---- aiming ------------------------------------------------------------------

  drawAim(aim) {
    const { ctx, world } = this;
    const dist = castDistance(aim.power, aim.range);
    const tx = aim.x + Math.cos(aim.angle) * dist;
    const ty = aim.y + Math.sin(aim.angle) * dist;
    const zone = zoneAt(world, tx, ty);
    const color = zone ? THEME.aim.line : THEME.aim.bad;
    // Dotted arc showing the cast's flight.
    ctx.fillStyle = color;
    const n = Math.max(6, Math.floor(dist / 14));
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const x = aim.x + (tx - aim.x) * t;
      const y = aim.y + (ty - aim.y) * t - Math.sin(Math.PI * t) * Math.min(60, dist * 0.18);
      ctx.globalAlpha = 0.35 + 0.5 * t;
      ctx.beginPath();
      ctx.arc(x, y, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(tx, ty, 9, 6, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(tx - 4, ty);
    ctx.lineTo(tx + 4, ty);
    ctx.moveTo(tx, ty - 3);
    ctx.lineTo(tx, ty + 3);
    ctx.stroke();
    const onBoat = world.kind === 'sea' && tx > 0 && ty > 0 && tx < world.width && ty < world.height;
    const label = zone ? zone.name : onBoat ? 'The boat' : isWalkable(world, tx, ty) ? 'Dry land' : 'Out of reach';
    ctx.font = '700 11px system-ui, sans-serif';
    const w = ctx.measureText(label).width + 12;
    ctx.fillStyle = THEME.aim.pill;
    ctx.beginPath();
    ctx.roundRect(tx - w / 2, ty - 27, w, 15, 7.5);
    ctx.fill();
    ctx.fillStyle = zone ? '#fff' : THEME.aim.bad;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, tx, ty - 19);
    ctx.textBaseline = 'alphabetic';
  }

  // ---- effects -----------------------------------------------------------------

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
        ctx.ellipse(e.x, e.y, 4 + t * 24, 3 + t * 15, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = THEME.splash;
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          const d = 4 + t * 14;
          ctx.beginPath();
          ctx.arc(e.x + Math.cos(a) * d, e.y + Math.sin(a) * d * 0.6 - Math.sin(t * Math.PI) * 8, 1.4 * (1 - t), 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (e.type === 'fishPop') {
        // The caught fish leaps up above the angler, then fades.
        const rise = Math.sin((Math.min(t * 2.2, 1) * Math.PI) / 2);
        const w = e.big ? 74 : 54;
        const h = w * (FISH_SPRITE_SIZE.h / FISH_SPRITE_SIZE.w);
        const x = e.x;
        const y = e.y - 30 - rise * 34;
        ctx.globalAlpha = t < 0.75 ? 1 : 1 - (t - 0.75) / 0.25;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(Math.sin(time / 180) * 0.12);
        const s = t < 0.15 ? 0.4 + (t / 0.15) * 0.75 : 1.15 - Math.min(0.15, (t - 0.15) * 0.6);
        ctx.scale(s, s);
        ctx.drawImage(fishSprite(e.species), -w / 2, -h / 2, w, h);
        ctx.restore();
        if (e.text) {
          ctx.font = THEME.floatFont;
          ctx.textAlign = 'center';
          ctx.lineWidth = 3;
          ctx.strokeStyle = 'rgba(0,0,0,0.6)';
          ctx.strokeText(e.text, x, y + h / 2 + 10);
          ctx.fillStyle = e.color || '#fff';
          ctx.fillText(e.text, x, y + h / 2 + 10);
        }
      } else if (e.type === 'text') {
        ctx.globalAlpha = 1 - t * t;
        ctx.font = THEME.floatFont;
        ctx.textAlign = 'center';
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.strokeText(e.text, e.x, e.y - 40 - t * 30);
        ctx.fillStyle = e.color || '#fff';
        ctx.fillText(e.text, e.x, e.y - 40 - t * 30);
      }
    }
    ctx.globalAlpha = 1;
  }

  // ---- minimap (screen space, bottom-right) --------------------------------------

  drawMinimap(frame) {
    const { ctx, dpr } = this;
    const cssWidth = window.innerWidth < 800 ? 140 : MINIMAP_WIDTH;
    const width = Math.round(cssWidth * dpr);
    if (!this.minimap || this.minimap.width !== width) {
      this.minimap = { canvas: this.terrain.minimapImage(width), width, scale: width / this.world.width };
    }
    const { canvas: mm, scale } = this.minimap;
    const margin = 12 * dpr;
    const x0 = this.canvas.width - mm.width - margin;
    const y0 = this.canvas.height - mm.height - 16 * dpr;

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x0, y0, mm.width, mm.height, 8 * dpr);
    ctx.clip();
    ctx.globalAlpha = 0.95;
    ctx.drawImage(mm, x0, y0);
    ctx.globalAlpha = 1;

    const c = this.camera;
    const vw = (this.canvas.width / c.zoom) * scale;
    const vh = (this.canvas.height / c.zoom) * scale;
    ctx.strokeStyle = THEME.minimap.view;
    ctx.lineWidth = 1 * dpr;
    ctx.strokeRect(x0 + c.x * scale - vw / 2, y0 + c.y * scale - vh / 2, vw, vh);

    ctx.fillStyle = THEME.minimap.hotspot;
    for (const h of frame.hotspots) {
      ctx.beginPath();
      ctx.arc(x0 + h.x * scale, y0 + h.y * scale, 2.5 * dpr, 0, Math.PI * 2);
      ctx.fill();
    }
    if (frame.zoo) {
      ctx.fillStyle = '#c77dff';
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1 * dpr;
      ctx.beginPath();
      ctx.moveTo(x0 + frame.zoo.x * scale, y0 + frame.zoo.y * scale - 5 * dpr);
      ctx.lineTo(x0 + frame.zoo.x * scale + 4.5 * dpr, y0 + frame.zoo.y * scale + 3.5 * dpr);
      ctx.lineTo(x0 + frame.zoo.x * scale - 4.5 * dpr, y0 + frame.zoo.y * scale + 3.5 * dpr);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.fillStyle = '#c1121f';
    for (const c of frame.chums ?? []) {
      ctx.beginPath();
      ctx.arc(x0 + c.x * scale, y0 + c.y * scale, 2.5 * dpr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#ffd166';
    for (const shop of this.world.shops ?? []) {
      ctx.fillRect(x0 + shop.x * scale - 3 * dpr, y0 + shop.y * scale - 3 * dpr, 6 * dpr, 6 * dpr);
    }
    const boat = frame.boat;
    if (boat?.x != null) {
      // The visiting boat: a small hull shape.
      ctx.save();
      ctx.translate(x0 + boat.x * scale, y0 + boat.y * scale);
      ctx.rotate(boat.h);
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#7a2e2e';
      ctx.lineWidth = 1.5 * dpr;
      ctx.beginPath();
      ctx.moveTo(7 * dpr, 0);
      ctx.lineTo(-5 * dpr, -3.5 * dpr);
      ctx.lineTo(-5 * dpr, 3.5 * dpr);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
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
    ctx.strokeStyle = THEME.minimap.border;
    ctx.lineWidth = 2 * dpr;
    ctx.beginPath();
    ctx.roundRect(x0, y0, mm.width, mm.height, 8 * dpr);
    ctx.stroke();
  }
}
