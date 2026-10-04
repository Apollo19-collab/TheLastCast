// Shop stalls: a wooden counter under a striped awning, with a sign. The
// Bait Shop on South Beach has buckets of bait; the travelling tackle shops
// (world.js `shops` with kind 'tackle') have rods and reels on display, in
// their own colours. Each is painted once and cached.

const PX = 2; // sprite pixels per world unit
const W = 120;
const H = 92;
const sprites = new Map();
const BAIT_LOOK = { awning: ['#e63946', '#f1faee'], sign: 'BAIT', goods: 'bait' };

/** Draw the Bait Shop centred on (x, y): the shop's position in world.js. */
export function drawBaitShop(ctx, x, y) {
  drawStall(ctx, x, y, 'bait', BAIT_LOOK);
}

/** Draw a travelling tackle shop (a world.js shop entry), with its name over it. */
export function drawTackleShop(ctx, shop) {
  drawStall(ctx, shop.x, shop.y, shop.id, { awning: shop.awning, sign: shop.sign, goods: 'tackle' });
  ctx.save();
  ctx.font = '700 13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.fillStyle = '#fff3d6';
  ctx.strokeText(shop.name, shop.x, shop.y - 70);
  ctx.fillText(shop.name, shop.x, shop.y - 70);
  ctx.restore();
}

function drawStall(ctx, x, y, id, look) {
  if (!sprites.has(id)) sprites.set(id, paint(look));
  ctx.drawImage(sprites.get(id), x - W / 2, y - H / 2 - 14, W, H);
}

function paint(look) {
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
    g.fillStyle = look.awning[i % 2 ? 1 : 0];
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
  g.font = '900 10px system-ui, sans-serif';
  const signW = Math.max(40, g.measureText(look.sign).width + 14);
  g.fillStyle = '#f4e1a0';
  g.strokeStyle = '#5b3c22';
  g.lineWidth = 1.5;
  g.beginPath();
  g.roundRect(-signW / 2, -44, signW, 14, 3);
  g.fill();
  g.stroke();
  g.fillStyle = '#3a2410';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(look.sign, 0, -36.5);

  if (look.goods === 'tackle') paintTackle(g, look);
  else paintBait(g);
  return c;
}

/** Buckets of worms and a barrel on the counter. */
function paintBait(g) {
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
}

/** Rods leaning on a rack beside the stall, and reels and spools on the counter. */
function paintTackle(g, look) {
  // The rack.
  g.fillStyle = '#5b3c22';
  g.fillRect(34, 26, 22, 4);
  g.fillRect(36, -8, 3, 36);
  g.fillRect(51, -8, 3, 36);
  const rods = ['#2b2d42', look.awning[0], '#d4a373', '#e9c46a'];
  rods.forEach((color, i) => {
    g.strokeStyle = color;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(38 + i * 5, 28);
    g.lineTo(34 + i * 6, -36 + i * 3);
    g.stroke();
    g.fillStyle = '#c0c7cf';
    g.beginPath();
    g.arc(38 + i * 5, 20, 2, 0, Math.PI * 2);
    g.fill();
  });
  // Reels and spools on the counter.
  const reel = (bx, body) => {
    g.fillStyle = body;
    g.strokeStyle = '#343a40';
    g.lineWidth = 1;
    g.beginPath();
    g.arc(bx, -2, 5, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.fillStyle = '#e9edf0';
    g.beginPath();
    g.arc(bx, -2, 2, 0, Math.PI * 2);
    g.fill();
  };
  reel(-18, look.awning[0]);
  reel(-4, '#c0c7cf');
  g.fillStyle = look.awning[1];
  g.strokeStyle = '#495057';
  g.beginPath();
  g.roundRect(8, -6, 8, 9, 1.5);
  g.fill();
  g.stroke();
  g.beginPath();
  g.roundRect(18, -6, 8, 9, 1.5);
  g.fill();
  g.stroke();
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

// ---- the Travelling Zoo wagon ----------------------------------------------------

let zooSprite = null;

/** The zoo's wagon: a striped circus tent on wheels with a flag. */
export function drawZoo(ctx, x, y, time) {
  if (!zooSprite) zooSprite = paintZoo();
  ctx.drawImage(zooSprite, x - 60, y - 70, 120, 100);
  // Flag on top.
  ctx.fillStyle = '#ffd166';
  ctx.beginPath();
  const flap = Math.sin(time / 200) * 3;
  ctx.moveTo(x, y - 66);
  ctx.lineTo(x + 16, y - 61 + flap);
  ctx.lineTo(x, y - 56);
  ctx.closePath();
  ctx.fill();
}

function paintZoo() {
  const c = document.createElement('canvas');
  c.width = 240;
  c.height = 200;
  const g = c.getContext('2d');
  g.scale(2, 2);
  g.translate(60, 70);
  g.fillStyle = 'rgba(40,30,10,0.3)';
  g.beginPath();
  g.ellipse(4, 22, 52, 12, 0, 0, Math.PI * 2);
  g.fill();
  // Wagon bed and wheels.
  g.fillStyle = '#7a3e1d';
  g.fillRect(-46, 0, 92, 18);
  g.fillStyle = '#ffd166';
  g.fillRect(-46, 6, 92, 3);
  for (const wx of [-34, 34]) {
    g.fillStyle = '#3a2410';
    g.beginPath();
    g.arc(wx, 20, 8, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#b5865a';
    g.beginPath();
    g.arc(wx, 20, 3, 0, Math.PI * 2);
    g.fill();
  }
  // Striped tent roof.
  for (let i = 0; i < 8; i++) {
    g.fillStyle = i % 2 ? '#fdfcdc' : '#9d4edd';
    g.beginPath();
    g.moveTo(0, -56);
    g.lineTo(-46 + i * 11.5, 0);
    g.lineTo(-46 + (i + 1) * 11.5, 0);
    g.closePath();
    g.fill();
  }
  g.strokeStyle = 'rgba(60,20,80,0.6)';
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(0, -56);
  g.lineTo(-46, 0);
  g.lineTo(46, 0);
  g.closePath();
  g.stroke();
  g.fillStyle = '#5a189a';
  g.fillRect(-1, -64, 2, 10);
  // Sign.
  g.fillStyle = '#fff3b0';
  g.strokeStyle = '#5a189a';
  g.beginPath();
  g.roundRect(-24, -14, 48, 12, 3);
  g.fill();
  g.stroke();
  g.fillStyle = '#5a189a';
  g.font = '900 8px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('ZOO', 0, -7.5);
  return c;
}

/** A pet trotting along behind its owner. */
export function drawPet(ctx, pos, pet, rarityColor, time) {
  const hop = Math.abs(Math.sin(time / 160 + pos.phase)) * (pos.moving ? 4 : 1);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(pos.x, pos.y + 9, 9, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  const g = ctx.createRadialGradient(pos.x, pos.y - hop, 2, pos.x, pos.y - hop, 17);
  g.addColorStop(0, `${rarityColor}55`);
  g.addColorStop(1, `${rarityColor}00`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(pos.x, pos.y - hop, 17, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = '21px system-ui, "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.save();
  if (pos.flip) {
    ctx.translate(pos.x, 0);
    ctx.scale(-1, 1);
    ctx.translate(-pos.x, 0);
  }
  ctx.fillText(pet.emoji, pos.x, pos.y - hop);
  ctx.restore();
  ctx.textBaseline = 'alphabetic';
}
