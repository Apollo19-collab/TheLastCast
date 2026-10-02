// How each gear tier looks: on the angler in the world and as shop icons.
// Tier order matches shared/gear.js.

export const ROD_LOOK = [
  { color: '#8b5a2b', tip: '#c49a6c', length: 26, width: 2.6 }, // Willow Rod
  { color: '#e9c46a', tip: '#f4e1a0', length: 29, width: 2.4, wraps: '#2a9d8f' }, // Fiberglass
  { color: '#2b2d42', tip: '#555b6e', length: 32, width: 2.2, wraps: '#e63946' }, // Carbon
  { color: '#f1f1f1', tip: '#ffffff', length: 35, width: 2.2, wraps: '#d4af37', glow: '#ffe8a3' }, // Master's
];

export const REEL_LOOK = [
  { body: '#8d5b3a', rim: '#5a3a22' }, // Rusty
  { body: '#c0c7cf', rim: '#7d8790' }, // Spinning
  { body: '#1f1f1f', rim: '#d4af37' }, // Baitcaster
  { body: '#4cc9f0', rim: '#e0fbfc' }, // Tournament
];

export const BAIT_LOOK = [
  { top: '#e63946', bottom: '#f1faee' }, // Bread crumbs: classic bobber
  { top: '#2a9d8f', bottom: '#f1faee' }, // Earthworms
  { top: '#c0c7cf', bottom: '#8d99ae', lure: true }, // Spinner
  { top: '#ffd166', bottom: '#d4af37', lure: true, glow: '#ffe8a3' }, // Golden lure
];

export const look = (table, tier) => table[Math.max(0, Math.min(table.length - 1, tier | 0))];

// ---- shop icons (64x64, drawn at 2x) ------------------------------------------------

const iconCache = new Map();

/** Data URL of the icon for a gear slot and tier. */
export function gearIconURL(slot, tier) {
  const key = `${slot}|${tier}`;
  if (!iconCache.has(key)) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    g.scale(2, 2);
    g.lineCap = 'round';
    g.lineJoin = 'round';
    ({ rod: rodIcon, reel: reelIcon, bait: baitIcon })[slot](g, tier);
    iconCache.set(key, c.toDataURL());
  }
  return iconCache.get(key);
}

function rodIcon(g, tier) {
  const L = look(ROD_LOOK, tier);
  const R = look(REEL_LOOK, tier);
  if (L.glow) {
    g.shadowColor = L.glow;
    g.shadowBlur = 8;
  }
  // Rod: thick handle bottom-left, tapering to the tip top-right.
  g.strokeStyle = '#3b2a1a';
  g.lineWidth = 6;
  g.beginPath();
  g.moveTo(8, 56);
  g.lineTo(18, 46);
  g.stroke();
  g.strokeStyle = L.color;
  g.lineWidth = 3.2;
  g.beginPath();
  g.moveTo(16, 48);
  g.quadraticCurveTo(38, 30, 58, 6);
  g.stroke();
  g.shadowBlur = 0;
  if (L.wraps) {
    g.strokeStyle = L.wraps;
    g.lineWidth = 4;
    for (const t of [0.3, 0.55, 0.78]) {
      const x = 16 + (58 - 16) * t;
      const y = 48 + (6 - 48) * t + Math.sin(t * Math.PI) * -4;
      g.beginPath();
      g.moveTo(x - 1, y + 1);
      g.lineTo(x + 1, y - 1);
      g.stroke();
    }
  }
  // Line hanging from the tip.
  g.strokeStyle = 'rgba(255,255,255,0.7)';
  g.lineWidth = 0.8;
  g.beginPath();
  g.moveTo(58, 6);
  g.quadraticCurveTo(60, 30, 54, 40);
  g.stroke();
  // Reel on the handle.
  g.fillStyle = R.body;
  g.strokeStyle = R.rim;
  g.lineWidth = 1.5;
  g.beginPath();
  g.arc(22, 46, 5, 0, Math.PI * 2);
  g.fill();
  g.stroke();
}

function reelIcon(g, tier) {
  const R = look(REEL_LOOK, tier);
  const cx = 30;
  const cy = 32;
  const grad = g.createRadialGradient(cx - 6, cy - 6, 2, cx, cy, 20);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.25, R.body);
  grad.addColorStop(1, R.rim);
  g.fillStyle = grad;
  g.strokeStyle = R.rim;
  g.lineWidth = 2.5;
  g.beginPath();
  g.arc(cx, cy, 18, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  // Spool of line.
  g.fillStyle = '#e9edf0';
  g.beginPath();
  g.arc(cx, cy, 9, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.15)';
  g.lineWidth = 0.6;
  for (let r = 4; r < 9; r += 1.5) {
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.stroke();
  }
  g.fillStyle = R.rim;
  g.beginPath();
  g.arc(cx, cy, 2.5, 0, Math.PI * 2);
  g.fill();
  // Handle.
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
  if (tier >= 3) {
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(cx - 8, cy - 10, 2, 0, Math.PI * 2);
    g.fill();
  }
}

function baitIcon(g, tier) {
  if (tier === 0) {
    // Bread crumbs.
    for (const [x, y, r] of [[22, 34, 9], [38, 28, 7], [36, 44, 8], [48, 40, 5]]) {
      const grad = g.createRadialGradient(x - 2, y - 2, 1, x, y, r);
      grad.addColorStop(0, '#f6e7c1');
      grad.addColorStop(1, '#c99a5b');
      g.fillStyle = grad;
      g.beginPath();
      g.ellipse(x, y, r, r * 0.8, 0.4, 0, Math.PI * 2);
      g.fill();
    }
    return;
  }
  if (tier === 1) {
    // Earthworms.
    g.strokeStyle = '#d97c8a';
    g.lineWidth = 5;
    for (const [y, phase] of [[26, 0], [40, 1.5]]) {
      g.beginPath();
      for (let x = 10; x <= 54; x += 2) g.lineTo(x, y + Math.sin(x * 0.2 + phase) * 5);
      g.stroke();
    }
    g.strokeStyle = 'rgba(120,40,50,0.4)';
    g.lineWidth = 1;
    for (let x = 14; x < 52; x += 5) {
      g.beginPath();
      g.moveTo(x, 22 + Math.sin(x * 0.2) * 5);
      g.lineTo(x, 30 + Math.sin(x * 0.2) * 5);
      g.stroke();
    }
    return;
  }
  // Lures: tier 2 silver spinner, tier 3 golden fish-shaped lure.
  const L = look(BAIT_LOOK, tier);
  if (L.glow) {
    g.shadowColor = L.glow;
    g.shadowBlur = 10;
  }
  const grad = g.createLinearGradient(14, 20, 50, 44);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.4, L.top);
  grad.addColorStop(1, L.bottom);
  g.fillStyle = grad;
  if (tier === 2) {
    g.beginPath();
    g.ellipse(28, 30, 14, 7, -0.5, 0, Math.PI * 2); // spinner blade
    g.fill();
    g.shadowBlur = 0;
    g.strokeStyle = '#6c757d';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(10, 46);
    g.lineTo(52, 22);
    g.stroke();
  } else {
    g.beginPath();
    g.moveTo(12, 32);
    g.quadraticCurveTo(28, 16, 46, 30);
    g.lineTo(56, 22);
    g.lineTo(54, 40);
    g.lineTo(46, 34);
    g.quadraticCurveTo(28, 48, 12, 32);
    g.fill();
    g.shadowBlur = 0;
    g.fillStyle = '#111';
    g.beginPath();
    g.arc(19, 30, 1.8, 0, Math.PI * 2);
    g.fill();
  }
  // Treble hook.
  g.strokeStyle = '#495057';
  g.lineWidth = 1.4;
  g.beginPath();
  g.moveTo(40, 44);
  g.lineTo(40, 54);
  g.arc(37, 54, 3, 0, Math.PI);
  g.moveTo(40, 54);
  g.arc(43, 54, 3, Math.PI, 0, true);
  g.stroke();
}
