// The Bait Shop stall on South Beach: a wooden counter under a striped
// awning, a sign, and buckets of bait. Painted once and cached.

const PX = 2; // sprite pixels per world unit
const W = 96;
const H = 92;
let sprite = null;

/** Draw the stall centred on (x, y): the shop's position in world.js. */
export function drawBaitShop(ctx, x, y) {
  if (!sprite) sprite = paint();
  ctx.drawImage(sprite, x - W / 2, y - H / 2 - 14, W, H);
}

function paint() {
  const c = document.createElement('canvas');
  c.width = W * PX;
  c.height = H * PX;
  const g = c.getContext('2d');
  g.scale(PX, PX);
  g.translate(W / 2, H / 2);
  g.lineJoin = 'round';

  // Shadow on the sand.
  g.fillStyle = 'rgba(60,40,10,0.28)';
  g.beginPath();
  g.ellipse(4, 34, 40, 10, 0, 0, Math.PI * 2);
  g.fill();

  // Counter.
  g.fillStyle = '#8a5a33';
  g.strokeStyle = '#4a2f18';
  g.lineWidth = 1.5;
  g.beginPath();
  g.roundRect(-30, 4, 60, 30, 3);
  g.fill();
  g.stroke();
  g.strokeStyle = 'rgba(40,25,10,0.4)';
  g.lineWidth = 1;
  for (let x = -24; x < 30; x += 8) {
    g.beginPath();
    g.moveTo(x, 6);
    g.lineTo(x, 32);
    g.stroke();
  }
  g.fillStyle = '#b5865a';
  g.fillRect(-32, 2, 64, 5);

  // Posts and the striped awning.
  g.fillStyle = '#5b3c22';
  g.fillRect(-30, -26, 4, 32);
  g.fillRect(26, -26, 4, 32);
  for (let i = 0; i < 8; i++) {
    g.fillStyle = i % 2 ? '#f1faee' : '#e63946';
    g.beginPath();
    g.moveTo(-36 + i * 9, -30);
    g.lineTo(-27 + i * 9, -30);
    g.lineTo(-27 + i * 9, -16);
    g.quadraticCurveTo(-31.5 + i * 9, -12, -36 + i * 9, -16);
    g.closePath();
    g.fill();
  }
  g.strokeStyle = 'rgba(80,20,20,0.5)';
  g.lineWidth = 1;
  g.strokeRect(-36, -30, 72, 14);

  // Sign.
  g.fillStyle = '#f4e1a0';
  g.strokeStyle = '#5b3c22';
  g.lineWidth = 1.5;
  g.beginPath();
  g.roundRect(-20, -44, 40, 14, 3);
  g.fill();
  g.stroke();
  g.fillStyle = '#3a2410';
  g.font = '900 10px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('BAIT', 0, -36.5);

  // Buckets of worms and a barrel on the counter.
  const bucket = (bx, fill) => {
    g.fillStyle = '#6c757d';
    g.beginPath();
    g.roundRect(bx - 6, -4, 12, 10, 2);
    g.fill();
    g.fillStyle = fill;
    g.beginPath();
    g.ellipse(bx, -4, 6, 2.5, 0, 0, Math.PI * 2);
    g.fill();
  };
  bucket(-16, '#d97c8a');
  bucket(0, '#ffd60a');
  bucket(16, '#7a2e3a');
  g.fillStyle = '#8d5b3a';
  g.strokeStyle = '#4a2f18';
  g.beginPath();
  g.roundRect(32, 10, 12, 20, 4);
  g.fill();
  g.stroke();
  g.strokeStyle = '#3a3a3a';
  for (const y of [15, 25]) {
    g.beginPath();
    g.moveTo(32, y);
    g.lineTo(44, y);
    g.stroke();
  }
  return c;
}

/**
 * A placed chum bucket: the bucket, a slick of chum spreading around it and,
 * for your own bucket, a ring showing how close you must land fish.
 * c: snapshot entry { x, y, l (seconds left), f (fish chummed), n (owner) }.
 */
export function drawChumBucket(ctx, c, time, mine, { radius, attract }) {
  // Chum drifting out: a soft, pulsing reddish-brown cloud.
  const pulse = 0.85 + 0.15 * Math.sin(time / 700 + c.x);
  const g = ctx.createRadialGradient(c.x, c.y, 4, c.x, c.y, attract * pulse);
  g.addColorStop(0, 'rgba(150,60,35,0.45)');
  g.addColorStop(0.6, 'rgba(150,75,45,0.2)');
  g.addColorStop(1, 'rgba(150,80,50,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(c.x, c.y, attract * pulse, 0, Math.PI * 2);
  ctx.fill();
  if (mine) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,209,102,0.55)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 8]);
    ctx.lineDashOffset = -time / 50;
    ctx.beginPath();
    ctx.arc(c.x, c.y, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  // The bucket.
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(c.x + 2, c.y + 4, 9, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#c1121f';
  ctx.beginPath();
  ctx.arc(c.x, c.y, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#6a040f';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = '#7f4f24';
  ctx.beginPath();
  ctx.arc(c.x, c.y, 5.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,200,180,0.7)';
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.arc(c.x - 2 + (i % 2) * 3, c.y - 2 + Math.floor(i / 2) * 3, 1, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = '#adb5bd';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(c.x, c.y, 10, -2.4, -0.7);
  ctx.stroke();
  // Label: whose it is and how long it has left.
  ctx.font = '600 9px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const label = `${mine ? 'Your' : `${c.n}'s`} chum · ${Math.floor(c.l / 60)}:${String(c.l % 60).padStart(2, '0')}`;
  const w = ctx.measureText(label).width + 10;
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.beginPath();
  ctx.roundRect(c.x - w / 2, c.y + 12, w, 13, 6.5);
  ctx.fill();
  ctx.fillStyle = mine ? '#ffd166' : '#fff';
  ctx.fillText(label, c.x, c.y + 18.5);
  ctx.textBaseline = 'alphabetic';
}
