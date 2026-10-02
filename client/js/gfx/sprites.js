// Scenery sprites (trees, bushes, rocks, flowers, lily pads), drawn once into
// small offscreen canvases and stamped onto the terrain.
//
// Each sprite is { canvas, w, h } where w/h are in world units and the sprite
// is centred on the point it is drawn at. To use painted art later, replace a
// factory below with one that loads an image; nothing else needs to change.

import { seeded } from './noise.js';

const PX = 2.5; // sprite pixels per world unit (sharp at normal zoom levels)

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.ceil(w * PX);
  c.height = Math.ceil(h * PX);
  const g = c.getContext('2d');
  g.scale(PX, PX);
  return { c, g };
}

function softShadow(g, x, y, rx, ry, alpha) {
  const grad = g.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry));
  grad.addColorStop(0, `rgba(0,0,0,${alpha})`);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.save();
  g.translate(x, y);
  g.scale(1, ry / rx);
  g.translate(-x, -y);
  g.fillStyle = grad;
  g.beginPath();
  g.arc(x, y, rx, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

function blob(g, x, y, r, inner, outer) {
  const grad = g.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  grad.addColorStop(0, inner);
  grad.addColorStop(1, outer);
  g.fillStyle = grad;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
}

// ---- trees ------------------------------------------------------------------------

function leafyTree(seed, palette) {
  const rnd = seeded(seed);
  const R = 18 + rnd() * 8;
  const size = R * 2 + 24;
  const { c, g } = makeCanvas(size, size);
  const cx = size / 2 - 4;
  const cy = size / 2 - 4;
  softShadow(g, cx + R * 0.35, cy + R * 0.45, R * 1.05, R * 0.85, 0.35);
  // Canopy: overlapping lobes, darker underneath, lit from the top-left.
  const lobes = 7 + Math.floor(rnd() * 3);
  for (let i = 0; i < lobes; i++) {
    const a = (i / lobes) * Math.PI * 2 + rnd() * 0.4;
    const d = R * (0.45 + rnd() * 0.15);
    blob(g, cx + Math.cos(a) * d, cy + Math.sin(a) * d, R * (0.48 + rnd() * 0.12), palette[1], palette[2]);
  }
  blob(g, cx, cy, R * 0.62, palette[0], palette[1]);
  // Small highlight clusters.
  g.globalAlpha = 0.35;
  for (let i = 0; i < 5; i++) {
    blob(g, cx - R * 0.3 + rnd() * R * 0.5, cy - R * 0.35 + rnd() * R * 0.4, R * 0.18, palette[3], palette[0]);
  }
  g.globalAlpha = 1;
  return { canvas: c, w: size, h: size };
}

function pineTree(seed) {
  const rnd = seeded(seed);
  const R = 16 + rnd() * 7;
  const size = R * 2 + 22;
  const { c, g } = makeCanvas(size, size);
  const cx = size / 2 - 3;
  const cy = size / 2 - 3;
  softShadow(g, cx + R * 0.4, cy + R * 0.5, R * 1.0, R * 0.8, 0.38);
  // Seen from above: stacked star-shaped tiers of needles, darkest at the bottom.
  const tiers = [['#1f3d2a', 1], ['#2b5236', 0.78], ['#386a43', 0.56], ['#4c8452', 0.34]];
  for (const [color, scale] of tiers) {
    const points = 9;
    const r = R * scale;
    g.fillStyle = color;
    g.beginPath();
    for (let i = 0; i <= points * 2; i++) {
      const a = (i / (points * 2)) * Math.PI * 2 + rnd() * 0.05;
      const rr = i % 2 === 0 ? r : r * 0.62;
      g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    g.closePath();
    g.fill();
  }
  g.fillStyle = '#6aa35f';
  g.beginPath();
  g.arc(cx - 1, cy - 1, R * 0.12, 0, Math.PI * 2);
  g.fill();
  return { canvas: c, w: size, h: size };
}

function bush(seed) {
  const rnd = seeded(seed);
  const R = 7 + rnd() * 4;
  const size = R * 2 + 12;
  const { c, g } = makeCanvas(size, size);
  const cx = size / 2 - 2;
  const cy = size / 2 - 2;
  softShadow(g, cx + R * 0.3, cy + R * 0.4, R * 1.1, R * 0.8, 0.3);
  for (let i = 0; i < 5; i++) {
    const a = rnd() * Math.PI * 2;
    blob(g, cx + Math.cos(a) * R * 0.4, cy + Math.sin(a) * R * 0.4, R * 0.6, '#7fb35a', '#3f6e2e');
  }
  if (rnd() < 0.4) {
    g.fillStyle = rnd() < 0.5 ? '#d1495b' : '#f4f1de';
    for (let i = 0; i < 6; i++) {
      g.beginPath();
      g.arc(cx + (rnd() - 0.5) * R * 1.3, cy + (rnd() - 0.5) * R * 1.3, 0.9, 0, Math.PI * 2);
      g.fill();
    }
  }
  return { canvas: c, w: size, h: size };
}

// ---- ground details ----------------------------------------------------------------

function boulder(seed, small = false) {
  const rnd = seeded(seed);
  const R = small ? 3 + rnd() * 3 : 8 + rnd() * 9;
  const size = R * 2 + 10;
  const { c, g } = makeCanvas(size, size);
  const cx = size / 2 - 2;
  const cy = size / 2 - 2;
  softShadow(g, cx + R * 0.3, cy + R * 0.35, R * 1.1, R * 0.85, 0.35);
  const verts = 9;
  const pts = [];
  for (let i = 0; i < verts; i++) {
    const a = (i / verts) * Math.PI * 2;
    const r = R * (0.75 + rnd() * 0.3);
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.85]);
  }
  const grad = g.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
  grad.addColorStop(0, '#b8bcc4');
  grad.addColorStop(0.55, '#8b8f97');
  grad.addColorStop(1, '#5e626a');
  g.fillStyle = grad;
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.closePath();
  g.fill();
  g.strokeStyle = 'rgba(40,42,48,0.5)';
  g.lineWidth = 0.6;
  g.stroke();
  if (!small && rnd() < 0.6) {
    g.fillStyle = 'rgba(110,150,70,0.55)'; // moss
    g.beginPath();
    g.arc(cx - R * 0.2, cy - R * 0.3, R * 0.35, 0, Math.PI * 2);
    g.fill();
  }
  return { canvas: c, w: size, h: size };
}

function flowers(seed) {
  const rnd = seeded(seed);
  const size = 16;
  const { c, g } = makeCanvas(size, size);
  const colors = ['#f4f1de', '#ffd166', '#c77dff', '#ff8fab', '#90e0ef'];
  const color = colors[Math.floor(rnd() * colors.length)];
  for (let i = 0; i < 6; i++) {
    const x = 3 + rnd() * 10;
    const y = 3 + rnd() * 10;
    g.fillStyle = color;
    for (let p = 0; p < 5; p++) {
      const a = (p / 5) * Math.PI * 2;
      g.beginPath();
      g.arc(x + Math.cos(a) * 0.9, y + Math.sin(a) * 0.9, 0.75, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#f9c74f';
    g.beginPath();
    g.arc(x, y, 0.5, 0, Math.PI * 2);
    g.fill();
  }
  return { canvas: c, w: size, h: size };
}

function grassTuft(seed) {
  const rnd = seeded(seed);
  const size = 12;
  const { c, g } = makeCanvas(size, size);
  g.strokeStyle = rnd() < 0.5 ? '#3d6b2c' : '#5b8f3e';
  g.lineWidth = 0.7;
  g.lineCap = 'round';
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI / 2 + (rnd() - 0.5) * 1.6;
    const l = 3 + rnd() * 3;
    g.beginPath();
    g.moveTo(6, 8);
    g.quadraticCurveTo(6 + Math.cos(a) * l * 0.5 + 0.8, 8 + Math.sin(a) * l * 0.5, 6 + Math.cos(a) * l, 8 + Math.sin(a) * l);
    g.stroke();
  }
  return { canvas: c, w: size, h: size };
}

function pebbles(seed) {
  const rnd = seeded(seed);
  const size = 14;
  const { c, g } = makeCanvas(size, size);
  for (let i = 0; i < 4; i++) {
    const shade = 150 + Math.floor(rnd() * 60);
    g.fillStyle = `rgb(${shade},${shade - 8},${shade - 20})`;
    g.beginPath();
    g.ellipse(3 + rnd() * 8, 3 + rnd() * 8, 0.8 + rnd() * 1.2, 0.6 + rnd() * 0.9, rnd() * 3, 0, Math.PI * 2);
    g.fill();
  }
  return { canvas: c, w: size, h: size };
}

function driftwood(seed) {
  const rnd = seeded(seed);
  const size = 34;
  const { c, g } = makeCanvas(size, size);
  g.translate(size / 2, size / 2);
  g.rotate(rnd() * Math.PI);
  g.fillStyle = 'rgba(0,0,0,0.2)';
  g.fillRect(-12, -1.5, 25, 5);
  g.fillStyle = '#b39c7d';
  g.beginPath();
  g.roundRect(-13, -3, 25, 5, 2.5);
  g.fill();
  g.strokeStyle = '#8a7558';
  g.lineWidth = 0.5;
  g.beginPath();
  g.moveTo(-11, -1);
  g.lineTo(10, -0.5);
  g.moveTo(-9, 1);
  g.lineTo(8, 1.2);
  g.stroke();
  return { canvas: c, w: size, h: size };
}

function lilyPad(seed) {
  const rnd = seeded(seed);
  const r = 5 + rnd() * 5;
  const size = r * 2 + 6;
  const { c, g } = makeCanvas(size, size);
  const cx = size / 2;
  const cy = size / 2;
  const rot = rnd() * Math.PI * 2;
  g.fillStyle = 'rgba(0,30,20,0.25)';
  g.beginPath();
  g.arc(cx + 1, cy + 1.2, r, 0, Math.PI * 2);
  g.fill();
  const grad = g.createRadialGradient(cx - r * 0.3, cy - r * 0.3, 1, cx, cy, r);
  grad.addColorStop(0, '#7dbb5a');
  grad.addColorStop(1, '#3e7a35');
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(cx, cy);
  g.arc(cx, cy, r, rot + 0.25, rot + Math.PI * 2 - 0.25);
  g.closePath();
  g.fill();
  g.strokeStyle = 'rgba(30,70,30,0.5)';
  g.lineWidth = 0.4;
  for (let i = 0; i < 6; i++) {
    const a = rot + 0.6 + (i / 6) * Math.PI * 1.7;
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(cx + Math.cos(a) * r * 0.9, cy + Math.sin(a) * r * 0.9);
    g.stroke();
  }
  if (rnd() < 0.2) {
    const petal = rnd() < 0.5 ? '#ffd6e5' : '#ffffff';
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      g.fillStyle = petal;
      g.beginPath();
      g.ellipse(cx + Math.cos(a) * 1.6, cy + Math.sin(a) * 1.6, 1.6, 0.8, a, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#ffd166';
    g.beginPath();
    g.arc(cx, cy, 0.9, 0, Math.PI * 2);
    g.fill();
  }
  return { canvas: c, w: size, h: size };
}

// ---- variant pools -----------------------------------------------------------------

const LEAF_PALETTES = [
  ['#7fb35a', '#4f8a3a', '#2c5a25', '#b5d98a'],
  ['#8fbf5f', '#5a9440', '#30602a', '#c7e39a'],
  ['#6aa34f', '#3f7a33', '#244d22', '#a7d07f'],
];

let pools = null;

/** Lazily built pools of sprite variants, keyed by kind. */
export function spritePools() {
  if (pools) return pools;
  const range = (n, f) => Array.from({ length: n }, (_, i) => f(i));
  pools = {
    tree: range(6, (i) => leafyTree(100 + i, LEAF_PALETTES[i % LEAF_PALETTES.length])),
    pine: range(4, (i) => pineTree(200 + i)),
    bush: range(4, (i) => bush(300 + i)),
    boulder: range(4, (i) => boulder(400 + i)),
    stone: range(4, (i) => boulder(450 + i, true)),
    flowers: range(5, (i) => flowers(500 + i)),
    tuft: range(4, (i) => grassTuft(600 + i)),
    pebbles: range(3, (i) => pebbles(700 + i)),
    driftwood: range(2, (i) => driftwood(800 + i)),
    lily: range(6, (i) => lilyPad(900 + i)),
  };
  return pools;
}

/** Draw a sprite centred at (x, y) in world units on a context already in world space. */
export function stamp(g, sprite, x, y, scale = 1) {
  g.drawImage(sprite.canvas, x - (sprite.w * scale) / 2, y - (sprite.h * scale) / 2, sprite.w * scale, sprite.h * scale);
}
