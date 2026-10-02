// The fishing boat, seen from above: hull, plank deck, rail, wheelhouse,
// mast and a few props. Used for the boat that visits the lake (small) and
// the trawler you stand on at sea (large). Bow points along +x before rotation.

const HULL = '#7a2e2e';
const HULL_DARK = '#4a1a1a';
const DECK = '#b5865a';
const PLANK = 'rgba(70,40,20,0.28)';
const RAIL = '#efe0bd';

function hullPath(L, B, inset = 0) {
  const x0 = -L / 2 + inset;
  const x1 = L / 2 - inset * 1.6;
  const shoulder = L * 0.22;
  const hw = B / 2 - inset;
  const p = new Path2D();
  p.moveTo(x0 + 8, -hw);
  p.lineTo(shoulder, -hw);
  p.bezierCurveTo(shoulder + L * 0.16, -hw, x1 - L * 0.05, -hw * 0.45, x1, 0);
  p.bezierCurveTo(x1 - L * 0.05, hw * 0.45, shoulder + L * 0.16, hw, shoulder, hw);
  p.lineTo(x0 + 8, hw);
  p.quadraticCurveTo(x0, hw, x0, hw - 8);
  p.lineTo(x0, -hw + 8);
  p.quadraticCurveTo(x0, -hw, x0 + 8, -hw);
  p.closePath();
  return p;
}

/** Foam trailing behind a moving boat. speed: 0 (still) .. 1 (full ahead). */
export function drawWake(ctx, pose, { length: L, beam: B, speed = 1, time = 0 }) {
  if (speed <= 0.02) return;
  ctx.save();
  ctx.translate(pose.x, pose.y);
  ctx.rotate(pose.h);
  ctx.lineCap = 'round';
  // A V of churned water spreading out behind the stern.
  for (let i = 0; i < 14; i++) {
    const k = ((i / 14 + time / 2600) % 1);
    const back = -L / 2 - k * L * 1.6;
    const spread = B * 0.45 + k * L * 0.55;
    ctx.globalAlpha = (1 - k) * 0.5 * speed;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5 + (1 - k) * 2;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(back, side * spread);
      ctx.lineTo(back - 14, side * (spread + 6));
      ctx.stroke();
    }
  }
  // Prop wash straight behind.
  const grad = ctx.createLinearGradient(-L / 2, 0, -L / 2 - L * 1.2, 0);
  grad.addColorStop(0, `rgba(255,255,255,${0.55 * speed})`);
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.globalAlpha = 1;
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(-L / 2, -B * 0.22);
  ctx.lineTo(-L / 2 - L * 1.2, -B * 0.6);
  ctx.lineTo(-L / 2 - L * 1.2, B * 0.6);
  ctx.lineTo(-L / 2, B * 0.22);
  ctx.fill();
  // Bow wave.
  ctx.strokeStyle = `rgba(255,255,255,${0.6 * speed})`;
  ctx.lineWidth = 2;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(L / 2 - 4, 0);
    ctx.quadraticCurveTo(L * 0.35, side * B * 0.62, L * 0.15, side * B * 0.72);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * pose: { x, y, h }. opts: { length, beam, time, bob (how much it rocks),
 * lights (lit windows, for evenings) }.
 */
export function drawBoat(ctx, pose, { length: L, beam: B, time = 0, bob = 1, lights = false }) {
  ctx.save();
  ctx.translate(pose.x, pose.y);
  ctx.rotate(pose.h + Math.sin(time / 1300) * 0.006 * bob);
  const scale = L / 560; // props are sized for the big trawler

  // Shadow on the water.
  ctx.save();
  ctx.translate(6, 9);
  ctx.fillStyle = 'rgba(0,20,30,0.35)';
  ctx.fill(hullPath(L, B));
  ctx.restore();

  // Hull with a darker waterline.
  const hull = hullPath(L, B);
  ctx.fillStyle = HULL;
  ctx.fill(hull);
  ctx.lineWidth = 3;
  ctx.strokeStyle = HULL_DARK;
  ctx.stroke(hull);

  // Deck planks.
  const deck = hullPath(L, B, Math.max(5, 9 * scale));
  ctx.save();
  ctx.clip(deck);
  ctx.fillStyle = DECK;
  ctx.fillRect(-L / 2, -B / 2, L, B);
  ctx.strokeStyle = PLANK;
  ctx.lineWidth = 1;
  const plank = Math.max(6, 9 * scale);
  for (let y = -B / 2; y < B / 2; y += plank) {
    ctx.beginPath();
    ctx.moveTo(-L / 2, y);
    ctx.lineTo(L / 2, y);
    ctx.stroke();
    // Staggered plank ends.
    for (let x = -L / 2 + ((y / plank) % 2 ? 40 : 0) * scale; x < L / 2; x += 80 * scale) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + plank);
      ctx.stroke();
    }
  }
  // Worn, lighter wood down the middle where people walk.
  const wear = ctx.createLinearGradient(0, -B / 2, 0, B / 2);
  wear.addColorStop(0, 'rgba(0,0,0,0.12)');
  wear.addColorStop(0.5, 'rgba(255,240,210,0.12)');
  wear.addColorStop(1, 'rgba(0,0,0,0.12)');
  ctx.fillStyle = wear;
  ctx.fillRect(-L / 2, -B / 2, L, B);
  ctx.restore();

  // Rail.
  ctx.strokeStyle = RAIL;
  ctx.lineWidth = Math.max(2, 3 * scale);
  ctx.stroke(deck);
  ctx.fillStyle = '#6b4a2a';
  for (let x = -L / 2 + 20 * scale; x < L * 0.28; x += 34 * scale) {
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(x, side * (B / 2 - Math.max(5, 9 * scale)), 2.2 * Math.max(0.7, scale), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Props: coiled nets, crates and a life ring.
  const s = Math.max(0.55, scale);
  const nets = (x, y) => {
    ctx.strokeStyle = 'rgba(40,70,60,0.85)';
    ctx.lineWidth = 1.2;
    for (let r = 4; r < 16 * s; r += 3) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
    }
  };
  nets(L * 0.3, -B * 0.18);
  ctx.fillStyle = '#8d6b3f';
  ctx.strokeStyle = '#4a3420';
  ctx.lineWidth = 1;
  for (const [x, y] of [[L * 0.3, B * 0.16], [L * 0.3 + 18 * s, B * 0.2]]) {
    ctx.fillRect(x - 8 * s, y - 8 * s, 16 * s, 16 * s);
    ctx.strokeRect(x - 8 * s, y - 8 * s, 16 * s, 16 * s);
  }
  ctx.strokeStyle = '#ff7b00';
  ctx.lineWidth = 4 * s;
  ctx.beginPath();
  ctx.arc(-L * 0.22, -B / 2 + 14 * s, 7 * s, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 4 * s;
  ctx.setLineDash([3 * s, 8 * s]);
  ctx.stroke();
  ctx.setLineDash([]);

  // Wheelhouse at the stern.
  const cabinLen = L * 0.19;
  const cabinW = B * 0.78;
  const cx = -L / 2 + 5;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(cx + 4, -cabinW / 2 + 5, cabinLen, cabinW);
  ctx.fillStyle = '#f1efe8';
  ctx.strokeStyle = '#8d8a80';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(cx, -cabinW / 2, cabinLen, cabinW, 6 * s);
  ctx.fill();
  ctx.stroke();
  // Roof ridge and windows facing forward.
  ctx.fillStyle = '#d9d5c9';
  ctx.fillRect(cx + 4, -2, cabinLen - 8, 4);
  ctx.fillStyle = lights ? '#ffe8a3' : '#4ea8de';
  for (let i = 0; i < 3; i++) {
    ctx.fillRect(cx + cabinLen - 7 * s, -cabinW / 2 + 8 * s + i * (cabinW - 16 * s) / 3, 4 * s, (cabinW - 16 * s) / 3 - 4 * s);
  }
  // Funnel.
  ctx.fillStyle = '#2b2d42';
  ctx.beginPath();
  ctx.arc(cx + cabinLen * 0.35, 0, 8 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#e63946';
  ctx.lineWidth = 3 * s;
  ctx.stroke();

  // Mast with a furled sail and a pennant.
  const mx = L * 0.08;
  ctx.fillStyle = '#e9d8a6';
  ctx.fillRect(mx - L * 0.2, -2.5 * s, L * 0.2, 5 * s);
  ctx.fillStyle = '#5b3c22';
  ctx.beginPath();
  ctx.arc(mx, 0, 6 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#e63946';
  ctx.beginPath();
  const flap = Math.sin(time / 180) * 4 * s;
  ctx.moveTo(-L / 2 + 2, 0);
  ctx.lineTo(-L / 2 - 16 * s, -4 * s + flap);
  ctx.lineTo(-L / 2 - 14 * s, 4 * s + flap);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

/** Lantern glow, drawn after the night has darkened everything else. */
export function drawBoatLights(ctx, pose, { length: L, beam: B }) {
  const s = Math.max(0.55, L / 560);
  ctx.save();
  ctx.translate(pose.x, pose.y);
  ctx.rotate(pose.h);
  ctx.globalCompositeOperation = 'lighter';
  for (const [x, y] of [[L * 0.42, 0], [-L * 0.1, -B / 2 + 8], [-L * 0.1, B / 2 - 8], [L * 0.08, 0]]) {
    const r = 70 * s;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,214,140,0.5)');
    g.addColorStop(1, 'rgba(255,214,140,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.fillStyle = '#fff3c4';
    ctx.beginPath();
    ctx.arc(x, y, 2.5 * s, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** A plank bridging the dock and the docked boat (lake only). */
export function drawGangplank(ctx, x0, x1, y) {
  ctx.save();
  ctx.fillStyle = 'rgba(0,20,30,0.3)';
  ctx.fillRect(x0, y - 9 + 6, x1 - x0, 18);
  ctx.fillStyle = '#9c6b3f';
  ctx.fillRect(x0, y - 9, x1 - x0, 18);
  ctx.strokeStyle = 'rgba(60,35,15,0.6)';
  ctx.lineWidth = 1;
  for (let x = x0 + 8; x < x1; x += 10) {
    ctx.beginPath();
    ctx.moveTo(x, y - 9);
    ctx.lineTo(x, y + 9);
    ctx.stroke();
  }
  ctx.strokeStyle = '#efe0bd';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x0, y - 9);
  ctx.lineTo(x1, y - 9);
  ctx.moveTo(x0, y + 9);
  ctx.lineTo(x1, y + 9);
  ctx.stroke();
  ctx.restore();
}
