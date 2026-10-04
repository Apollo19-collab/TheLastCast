// How each tackle item looks: on the angler in the world and as shop icons.
// Keyed by item id (see shared/gear.js). Unknown ids fall back to the starter look.

import { ITEMS, STARTER } from '/shared/gear.js';

export const ROD_LOOK = {
  willow: { color: '#8b5a2b', tip: '#c49a6c', length: 26, width: 2.6 },
  fiberglass: { color: '#e9c46a', tip: '#f4e1a0', length: 29, width: 2.4, wraps: '#2a9d8f' },
  ultralight: { color: '#90e0ef', tip: '#caf0f8', length: 24, width: 1.8, wraps: '#0077b6' },
  carbon: { color: '#2b2d42', tip: '#555b6e', length: 32, width: 2.2, wraps: '#e63946' },
  surfcaster: { color: '#f4a261', tip: '#ffe8d6', length: 40, width: 2.4, wraps: '#264653' },
  flyrod: { color: '#6b705c', tip: '#a5a58d', length: 34, width: 1.7, wraps: '#ffe8a3' },
  muskyrod: { color: '#1b4332', tip: '#40916c', length: 31, width: 3.2, wraps: '#ffb703' },
  master: { color: '#f1f1f1', tip: '#ffffff', length: 35, width: 2.2, wraps: '#d4af37', glow: '#ffe8a3' },
  sturgeonpole: { color: '#4a2c17', tip: '#7f5539', length: 33, width: 3.8, wraps: '#d4a373' },
  deepsea: { color: '#023e8a', tip: '#90e0ef', length: 30, width: 3.4, wraps: '#ffffff' },
  legendrod: { color: '#3c096c', tip: '#c77dff', length: 37, width: 2.4, wraps: '#ffd166', glow: '#c77dff' },
  bamboo: { color: '#d4a373', tip: '#e9c46a', length: 31, width: 2.4, wraps: '#6a040f' },
  abyssrod: { color: '#0b2545', tip: '#7df9ff', length: 34, width: 3.4, wraps: '#e63946', glow: '#7df9ff' },
  starrod: { color: '#240046', tip: '#ff9ef0', length: 38, width: 2.6, wraps: '#ffd166', glow: '#ff5ce1' },
  reedwhisper: { color: '#a3b18a', tip: '#dad7cd', length: 30, width: 1.8, wraps: '#2a9d8f' },
  glassfeather: { color: '#caf0f8', tip: '#ffffff', length: 31, width: 1.7, wraps: '#48cae4' },
  dropshot: { color: '#344e41', tip: '#a3b18a', length: 30, width: 2.1, wraps: '#ffd166' },
  silkstream: { color: '#588157', tip: '#e9f5db', length: 35, width: 1.6, wraps: '#f4a261' },
  ironwood: { color: '#3d2b1f', tip: '#6f4e37', length: 32, width: 3.4, wraps: '#adb5bd' },
  silverheavy: { color: '#ced4da', tip: '#f8f9fa', length: 33, width: 3.4, wraps: '#3a4a6b' },
  leviathanpole: { color: '#14213d', tip: '#4cc9f0', length: 34, width: 4, wraps: '#e5e5e5' },
  titanrod: { color: '#495057', tip: '#dee2e6', length: 35, width: 4.2, wraps: '#ffba08', glow: '#dee2e6' },
  emberwood: { color: '#7f1d1d', tip: '#f97316', length: 36, width: 2.6, wraps: '#fde68a', glow: '#f97316' },
  runecarved: { color: '#1f2937', tip: '#a78bfa', length: 37, width: 2.7, wraps: '#a78bfa', glow: '#a78bfa' },
  moonlit: { color: '#cbd5e1', tip: '#ffffff', length: 37, width: 2.4, wraps: '#93c5fd', glow: '#e0f2fe' },
  phoenixrod: { color: '#b91c1c', tip: '#fde047', length: 39, width: 2.8, wraps: '#fb923c', glow: '#fb923c' },
};

export const REEL_LOOK = {
  rusty: { body: '#8d5b3a', rim: '#5a3a22' },
  spinning: { body: '#c0c7cf', rim: '#7d8790' },
  baitcaster: { body: '#1f1f1f', rim: '#d4af37' },
  smoothdrag: { body: '#2a9d8f', rim: '#e9f5db' },
  tournament: { body: '#4cc9f0', rim: '#e0fbfc' },
  centerpin: { body: '#bc6c25', rim: '#fefae0', big: true },
  biggame: { body: '#9d0208', rim: '#ffba08', big: true },
  golden: { body: '#ffd166', rim: '#fff3b0', glow: '#ffe8a3' },
  levelwind: { body: '#6c757d', rim: '#ced4da', big: true },
  stormreel: { body: '#3a4a6b', rim: '#4cc9f0', glow: '#4cc9f0', big: true },
  starreel: { body: '#7209b7', rim: '#ff9ef0', glow: '#ff5ce1' },
  featherreel: { body: '#e9f5db', rim: '#2a9d8f' },
  finessereel: { body: '#90e0ef', rim: '#0077b6' },
  whisperreel: { body: '#dad7cd', rim: '#588157' },
  winchreel: { body: '#343a40', rim: '#adb5bd', big: true },
  trollingreel: { body: '#3a4a6b', rim: '#ced4da', big: true },
  titanreel: { body: '#495057', rim: '#ffba08', glow: '#dee2e6', big: true },
  emberreel: { body: '#9a3412', rim: '#fdba74', glow: '#f97316' },
  runicreel: { body: '#312e81', rim: '#a78bfa', glow: '#a78bfa' },
  phoenixreel: { body: '#dc2626', rim: '#fde047', glow: '#fb923c', big: true },
};

export const LINE_LOOK = {
  mono: { color: 'rgba(245,240,225,0.75)', width: 0.8 },
  freshmono: { color: 'rgba(255,255,255,0.8)', width: 0.8 },
  fluoro: { color: 'rgba(200,235,255,0.45)', width: 0.7 },
  braid: { color: 'rgba(110,170,80,0.9)', width: 1.1 },
  stealth: { color: 'rgba(255,255,255,0.25)', width: 0.6 },
  steel: { color: 'rgba(170,180,190,0.95)', width: 1.1 },
  spectral: { color: 'rgba(170,240,255,0.85)', width: 1, glow: '#bde0fe' },
  copoly: { color: 'rgba(120,200,180,0.75)', width: 0.9 },
  kevlar: { color: 'rgba(255,214,10,0.9)', width: 1.2 },
  starline: { color: 'rgba(255,158,240,0.85)', width: 1, glow: '#ff5ce1' },
  ghostfluoro: { color: 'rgba(230,245,255,0.3)', width: 0.6 },
  microbraid: { color: 'rgba(80,140,110,0.85)', width: 0.8 },
  mirageline: { color: 'rgba(200,220,255,0.35)', width: 0.7, glow: '#e0f2fe' },
  wirecore: { color: 'rgba(140,150,160,0.95)', width: 1.2 },
  dyneema: { color: 'rgba(240,240,240,0.95)', width: 1.2 },
  titancable: { color: 'rgba(255,186,8,0.95)', width: 1.5 },
  emberthread: { color: 'rgba(249,115,22,0.85)', width: 1, glow: '#f97316' },
  runespun: { color: 'rgba(167,139,250,0.85)', width: 1, glow: '#a78bfa' },
  phoenixsilk: { color: 'rgba(253,224,71,0.9)', width: 1.1, glow: '#fb923c' },
};

// kind: 'float' shows a bobber; 'lure' shows the lure itself on the line.
export const BAIT_LOOK = {
  bread: { kind: 'float', top: '#e63946', bottom: '#f1faee', icon: 'bread' },
  worms: { kind: 'float', top: '#2a9d8f', bottom: '#f1faee', icon: 'worms' },
  corn: { kind: 'float', top: '#ffd60a', bottom: '#f1faee', icon: 'corn' },
  nightcrawler: { kind: 'float', top: '#6a040f', bottom: '#f1faee', icon: 'nightcrawler' },
  spinner: { kind: 'lure', top: '#c0c7cf', bottom: '#8d99ae', icon: 'spinner' },
  roe: { kind: 'float', top: '#f77f00', bottom: '#fcbf49', icon: 'roe' },
  frog: { kind: 'lure', top: '#70e000', bottom: '#38b000', icon: 'frog' },
  goldlure: { kind: 'lure', top: '#ffd166', bottom: '#d4af37', glow: '#ffe8a3', icon: 'goldlure' },
  minnow: { kind: 'float', top: '#adb5bd', bottom: '#f8f9fa', icon: 'minnow' },
  glowjig: { kind: 'lure', top: '#b9fbc0', bottom: '#38b000', glow: '#b9fbc0', icon: 'glowjig' },
  squid: { kind: 'float', top: '#ff9f1c', bottom: '#f1faee', icon: 'squid' },
  mythicfly: { kind: 'lure', top: '#e0aaff', bottom: '#7b2cbf', glow: '#e0aaff', icon: 'mythicfly' },
  leech: { kind: 'float', top: '#344e41', bottom: '#f1faee', icon: 'leech' },
  crayfish: { kind: 'lure', top: '#bc4749', bottom: '#6a040f', icon: 'crayfish' },
  stardust: { kind: 'lure', top: '#ff9ef0', bottom: '#3c096c', glow: '#ff5ce1', icon: 'stardust' },
  waxworms: { kind: 'float', top: '#e9f5db', bottom: '#f1faee', icon: 'worms' },
  microjig: { kind: 'lure', top: '#ffd166', bottom: '#2a9d8f', icon: 'spinner' },
  cutbait: { kind: 'float', top: '#9d0208', bottom: '#f1faee', icon: 'squid' },
  liveshad: { kind: 'float', top: '#ced4da', bottom: '#f8f9fa', icon: 'minnow' },
  embergrubs: { kind: 'lure', top: '#f97316', bottom: '#7f1d1d', glow: '#fdba74', icon: 'leech' },
  moonbait: { kind: 'lure', top: '#e0f2fe', bottom: '#64748b', glow: '#e0f2fe', icon: 'glowjig' },
};

const TABLES = { rod: ROD_LOOK, reel: REEL_LOOK, line: LINE_LOOK, bait: BAIT_LOOK };

export function lookOf(slot, id) {
  const t = TABLES[slot];
  return t[id] || t[STARTER[slot]];
}

// ---- shop icons (64x64 logical, drawn at 2x) -----------------------------------------

const iconCache = new Map();

/** Data URL of an item's icon. */
export function gearIconURL(itemId) {
  if (!iconCache.has(itemId)) {
    const it = ITEMS[itemId];
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    g.scale(2, 2);
    g.lineCap = 'round';
    g.lineJoin = 'round';
    const slot = it?.slot || 'bait';
    ({ rod: rodIcon, reel: reelIcon, line: lineIcon, bait: baitIcon })[slot](g, itemId);
    iconCache.set(itemId, c.toDataURL());
  }
  return iconCache.get(itemId);
}

function rodIcon(g, id) {
  const L = lookOf('rod', id);
  const scale = L.length / 35;
  if (L.glow) {
    g.shadowColor = L.glow;
    g.shadowBlur = 8;
  }
  const tipX = 14 + 44 * scale;
  const tipY = 50 - 44 * scale;
  g.strokeStyle = '#3b2a1a';
  g.lineWidth = 6;
  g.beginPath();
  g.moveTo(8, 56);
  g.lineTo(18, 46);
  g.stroke();
  g.strokeStyle = L.color;
  g.lineWidth = L.width * 1.3;
  g.beginPath();
  g.moveTo(16, 48);
  g.quadraticCurveTo((16 + tipX) / 2 + 2, (48 + tipY) / 2 - 2, tipX, tipY);
  g.stroke();
  g.shadowBlur = 0;
  if (L.wraps) {
    g.fillStyle = L.wraps;
    for (const t of [0.3, 0.55, 0.78]) {
      g.beginPath();
      g.arc(16 + (tipX - 16) * t, 48 + (tipY - 48) * t, 1.8, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.strokeStyle = 'rgba(255,255,255,0.7)';
  g.lineWidth = 0.8;
  g.beginPath();
  g.moveTo(tipX, tipY);
  g.quadraticCurveTo(tipX + 2, tipY + 24, tipX - 4, tipY + 34);
  g.stroke();
  g.fillStyle = '#c0c7cf';
  g.strokeStyle = '#7d8790';
  g.lineWidth = 1.5;
  g.beginPath();
  g.arc(22, 46, 5, 0, Math.PI * 2);
  g.fill();
  g.stroke();
}

function reelIcon(g, id) {
  const R = lookOf('reel', id);
  const cx = 30;
  const cy = 32;
  const r = R.big ? 21 : 18;
  if (R.glow) {
    g.shadowColor = R.glow;
    g.shadowBlur = 10;
  }
  const grad = g.createRadialGradient(cx - 6, cy - 6, 2, cx, cy, r + 2);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.25, R.body);
  grad.addColorStop(1, R.rim);
  g.fillStyle = grad;
  g.strokeStyle = R.rim;
  g.lineWidth = 2.5;
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.shadowBlur = 0;
  g.fillStyle = '#e9edf0';
  g.beginPath();
  g.arc(cx, cy, r * 0.5, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.15)';
  g.lineWidth = 0.6;
  for (let rr = 4; rr < r * 0.5; rr += 1.5) {
    g.beginPath();
    g.arc(cx, cy, rr, 0, Math.PI * 2);
    g.stroke();
  }
  g.fillStyle = R.rim;
  g.beginPath();
  g.arc(cx, cy, 2.5, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = R.rim;
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(cx, cy);
  g.lineTo(cx + 22, cy - 12);
  g.stroke();
  g.fillStyle = '#3b2a1a';
  g.beginPath();
  g.ellipse(cx + 24, cy - 13, 4, 6, -0.5, 0, Math.PI * 2);
  g.fill();
}

function lineIcon(g, id) {
  const L = lookOf('line', id);
  // A spool with line wound on it, and a loose end.
  g.fillStyle = '#495057';
  g.fillRect(12, 18, 6, 30);
  g.fillRect(46, 18, 6, 30);
  if (L.glow) {
    g.shadowColor = L.glow;
    g.shadowBlur = 8;
  }
  const solid = L.color.replace(/[\d.]+\)$/, '1)');
  g.fillStyle = solid;
  g.fillRect(18, 21, 28, 24);
  g.shadowBlur = 0;
  g.strokeStyle = 'rgba(0,0,0,0.18)';
  g.lineWidth = 0.7;
  for (let y = 23; y < 45; y += 2.5) {
    g.beginPath();
    g.moveTo(18, y);
    g.lineTo(46, y + 1);
    g.stroke();
  }
  g.strokeStyle = solid;
  g.lineWidth = 1.4;
  g.beginPath();
  g.moveTo(46, 30);
  g.bezierCurveTo(56, 34, 50, 52, 58, 58);
  g.stroke();
  if (id === 'steel') {
    g.fillStyle = '#adb5bd';
    g.fillRect(55, 55, 5, 5);
  }
}

function baitIcon(g, id) {
  const B = lookOf('bait', id);
  const draw = BAIT_ICONS[B.icon] || BAIT_ICONS.bread;
  if (B.glow) {
    g.shadowColor = B.glow;
    g.shadowBlur = 10;
  }
  draw(g, B);
  g.shadowBlur = 0;
}

function hook(g, x, y) {
  g.strokeStyle = '#495057';
  g.lineWidth = 1.4;
  g.beginPath();
  g.moveTo(x, y);
  g.lineTo(x, y + 10);
  g.arc(x - 3, y + 10, 3, 0, Math.PI);
  g.stroke();
}

function blob(g, x, y, r, inner, outer, sx = 1) {
  const grad = g.createRadialGradient(x - r * 0.3, y - r * 0.3, 1, x, y, r);
  grad.addColorStop(0, inner);
  grad.addColorStop(1, outer);
  g.fillStyle = grad;
  g.beginPath();
  g.ellipse(x, y, r * sx, r, 0, 0, Math.PI * 2);
  g.fill();
}

function worm(g, color, y, phase, width = 5) {
  g.strokeStyle = color;
  g.lineWidth = width;
  g.beginPath();
  for (let x = 10; x <= 54; x += 2) g.lineTo(x, y + Math.sin(x * 0.2 + phase) * 5);
  g.stroke();
}

const BAIT_ICONS = {
  bread(g) {
    for (const [x, y, r] of [[22, 34, 9], [38, 28, 7], [36, 44, 8], [48, 40, 5]]) blob(g, x, y, r, '#f6e7c1', '#c99a5b', 1.2);
  },
  worms(g) {
    worm(g, '#d97c8a', 26, 0);
    worm(g, '#d97c8a', 40, 1.5);
  },
  nightcrawler(g) {
    worm(g, '#7a2e3a', 30, 0.8, 7);
    worm(g, '#9d4452', 44, 2.2, 6);
  },
  corn(g) {
    for (let i = 0; i < 9; i++) {
      const x = 16 + (i % 3) * 13 + (Math.floor(i / 3) % 2) * 6;
      const y = 20 + Math.floor(i / 3) * 12;
      blob(g, x, y, 5.5, '#fff3b0', '#e9b600', 0.85);
    }
  },
  roe(g) {
    for (let i = 0; i < 11; i++) {
      const a = i * 2.4;
      const d = 4 + (i % 4) * 4;
      blob(g, 32 + Math.cos(a) * d, 32 + Math.sin(a) * d, 5, '#ffd6a5', '#f77f00');
    }
  },
  minnow(g) {
    blob(g, 30, 32, 9, '#f8f9fa', '#8d99ae', 2.2);
    g.fillStyle = '#8d99ae';
    g.beginPath();
    g.moveTo(10, 32);
    g.lineTo(2, 24);
    g.lineTo(2, 40);
    g.fill();
    g.fillStyle = '#111';
    g.beginPath();
    g.arc(44, 30, 1.8, 0, Math.PI * 2);
    g.fill();
    hook(g, 34, 40);
  },
  spinner(g, B) {
    blob(g, 28, 30, 8, '#ffffff', B.bottom, 1.8);
    g.strokeStyle = '#6c757d';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(10, 46);
    g.lineTo(52, 22);
    g.stroke();
    hook(g, 44, 42);
  },
  goldlure(g, B) {
    const grad = g.createLinearGradient(12, 20, 56, 44);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.4, B.top);
    grad.addColorStop(1, B.bottom);
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(12, 32);
    g.quadraticCurveTo(28, 16, 46, 30);
    g.lineTo(56, 22);
    g.lineTo(54, 40);
    g.lineTo(46, 34);
    g.quadraticCurveTo(28, 48, 12, 32);
    g.fill();
    g.fillStyle = '#111';
    g.beginPath();
    g.arc(19, 30, 1.8, 0, Math.PI * 2);
    g.fill();
    hook(g, 40, 42);
  },
  frog(g, B) {
    blob(g, 32, 32, 13, B.top, B.bottom, 1.1);
    g.fillStyle = B.bottom;
    for (const [x, y] of [[16, 46], [48, 46], [18, 20], [46, 20]]) {
      g.beginPath();
      g.ellipse(x, y, 6, 3, x < 32 ? 0.6 : -0.6, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#fff';
    for (const x of [26, 38]) {
      g.beginPath();
      g.arc(x, 24, 3.5, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#111';
    for (const x of [26, 38]) {
      g.beginPath();
      g.arc(x, 24, 1.6, 0, Math.PI * 2);
      g.fill();
    }
  },
  glowjig(g, B) {
    blob(g, 24, 26, 9, '#ffffff', B.top);
    g.strokeStyle = B.bottom;
    g.lineWidth = 2;
    for (let i = -3; i <= 3; i++) {
      g.beginPath();
      g.moveTo(28, 30);
      g.quadraticCurveTo(40, 36 + i * 3, 56, 40 + i * 4);
      g.stroke();
    }
    hook(g, 24, 32);
  },
  squid(g) {
    // A pale strip of squid with a few tentacle ends.
    blob(g, 30, 26, 10, '#fff1e6', '#f4a7a0', 1.6);
    g.strokeStyle = '#f4a7a0';
    g.lineWidth = 3;
    for (let i = 0; i < 4; i++) {
      g.beginPath();
      g.moveTo(22 + i * 5, 32);
      g.quadraticCurveTo(18 + i * 6, 44, 24 + i * 6, 52);
      g.stroke();
    }
    hook(g, 40, 34);
  },
  leech(g) {
    worm(g, '#4f6b50', 30, 0.3, 8);
    worm(g, '#65806a', 44, 1.9, 7);
  },
  crayfish(g, B) {
    // Body, tail fan and two big claws.
    blob(g, 30, 34, 9, B.top, B.bottom, 1.7);
    g.fillStyle = B.bottom;
    g.beginPath();
    g.moveTo(14, 34);
    g.lineTo(4, 26);
    g.lineTo(4, 42);
    g.fill();
    for (const s of [-1, 1]) {
      blob(g, 52, 34 + s * 10, 5, B.top, B.bottom, 1.4);
      g.strokeStyle = B.bottom;
      g.lineWidth = 2.5;
      g.beginPath();
      g.moveTo(42, 34 + s * 3);
      g.lineTo(48, 34 + s * 9);
      g.stroke();
    }
  },
  stardust(g, B) {
    // A star-shaped spoon with a trail of sparkles.
    g.fillStyle = B.top;
    g.beginPath();
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2 - Math.PI / 2;
      const r = k % 2 ? 6 : 15;
      g.lineTo(28 + Math.cos(a) * r, 28 + Math.sin(a) * r);
    }
    g.fill();
    g.fillStyle = '#ffffff';
    for (const [x, y, r] of [[48, 18, 2.2], [54, 30, 1.6], [46, 44, 2], [12, 48, 1.5]]) {
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
    hook(g, 28, 40);
  },
  mythicfly(g, B) {
    g.fillStyle = B.bottom;
    g.beginPath();
    g.ellipse(32, 36, 5, 12, 0, 0, Math.PI * 2);
    g.fill();
    for (const [a, c] of [[-0.9, B.top], [0.9, B.top], [-0.5, '#ffd166'], [0.5, '#ffd166']]) {
      g.save();
      g.translate(32, 28);
      g.rotate(a);
      g.fillStyle = c;
      g.beginPath();
      g.ellipse(0, -12, 4, 13, 0, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
    hook(g, 32, 46);
  },
};
