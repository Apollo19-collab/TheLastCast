// Entry point: HTTP server for the client + WebSocket server for gameplay.

import http from 'node:http';
import { WebSocketServer } from 'ws';
import { MSG, TICK_RATE } from '../shared/constants.js';
import { DEFAULT_LOCATION, LOCATIONS } from '../shared/world.js';
import { SPECIES } from '../shared/fish.js';
import { Game } from './game.js';
import { serveStatic } from './static.js';

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const MAX_PLAYERS = Number(process.env.MAX_PLAYERS) || 50;
const MAX_MESSAGES_PER_SECOND = 60;

const world = LOCATIONS[DEFAULT_LOCATION];
const game = new Game({ world, maxPlayers: MAX_PLAYERS });

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, players: game.players.size }));
    return;
  }
  serveStatic(req, res);
});

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4 * 1024 });

function sendJson(ws, data) {
  if (ws.readyState === ws.OPEN) ws.send(typeof data === 'string' ? data : JSON.stringify(data));
}

wss.on('connection', (ws) => {
  let player = null;
  let msgCount = 0;
  let windowStart = Date.now();
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (data) => {
    // Simple per-connection rate limit; excess messages are dropped.
    const now = Date.now();
    if (now - windowStart > 1000) { windowStart = now; msgCount = 0; }
    if (++msgCount > MAX_MESSAGES_PER_SECOND) return;

    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }
    if (!msg || typeof msg !== 'object' || typeof msg.t !== 'string') return;

    if (!player) {
      if (msg.t !== MSG.JOIN) return;
      player = game.addPlayer(msg.name, (payload) => sendJson(ws, payload));
      if (!player) {
        sendJson(ws, { t: MSG.ERROR, message: 'The lake is full. Try again soon.' });
        ws.close();
        return;
      }
      ws.playerId = player.id;
      sendJson(ws, { t: MSG.WELCOME, id: player.id, locationId: world.id, species: SPECIES });
      return;
    }
    game.handleMessage(player, msg);
  });

  ws.on('close', () => {
    if (player) game.removePlayer(player.id);
  });
});

// Fixed-rate simulation loop; state is broadcast every tick.
let last = performance.now();
setInterval(() => {
  const now = performance.now();
  const dt = Math.min(0.25, (now - last) / 1000);
  last = now;
  game.tick(dt);

  const events = game.drainEvents();
  const snapshot = JSON.stringify(game.snapshot());
  const eventPayloads = events.map((e) => JSON.stringify({ t: MSG.EVENT, ...e }));
  for (const ws of wss.clients) {
    if (!ws.playerId) continue;
    for (const e of eventPayloads) sendJson(ws, e);
    sendJson(ws, snapshot);
  }
}, 1000 / TICK_RATE);

// Drop connections that stop answering pings (e.g. closed laptops).
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 30000);

server.listen(PORT, HOST, () => {
  console.log(`The Last Cast running at http://localhost:${PORT} (max ${MAX_PLAYERS} players)`);
});

function shutdown() {
  console.log('Shutting down...');
  for (const ws of wss.clients) ws.close(1001, 'Server restarting');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
