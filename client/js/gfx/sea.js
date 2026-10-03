// The open sea on a boat voyage: water coloured by location and time of day,
// waves that stream past while the boat sails, each location's scenery and
// a shimmering overlay while a special event is on.
//
// SeaScene.drawWater() goes under the boat and anglers. drawSky() goes over
// them (time-of-day light, rain) but under name tags and the HUD.

import { Terrain } from './terrain.js';
import { graphics } from '../graphics.js';
import { seeded } from './noise.js';
import { BOSSES, DECK_AREAS, SEA_BOAT, SEA_EVENTS, SEA_LOCATIONS } from '/shared/voyage.js';

const TILE = 900; // scenery repeats every TILE world units as the sea scrolls by

// Light for each time of day: a colour wash over everything, and how much to darken.
const DAYLIGHT = {
  Morning: { wash: 'rgba(255,236,200,0.08)', dark: 0 },
  Afternoon: { wash: null, dark: 0 },
  Sunset: { wash: 'rgba(255,130,70,0.13)', dark: 0.1 },
  Night: { wash: 'rgba(40,60,140,0.22)', dark: 0.42 },
};

function hexRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export class SeaScene {
  constructor(ctx) {
    this.ctx = ctx;
    this.caustics = ctx.createPattern(Terrain.causticTile(), 'repeat');
    this.flow = 0; // how far the sea has scrolled past (world units)
    this.lastTime = null;
    const rnd = seeded(777);
    const scatter = (n, make) => Array.from({ length: n }, () => make(rnd));
    this.waves = scatter(160, (r) => ({ x: r() * TILE, y: r() * TILE, len: 10 + r() * 26, phase: r() * 6 }));
    this.kelp = scatter(34, (r) => ({ x: r() * TILE, y: r() * TILE, h: 40 + r() * 70, phase: r() * 6 }));
    this.coral = scatter(46, (r) => ({ x: r() * TILE, y: r() * TILE, r: 12 + r() * 30, hue: [340, 20, 280, 40, 190][Math.floor(r() * 5)] }));
    this.ripples = scatter(60, (r) => ({ x: r() * TILE, y: r() * TILE, len: 40 + r() * 90 }));
    this.motes = scatter(120, (r) => ({ x: r() * TILE, y: r() * TILE, phase: r() * 6, size: 1 + r() * 2 }));
    this.rain = scatter(220, (r) => ({ x: r(), y: r(), speed: 0.6 + r() * 0.6 }));
    this.sparkles = scatter(90, (r) => ({ x: r() * TILE, y: r() * TILE, phase: r() * 6 }));
  }

  /** state: { loc, time ('Morning'...), event (id or null), sailing (bool) } */
  drawWater(ctx, view, time, state) {
    const dt = this.lastTime == null ? 0 : Math.min(100, time - this.lastTime);
    this.lastTime = time;
    // The boat moves east, so the water streams west. Slow drift when stopped.
    this.flow += dt * (state.sailing ? 0.22 : 0.012);
    const loc = SEA_LOCATIONS[state.loc];
    const [deep, shallow] = (loc?.water ?? ['#143a5c', '#25628f']).map(hexRgb);
    const { x0, y0, x1, y1 } = view;

    // Base colour: lighter towards the middle of the view.
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const g = ctx.createRadialGradient(cx, cy, 50, cx, cy, Math.max(x1 - x0, y1 - y0) * 0.7);
    g.addColorStop(0, `rgb(${shallow})`);
    g.addColorStop(1, `rgb(${deep})`);
    ctx.fillStyle = g;
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);

    this.drawScenery(ctx, view, time, state.loc);

    // Moving light on the water.
    if (this.caustics) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const [alpha, sx, sy, scale] of [[0.07, 0.011, 0.007, 1.6], [0.045, -0.008, 0.01, 2.6]].slice(0, graphics.settings.caustics)) {
        this.caustics.setTransform(new DOMMatrix().translateSelf(-this.flow + time * sx, time * sy).scaleSelf(scale, scale));
        ctx.globalAlpha = alpha;
        ctx.fillStyle = this.caustics;
        ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      }
      ctx.restore();
    }

    // Whitecaps streaming past.
    const stormy = state.loc === 'stormBanks';
    ctx.strokeStyle = '#ffffff';
    ctx.lineCap = 'round';
    this.tiled(view, this.waves, (w, x, y) => {
      const s = Math.sin(time / 700 + w.phase);
      if (s < (stormy ? -0.2 : 0.2)) return;
      ctx.globalAlpha = (s - 0.2) * (stormy ? 0.55 : 0.35) * (state.sailing ? 1.3 : 1);
      ctx.lineWidth = stormy ? 2.4 : 1.6;
      const len = w.len * (state.sailing ? 1.8 : 1);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + len / 2, y - 3, x + len, y);
      ctx.stroke();
    });
    ctx.globalAlpha = 1;

    if (state.event) this.drawEventWater(ctx, view, time, state.event);
    if (state.boss && !state.boss.r) this.drawBoss(ctx, time, state.boss, state.phase);
  }

  /**
   * The boss circling the trawler under the surface. It rises as the fight
   * goes on (more visible), and flashes when hit.
   */
  drawBoss(ctx, time, boss, phase) {
    const b = BOSSES[boss.id];
    if (!b) return;
    const cx = SEA_BOAT.x;
    const cy = SEA_BOAT.y;
    const rising = phase === 'bossIntro' ? 0.4 : 0.55 + 0.35 * (1 - boss.hp / Math.max(1, boss.mx));
    const angle = time / 6000;
    const bx = cx + Math.cos(angle) * 430;
    const by = cy + Math.sin(angle) * 300;
    const heading = angle + Math.PI / 2;
    const hit = this.lastHp != null && boss.hp < this.lastHp;
    if (hit) this.hitFlash = time;
    this.lastHp = boss.hp;
    const flash = this.hitFlash && time - this.hitFlash < 250 ? 1 : 0;
    ctx.save();
    ctx.globalAlpha = 0.35 * rising + 0.25 * flash;
    ctx.fillStyle = flash ? '#ffffff' : b.color;
    switch (boss.id) {
      case 'kraken': {
        // A huge mantle, and tentacles curling up around the boat.
        ctx.beginPath();
        ctx.ellipse(bx, by, 150, 110, heading, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineCap = 'round';
        ctx.strokeStyle = ctx.fillStyle;
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2 + time / 2500;
          const r = 340 + Math.sin(time / 700 + i) * 30;
          const tx = cx + Math.cos(a) * r;
          const ty = cy + Math.sin(a) * r * 0.75;
          ctx.lineWidth = 26;
          ctx.beginPath();
          ctx.moveTo(tx, ty);
          ctx.quadraticCurveTo(tx + Math.sin(time / 400 + i) * 60, ty - 80, tx + Math.cos(a) * 60, ty + Math.sin(a) * 60 - 140);
          ctx.stroke();
        }
        break;
      }
      case 'serpent': {
        // Coils breaking the surface along a winding path.
        for (let i = 0; i < 9; i++) {
          const t = angle - i * 0.18;
          const x = cx + Math.cos(t) * 440;
          const y = cy + Math.sin(t) * 310 + Math.sin(time / 300 + i) * 20;
          ctx.beginPath();
          ctx.ellipse(x, y, 60 - i * 3, 34 - i * 2, t + Math.PI / 2, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      default: {
        // A great body with a tail: the Megalodon and the Ghost Whale.
        ctx.translate(bx, by);
        ctx.rotate(heading);
        const len = boss.id === 'ghostwhale' ? 340 : 300;
        ctx.beginPath();
        ctx.ellipse(0, 0, len / 2, len / 6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        const flick = Math.sin(time / 300) * 30;
        ctx.moveTo(-len / 2 + 10, 0);
        ctx.lineTo(-len / 2 - 80, -70 + flick);
        ctx.lineTo(-len / 2 - 60, 0);
        ctx.lineTo(-len / 2 - 80, 70 + flick);
        ctx.closePath();
        ctx.fill();
        if (boss.id === 'megalodon') {
          ctx.beginPath(); // dorsal fin cutting the surface
          ctx.moveTo(-10, -len / 6);
          ctx.lineTo(30, -len / 6 - 60);
          ctx.lineTo(60, -len / 6);
          ctx.closePath();
          ctx.globalAlpha = 0.75;
          ctx.fill();
        } else {
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = 0.2 + 0.1 * Math.sin(time / 500);
          ctx.beginPath();
          ctx.ellipse(0, 0, len / 2 + 30, len / 6 + 30, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    // Glowing eyes.
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = 0.6 * rising;
    ctx.fillStyle = boss.id === 'ghostwhale' ? '#e0fbfc' : '#ffd166';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(bx + Math.cos(heading) * 70 + Math.cos(heading + Math.PI / 2) * side * 22, by + Math.sin(heading) * 70 + Math.sin(heading + Math.PI / 2) * side * 22, 7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // ---- boss fight mechanics -----------------------------------------------------------

  /** The boss breaching: a golden harpoon ring with its head rising through it. */
  drawBreach(ctx, time, bk, bossId) {
    const b = BOSSES[bossId];
    const pulse = 0.5 + 0.5 * Math.sin(time / 120);
    const urgent = bk.t < 2.5;
    ctx.save();
    // Churning white water.
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + time / 400;
      ctx.beginPath();
      ctx.arc(bk.x + Math.cos(a) * bk.r * 0.9, bk.y + Math.sin(a) * bk.r * 0.9, 9 + 4 * Math.sin(time / 150 + i), 0, Math.PI * 2);
      ctx.fill();
    }
    // The boss itself, surfacing.
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = b?.color ?? '#888';
    ctx.beginPath();
    ctx.ellipse(bk.x, bk.y + 6, bk.r * 0.55, bk.r * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#ffd166';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(bk.x + side * bk.r * 0.2, bk.y - 4, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    // The target ring.
    ctx.strokeStyle = urgent && pulse > 0.5 ? '#ffffff' : '#ffd166';
    ctx.lineWidth = 4;
    ctx.setLineDash([14, 10]);
    ctx.lineDashOffset = -time / 40;
    ctx.beginPath();
    ctx.arc(bk.x, bk.y, bk.r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    // Time left, as a shrinking arc.
    ctx.strokeStyle = 'rgba(255,209,102,0.9)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(bk.x, bk.y, bk.r + 9, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, bk.t / 7));
    ctx.stroke();
    ctx.font = '900 14px Nunito, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(0,0,0,0.65)';
    ctx.strokeText('HARPOON! CAST HERE', bk.x, bk.y - bk.r - 18);
    ctx.fillStyle = '#ffd166';
    ctx.fillText('HARPOON! CAST HERE', bk.x, bk.y - bk.r - 18);
    ctx.restore();
  }

  /** The deck area a Slam is about to hit, flashing faster as it lands. */
  drawSlamWarning(ctx, time, areaId, left) {
    const a = DECK_AREAS[areaId];
    if (!a) return;
    const rate = left <= 1 ? 70 : 140;
    const flash = 0.5 + 0.5 * Math.sin(time / rate);
    ctx.save();
    ctx.fillStyle = `rgba(255,40,40,${0.22 + 0.25 * flash})`;
    ctx.fillRect(a.x, a.y, a.w, a.h);
    ctx.strokeStyle = '#ff4d4d';
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 6]);
    ctx.strokeRect(a.x + 1.5, a.y + 1.5, a.w - 3, a.h - 3);
    ctx.setLineDash([]);
    // Hazard stripes along the edge.
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#ffd166';
    for (let x = a.x; x < a.x + a.w - 6; x += 16) ctx.fillRect(x, a.y, 8, 4);
    ctx.globalAlpha = 1;
    ctx.font = '900 13px Nunito, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    const label = `MOVE! ${Math.max(1, left)}`;
    ctx.strokeText(label, a.x + a.w / 2, a.y + a.h / 2 + 5);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(label, a.x + a.w / 2, a.y + a.h / 2 + 5);
    ctx.restore();
  }

  /** Something grabbing the rail, with how many strikes it needs and its timer. */
  drawGrab(ctx, time, g, bossId, near) {
    const b = BOSSES[bossId];
    const color = b?.color ?? '#9d4edd';
    const outward = g.y < SEA_BOAT.y ? -1 : 1; // which side of the boat it comes from
    const sway = Math.sin(time / 200 + g.id) * 6;
    ctx.save();
    // The limb reaching up over the rail from the water.
    ctx.strokeStyle = color;
    ctx.lineCap = 'round';
    ctx.lineWidth = 18;
    ctx.beginPath();
    ctx.moveTo(g.x - 20, g.y + outward * 70);
    ctx.quadraticCurveTo(g.x + sway, g.y + outward * 35, g.x + sway * 0.5, g.y);
    ctx.stroke();
    ctx.lineWidth = 8;
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.moveTo(g.x - 18, g.y + outward * 66);
    ctx.quadraticCurveTo(g.x + sway, g.y + outward * 33, g.x + sway * 0.5, g.y);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(g.x + sway * 0.5, g.y, 13, 0, Math.PI * 2);
    ctx.fill();
    // Suckers / scales.
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(g.x + sway * 0.5 + (i - 1) * 6, g.y - outward * 2, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
    // Ring showing how close you must stand, highlighted when you're in range.
    ctx.strokeStyle = near ? '#ffd166' : 'rgba(255,255,255,0.35)';
    ctx.lineWidth = near ? 3 : 1.5;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.arc(g.x, g.y, 34, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    // Strikes left and time left.
    const w = 64;
    const x = g.x - w / 2;
    const y = g.y - outward * 30 - 6;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x - 2, y - 2, w + 4, 12);
    ctx.fillStyle = '#ff6b6b';
    ctx.fillRect(x, y, w * (g.hp / g.mx), 8);
    ctx.font = '800 11px Nunito, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    const label = near ? `MASH E! ${g.hp}` : `${g.hp} hits · ${g.t}s`;
    ctx.strokeText(label, g.x, y - 5);
    ctx.fillStyle = g.t <= 4 ? '#ff6b6b' : '#ffffff';
    ctx.fillText(label, g.x, y - 5);
    ctx.restore();
  }

  /** Stars circling a dazed angler's head. */
  drawDazed(ctx, time, p) {
    ctx.save();
    ctx.fillStyle = '#ffd166';
    for (let i = 0; i < 3; i++) {
      const a = time / 250 + (i / 3) * Math.PI * 2;
      const x = p.x + Math.cos(a) * 14;
      const y = p.y - 24 + Math.sin(a) * 5;
      ctx.beginPath();
      for (let k = 0; k < 10; k++) {
        const r = k % 2 ? 1.6 : 4;
        const t = (k / 10) * Math.PI * 2 - Math.PI / 2;
        ctx.lineTo(x + Math.cos(t) * r, y + Math.sin(t) * r);
      }
      ctx.fill();
    }
    ctx.restore();
  }

  /** Call fn(item, x, y) for every copy of a tiled item inside the view. */
  tiled(view, items, fn, margin = 120) {
    const off = ((this.flow % TILE) + TILE) % TILE;
    const tx0 = Math.floor((view.x0 - margin + off) / TILE);
    const tx1 = Math.floor((view.x1 + margin + off) / TILE);
    const ty0 = Math.floor((view.y0 - margin) / TILE);
    const ty1 = Math.floor((view.y1 + margin) / TILE);
    for (let tx = tx0; tx <= tx1; tx++) {
      for (let ty = ty0; ty <= ty1; ty++) {
        for (const it of items) {
          const x = tx * TILE + it.x - off;
          const y = ty * TILE + it.y;
          if (x < view.x0 - margin || x > view.x1 + margin || y < view.y0 - margin || y > view.y1 + margin) continue;
          fn(it, x, y);
        }
      }
    }
  }

  drawScenery(ctx, view, time, loc) {
    switch (loc) {
      case 'kelpForest':
        ctx.lineCap = 'round';
        this.tiled(view, this.kelp, (k, x, y) => {
          const sway = Math.sin(time / 1500 + k.phase) * 10;
          ctx.strokeStyle = 'rgba(20,70,30,0.45)';
          ctx.lineWidth = 7;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.bezierCurveTo(x + sway, y - k.h * 0.3, x - sway, y - k.h * 0.7, x + sway * 1.4, y - k.h);
          ctx.stroke();
          ctx.fillStyle = 'rgba(60,110,40,0.45)';
          for (let i = 1; i < 5; i++) {
            ctx.beginPath();
            ctx.ellipse(x + sway * (i / 4) + (i % 2 ? 6 : -6), y - (k.h * i) / 5, 7, 3, i % 2 ? 0.5 : -0.5, 0, Math.PI * 2);
            ctx.fill();
          }
        });
        break;
      case 'coralGardens':
        this.tiled(view, this.coral, (c, x, y) => {
          ctx.fillStyle = `hsla(${c.hue}, 70%, 60%, 0.32)`;
          ctx.beginPath();
          for (let i = 0; i < 7; i++) {
            const a = (i / 7) * Math.PI * 2;
            ctx.ellipse(x + Math.cos(a) * c.r * 0.5, y + Math.sin(a) * c.r * 0.5, c.r * 0.45, c.r * 0.3, a, 0, Math.PI * 2);
          }
          ctx.fill();
        });
        break;
      case 'glassShallows':
        ctx.strokeStyle = 'rgba(255,245,215,0.28)';
        ctx.lineWidth = 2;
        this.tiled(view, this.ripples, (r, x, y) => {
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.bezierCurveTo(x + r.len * 0.3, y - 6, x + r.len * 0.6, y + 6, x + r.len, y);
          ctx.stroke();
        });
        break;
      case 'sunkenGalleon':
        this.drawWreck(ctx, time);
        break;
      case 'whaleRoad':
        this.drawWhales(ctx, view, time);
        break;
      case 'abyssalTrench':
      case 'moonlitReef': {
        const color = loc === 'abyssalTrench' ? '140,200,255' : '160,255,220';
        this.tiled(view, this.motes, (m, x, y) => {
          const a = 0.25 + 0.25 * Math.sin(time / 900 + m.phase);
          ctx.fillStyle = `rgba(${color},${a})`;
          ctx.beginPath();
          ctx.arc(x, y + Math.sin(time / 2000 + m.phase) * 6, m.size, 0, Math.PI * 2);
          ctx.fill();
        });
        if (loc === 'moonlitReef') {
          // The moon's reflection, always out to the north-east.
          const vx = (view.x0 + view.x1) / 2 + 260;
          const g = ctx.createLinearGradient(vx - 30, 0, vx + 30, 0);
          g.addColorStop(0, 'rgba(230,240,255,0)');
          g.addColorStop(0.5, 'rgba(230,240,255,0.22)');
          g.addColorStop(1, 'rgba(230,240,255,0)');
          ctx.fillStyle = g;
          ctx.fillRect(vx - 30, view.y0, 60, view.y1 - view.y0);
        }
        break;
      }
    }
  }

  drawWreck(ctx, time) {
    // A dark hull lying just under the surface north of the boat.
    ctx.save();
    ctx.translate(560, 260);
    ctx.rotate(-0.2);
    ctx.fillStyle = 'rgba(30,20,10,0.35)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 220, 60, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(30,20,10,0.4)';
    ctx.lineWidth = 3;
    for (let x = -180; x <= 180; x += 30) {
      ctx.beginPath();
      ctx.moveTo(x, -50);
      ctx.lineTo(x, 50);
      ctx.stroke();
    }
    // A broken mast poking out of the water, with a tattered sail.
    ctx.strokeStyle = '#3b2a1a';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(40, 0);
    ctx.lineTo(70, -40);
    ctx.stroke();
    ctx.fillStyle = 'rgba(220,210,180,0.75)';
    ctx.beginPath();
    ctx.moveTo(70, -40);
    ctx.lineTo(110, -30 + Math.sin(time / 500) * 3);
    ctx.lineTo(96, -6);
    ctx.lineTo(80, -18);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(40, 0, 10 + Math.sin(time / 600) * 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  drawWhales(ctx, view, time) {
    // A whale surfaces now and then, swimming slowly past.
    const period = 16000;
    for (let k = 0; k < 2; k++) {
      const t = ((time + k * 8000) % period) / period;
      const x = view.x0 - 200 + t * (view.x1 - view.x0 + 400);
      const y = view.y0 + (k ? 0.22 : 0.8) * (view.y1 - view.y0);
      const vis = Math.sin(t * Math.PI);
      ctx.save();
      ctx.translate(x, y);
      ctx.globalAlpha = 0.45 * vis;
      ctx.fillStyle = '#0b1f33';
      ctx.beginPath();
      ctx.ellipse(0, 0, 110, 30, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-100, 0);
      ctx.lineTo(-150, -26 + Math.sin(time / 400) * 6);
      ctx.lineTo(-136, 0);
      ctx.lineTo(-150, 26 - Math.sin(time / 400) * 6);
      ctx.closePath();
      ctx.fill();
      // Spout.
      const spout = (time / 1000 + k * 3) % 6;
      if (spout < 1) {
        ctx.globalAlpha = 0.6 * (1 - spout) * vis;
        ctx.fillStyle = '#ffffff';
        for (let i = 0; i < 8; i++) {
          ctx.beginPath();
          ctx.arc(60 + Math.cos(i) * spout * 26, Math.sin(i * 1.7) * spout * 26, 4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    }
  }

  drawEventWater(ctx, view, time, eventId) {
    const ev = SEA_EVENTS[eventId];
    if (!ev) return;
    const [r, g, b] = hexRgb(ev.color);
    const pulse = 0.5 + 0.5 * Math.sin(time / 600);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `rgba(${r},${g},${b},${0.06 + 0.05 * pulse})`;
    ctx.fillRect(view.x0, view.y0, view.x1 - view.x0, view.y1 - view.y0);
    // Shimmering ribbons of light drifting through the water.
    ctx.strokeStyle = `rgba(${r},${g},${b},0.35)`;
    ctx.lineWidth = 3;
    for (let i = 0; i < 6; i++) {
      const y = view.y0 + ((i + 0.5) / 6) * (view.y1 - view.y0);
      ctx.beginPath();
      for (let x = view.x0; x <= view.x1; x += 30) {
        const yy = y + Math.sin(x / 90 + time / 700 + i) * 22;
        if (x === view.x0) ctx.moveTo(x, yy);
        else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
    this.tiled(view, this.sparkles, (s, x, y) => {
      const k = Math.sin(time / 300 + s.phase);
      if (k < 0.6) return;
      ctx.fillStyle = `rgba(${r},${g},${b},${(k - 0.6) * 2})`;
      ctx.beginPath();
      ctx.arc(x, y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    });
    // Feeding frenzy and treasure tide: fish breaking the surface everywhere.
    if (eventId === 'frenzy' || eventId === 'treasure') {
      ctx.globalCompositeOperation = 'source-over';
      this.tiled(view, this.motes, (m, x, y) => {
        const c = ((time / 1100) + m.phase) % 1;
        if (c > 0.35) return;
        ctx.strokeStyle = `rgba(255,255,255,${0.7 * (1 - c / 0.35)})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(x, y, 4 + c * 30, 2 + c * 14, 0, 0, Math.PI * 2);
        ctx.stroke();
      });
    }
    ctx.restore();
  }

  /** Over the boat and anglers: daylight, night, storm. In screen space. */
  drawSky(ctx, width, height, time, state) {
    const light = DAYLIGHT[state.time] ?? DAYLIGHT.Afternoon;
    let dark = light.dark;
    if (state.boss && !state.boss.r) dark += 0.15; // the sky darkens for the boss
    if (state.boss?.e === 'ink') {
      ctx.fillStyle = 'rgba(10,5,20,0.35)';
      ctx.fillRect(0, 0, width, height);
    }
    if (state.loc === 'stormBanks') dark += 0.18;
    if (state.loc === 'abyssalTrench') dark += 0.12;
    if (dark > 0) {
      ctx.fillStyle = `rgba(5,10,30,${dark})`;
      ctx.fillRect(0, 0, width, height);
    }
    if (light.wash) {
      ctx.fillStyle = light.wash;
      ctx.fillRect(0, 0, width, height);
    }
    if (state.loc === 'stormBanks') {
      // Rain, and a lightning flash every so often.
      ctx.strokeStyle = 'rgba(200,215,230,0.35)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (const d of this.rain.slice(0, Math.round(this.rain.length * graphics.settings.rain))) {
        const x = ((d.x * width + time * 0.25 * d.speed) % width);
        const y = ((d.y * height + time * 0.9 * d.speed) % height);
        ctx.moveTo(x, y);
        ctx.lineTo(x - 5, y + 16);
      }
      ctx.stroke();
      const flash = (time % 9000) / 9000;
      if (flash < 0.02 || (flash > 0.03 && flash < 0.04)) {
        ctx.fillStyle = 'rgba(230,240,255,0.35)';
        ctx.fillRect(0, 0, width, height);
      }
    }
    // Vignette.
    const v = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.35, width / 2, height / 2, Math.max(width, height) * 0.75);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, width, height);
  }
}
