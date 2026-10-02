// Anglers, rods, lines and bobbers, drawn top-down in world space.
// Each player's look (skin, hat) is derived from their id so it's stable and
// the same for everyone; rod, reel and bobber come from their gear tiers.

import { FishingState } from '/shared/constants.js';
import { BAIT_LOOK, REEL_LOOK, ROD_LOOK, look } from './gearArt.js';
import { seeded, seedFrom } from './noise.js';

const CAST_ANIM_MS = 600;
const SKIN = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac', '#d6a77a'];
const HATS = ['bucket', 'cap', 'beanie', 'straw'];
const HAT_COLORS = ['#556b2f', '#264653', '#e76f51', '#f4a261', '#2a9d8f', '#6d597a', '#8d99ae', '#bc6c25'];

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * t;

const styleCache = new Map();
function styleFor(id) {
  if (!styleCache.has(id)) {
    const rnd = seeded(seedFrom('angler', id));
    styleCache.set(id, {
      skin: SKIN[Math.floor(rnd() * SKIN.length)],
      hat: HATS[Math.floor(rnd() * HATS.length)],
      hatColor: HAT_COLORS[Math.floor(rnd() * HAT_COLORS.length)],
    });
  }
  return styleCache.get(id);
}

export function gearOf(p) {
  return { rod: p.g?.[0] ?? 0, reel: p.g?.[1] ?? 0, bait: p.g?.[2] ?? 0 };
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => clamp(Math.round(v + amt), 0, 255);
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

// ---- rod geometry --------------------------------------------------------------------

/** Rod butt, bend control point and tip in world space. */
export function rodGeometry(p, time) {
  const L = look(ROD_LOOK, gearOf(p).rod);
  const dx = Math.cos(p.f);
  const dy = Math.sin(p.f);
  const px = -dy;
  const py = dx;
  const base = { x: p.x + dx * 10 + px * 2, y: p.y + dy * 10 + py * 2 };
  let tip = { x: base.x + dx * L.length, y: base.y + dy * L.length };
  let ctrl = { x: (base.x + tip.x) / 2, y: (base.y + tip.y) / 2 };
  if (p.s === FishingState.REELING && p.bx != null) {
    // The rod bends towards the fish, more under tension.
    const side = Math.sign(dx * (p.by - p.y) - dy * (p.bx - p.x)) || 1;
    const bend = 4 + (p.tn ?? 0) * 12 + (p.pl ? Math.sin(time / 40) * 1.5 : 0);
    ctrl = { x: ctrl.x + px * side * bend, y: ctrl.y + py * side * bend };
    tip = { x: tip.x + px * side * bend * 0.9 - dx * bend * 0.4, y: tip.y + py * side * bend * 0.9 - dy * bend * 0.4 };
  } else if (p.s === FishingState.CASTING && p.castStart != null) {
    // A quick flick forward during the cast.
    const t = clamp((time - p.castStart) / 250, 0, 1);
    const flick = Math.sin(t * Math.PI) * 6;
    ctrl = { x: ctrl.x - px * flick, y: ctrl.y - py * flick };
  }
  return { base, ctrl, tip, look: L, dir: { x: dx, y: dy }, perp: { x: px, y: py } };
}

/** Where the bobber is drawn (animated arc while casting, pulled in while reeling). */
export function bobberPos(p, time) {
  if (p.s === FishingState.CASTING) {
    const t = clamp((time - (p.castStart ?? time)) / CAST_ANIM_MS, 0, 1);
    return { x: lerp(p.x, p.bx, t), y: lerp(p.y, p.by, t) - Math.sin(Math.PI * t) * 46, inAir: t < 1 };
  }
  if (p.s === FishingState.REELING) {
    const k = clamp(p.pg ?? 0, 0, 1) * 0.8;
    const shake = p.pl ? Math.sin(time / 25) * 2.5 : 0;
    return { x: lerp(p.bx, p.x, k) + shake, y: lerp(p.by, p.y, k) };
  }
  if (p.s === FishingState.BITE) return { x: p.bx, y: p.by + 1.5 + Math.sin(time / 50) * 2 };
  return { x: p.bx, y: p.by + Math.sin(time / 420) * 1.2 };
}

// ---- angler --------------------------------------------------------------------------

/**
 * anim: { phase, moving } walking animation state kept by the renderer.
 */
export function drawAngler(ctx, p, { self, time, anim }) {
  const st = styleFor(p.id);
  const step = anim?.moving ? Math.sin(anim.phase) : 0;

  // Ground shadow and the "this is you" marker.
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.ellipse(p.x + 3, p.y + 5, 13, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  if (self) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.lineDashOffset = -time / 60;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + 2, 17, 15, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.f);

  // Boots, alternating while walking.
  ctx.fillStyle = '#3a2f28';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(step * 4 * side - 1, side * 5, 4, 2.8, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Torso: shirt in the player's colour with a tackle vest.
  const shirt = p.color;
  const grad = ctx.createRadialGradient(-3, -4, 1, 0, 0, 13);
  grad.addColorStop(0, shade(shirt, 40));
  grad.addColorStop(1, shade(shirt, -25));
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(0, 0, 8, 11.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(85,95,60,0.55)';
  ctx.beginPath();
  ctx.ellipse(-1.5, 0, 5.5, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = shade(shirt, -50);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(0, 0, 8, 11.5, 0, 0, Math.PI * 2);
  ctx.stroke();

  // Arms reaching forward to hold the rod.
  const swing = step * 2;
  for (const side of [-1, 1]) {
    const hx = 11 + (side === 1 ? swing : -swing);
    const hy = side * 2.5;
    ctx.strokeStyle = shade(shirt, -15);
    ctx.lineWidth = 4.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(1, side * 9.5);
    ctx.lineTo((1 + hx) / 2, (side * 9.5 + hy) / 2 + side * 1.5);
    ctx.stroke();
    ctx.strokeStyle = st.skin;
    ctx.lineWidth = 3.6;
    ctx.beginPath();
    ctx.moveTo((1 + hx) / 2, (side * 9.5 + hy) / 2 + side * 1.5);
    ctx.lineTo(hx, hy);
    ctx.stroke();
    ctx.fillStyle = st.skin;
    ctx.beginPath();
    ctx.arc(hx, hy, 2.4, 0, Math.PI * 2);
    ctx.fill();
  }

  // Head and hat.
  ctx.fillStyle = st.skin;
  ctx.beginPath();
  ctx.arc(1.5, 0, 6.3, 0, Math.PI * 2);
  ctx.fill();
  drawHat(ctx, st);
  ctx.restore();

  drawRod(ctx, p, time);
}

function drawHat(ctx, st) {
  const c = st.hatColor;
  ctx.lineWidth = 1;
  switch (st.hat) {
    case 'bucket':
      ctx.fillStyle = shade(c, -20);
      ctx.beginPath();
      ctx.arc(1, 0, 9.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(1, 0, 6.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = shade(c, -45);
      ctx.beginPath();
      ctx.arc(1, 0, 6.4, 0, Math.PI * 2);
      ctx.stroke();
      break;
    case 'cap':
      ctx.fillStyle = shade(c, -15);
      ctx.beginPath();
      ctx.ellipse(7, 0, 5.5, 6.5, 0, -Math.PI / 2, Math.PI / 2); // brim pointing forward
      ctx.fill();
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(1, 0, 6.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = shade(c, 45);
      ctx.beginPath();
      ctx.arc(1, 0, 1.3, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'beanie':
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(1, 0, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = shade(c, -35);
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 5) {
        ctx.beginPath();
        ctx.moveTo(1 + Math.cos(a) * 2.5, Math.sin(a) * 2.5);
        ctx.lineTo(1 + Math.cos(a) * 6.8, Math.sin(a) * 6.8);
        ctx.stroke();
      }
      ctx.fillStyle = '#f1faee';
      ctx.beginPath();
      ctx.arc(1, 0, 2.6, 0, Math.PI * 2);
      ctx.fill();
      break;
    default: // straw hat
      ctx.fillStyle = '#e9c46a';
      ctx.beginPath();
      ctx.arc(1, 0, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(140,100,30,0.45)';
      for (let r = 7.5; r < 11; r += 1.6) {
        ctx.beginPath();
        ctx.arc(1, 0, r, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(1, 0, 6.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f4d58d';
      ctx.beginPath();
      ctx.arc(1, 0, 5.2, 0, Math.PI * 2);
      ctx.fill();
  }
}

function drawRod(ctx, p, time) {
  const { base, ctrl, tip, look: L, dir, perp } = rodGeometry(p, time);
  const R = look(REEL_LOOK, gearOf(p).reel);
  // Cork handle behind the hands.
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#a47148';
  ctx.lineWidth = 3.6;
  ctx.beginPath();
  ctx.moveTo(base.x - dir.x * 7, base.y - dir.y * 7);
  ctx.lineTo(base.x + dir.x * 2, base.y + dir.y * 2);
  ctx.stroke();
  // Blank, tapering towards the tip.
  if (L.glow) {
    ctx.shadowColor = L.glow;
    ctx.shadowBlur = 6;
  }
  const at = (t) => ({
    x: (1 - t) * (1 - t) * base.x + 2 * (1 - t) * t * ctrl.x + t * t * tip.x,
    y: (1 - t) * (1 - t) * base.y + 2 * (1 - t) * t * ctrl.y + t * t * tip.y,
  });
  const segs = 4;
  for (let i = 0; i < segs; i++) {
    const a = at(i / segs);
    const b = at((i + 1) / segs);
    ctx.strokeStyle = i === segs - 1 ? L.tip : L.color;
    ctx.lineWidth = L.width * (1 - i * 0.18);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  ctx.shadowBlur = 0;
  if (L.wraps) {
    ctx.fillStyle = L.wraps;
    for (const t of [0.35, 0.6, 0.82]) {
      const q = at(t);
      ctx.beginPath();
      ctx.arc(q.x, q.y, 1.3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Reel hanging off the side of the handle; its handle spins while reeling.
  const rx = base.x + perp.x * 4;
  const ry = base.y + perp.y * 4;
  ctx.fillStyle = R.body;
  ctx.strokeStyle = R.rim;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(rx, ry, 3.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  const spin = p.s === FishingState.REELING ? time / 60 : 0.8;
  ctx.strokeStyle = R.rim;
  ctx.beginPath();
  ctx.moveTo(rx, ry);
  ctx.lineTo(rx + Math.cos(spin) * 4.5, ry + Math.sin(spin) * 4.5);
  ctx.stroke();
}

// ---- line, bobber and lure ---------------------------------------------------------

export function drawLineAndBobber(ctx, p, time) {
  const { tip } = rodGeometry(p, time);
  const b = bobberPos(p, time);
  const tight = p.s === FishingState.REELING;
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(tip.x, tip.y);
  ctx.quadraticCurveTo((tip.x + b.x) / 2, (tip.y + b.y) / 2 + (tight ? 0 : 16), b.x, b.y);
  ctx.stroke();

  const B = look(BAIT_LOOK, gearOf(p).bait);
  const inWater = !b.inAir;
  if (inWater && p.s === FishingState.WAITING) {
    // Gentle rings spreading from the float.
    for (let i = 0; i < 2; i++) {
      const t = ((time / 1700 + i / 2) % 1);
      ctx.strokeStyle = `rgba(255,255,255,${0.35 * (1 - t)})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(b.x, b.y + 1, 4 + t * 16, 2.5 + t * 10, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  if (inWater && p.s === FishingState.BITE) {
    // Splashing as the fish takes it.
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + time / 120;
      const d = 6 + Math.sin(time / 60 + i) * 3;
      ctx.beginPath();
      ctx.arc(b.x + Math.cos(a) * d, b.y + Math.sin(a) * d * 0.6, 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  if (B.lure && (p.s === FishingState.REELING || b.inAir)) drawLure(ctx, b, B, time);
  else drawFloat(ctx, b, B, p.s === FishingState.BITE);

  if (p.s === FishingState.BITE) {
    ctx.font = '900 16px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.strokeText('!', b.x, b.y - 12);
    ctx.fillStyle = '#ffd166';
    ctx.fillText('!', b.x, b.y - 12);
  }
}

function drawFloat(ctx, b, B, dipping) {
  const r = dipping ? 3.6 : 4.8;
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(b.x + 1.5, b.y + 2, r, r * 0.7, 0, 0, Math.PI * 2);
  ctx.fill();
  if (B.glow) {
    ctx.shadowColor = B.glow;
    ctx.shadowBlur = 8;
  }
  ctx.fillStyle = B.bottom;
  ctx.beginPath();
  ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = B.top;
  ctx.beginPath();
  ctx.arc(b.x, b.y, r, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.beginPath();
  ctx.arc(b.x - r * 0.35, b.y - r * 0.45, r * 0.3, 0, Math.PI * 2);
  ctx.fill();
}

function drawLure(ctx, b, B, time) {
  const flash = 0.5 + 0.5 * Math.sin(time / 70);
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.rotate(Math.sin(time / 90) * 0.6);
  if (B.glow) {
    ctx.shadowColor = B.glow;
    ctx.shadowBlur = 10;
  }
  const grad = ctx.createLinearGradient(-5, -3, 5, 3);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(flash * 0.6 + 0.2, B.top);
  grad.addColorStop(1, B.bottom);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(0, 0, 5.5, 2.6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ---- labels and bars -----------------------------------------------------------------

export function drawNameTag(ctx, p, self) {
  ctx.font = '600 11px system-ui, sans-serif';
  const w = ctx.measureText(p.name).width + 12;
  const x = p.x - w / 2;
  const y = p.y - 34;
  ctx.fillStyle = self ? 'rgba(20,60,80,0.75)' : 'rgba(0,0,0,0.5)';
  ctx.beginPath();
  ctx.roundRect(x, y, w, 15, 7.5);
  ctx.fill();
  ctx.fillStyle = p.color;
  ctx.beginPath();
  ctx.arc(x + 6, y + 7.5, 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(p.name, p.x + 3, y + 8);
  ctx.textBaseline = 'alphabetic';
}

export function drawReelBars(ctx, p) {
  const W = 58;
  const x = p.x - W / 2;
  let y = p.y + 20;
  const bar = (value, color, label) => {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath();
    ctx.roundRect(x - 2, y - 2, W + 4, 9, 4.5);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x, y, Math.max(5, W * clamp(value, 0, 1)), 5, 2.5);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = '700 7px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(label, x - 4, y + 5);
    y += 11;
  };
  bar(p.pg ?? 0, '#7bd389', 'REEL');
  const tn = p.tn ?? 0;
  bar(tn, tn > 0.7 ? '#ff5d5d' : tn > 0.45 ? '#f9c74f' : '#9ad1ff', 'LINE');
}
