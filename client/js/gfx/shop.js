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
