// Entry point: HTTP server for the client + WebSocket server for gameplay.

import http from 'node:http';
import path from 'node:path';
import { WebSocketServer } from 'ws';
import { MSG, TICK_RATE } from '../shared/constants.js';
import { DEFAULT_LOCATION, LOCATIONS } from '../shared/world.js';
import { SPECIES } from '../shared/fish.js';
import { VERSION } from '../shared/version.js';
import { Game } from './game.js';
import { ProfileStore, newProfile } from './profiles.js';
import { LoginLimiter } from './auth.js';
import { serveStatic } from './static.js';

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const MAX_PLAYERS = Number(process.env.MAX_PLAYERS) || 50;
const MAX_MESSAGES_PER_SECOND = 60;
// Where player profiles are saved. On Railway, mount a volume here.
const DATA_DIR = path.resolve(process.env.DATA_DIR || 'data');

const store = new ProfileStore(path.join(DATA_DIR, 'profiles.json'));
await store.load();

const world = LOCATIONS[DEFAULT_LOCATION];
const game = new Game({ world, maxPlayers: MAX_PLAYERS, onProfileChange: () => store.markDirty() });

const online = new Map(); // profile id -> { player, ws }
const loginLimiter = new LoginLimiter({ max: 10, windowMs: 10 * 60 * 1000 }); // failed logins per IP
const signupLimiter = new LoginLimiter({ max: 5, windowMs: 60 * 60 * 1000 }); // new accounts per IP

function clientIp(req) {
  // Railway (and most proxies) put the real client address first in X-Forwarded-For.
  return req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
}

/**
 * Resolve a JOIN message to a profile. Modes:
 *   login    { username, password }
 *   register { username, password, token? }  (token: guest progress to keep)
 *   session  { session }                     (stay logged in)
 *   guest    { name, token? }                (default)
 * Returns { profile, session?, token? } or { error, expired? }.
 */
async function authenticate(msg, ip) {
  switch (msg.mode) {
    case 'login': {
      if (loginLimiter.blocked(ip)) return { error: 'Too many failed logins. Try again in a few minutes.' };
      const result = await store.login(msg.username, msg.password);
      if (result.error) loginLimiter.fail(ip);
      else loginLimiter.succeed(ip);
      return result;
    }
    case 'register': {
      if (signupLimiter.blocked(ip)) return { error: 'Too many new accounts from your network. Try again later.' };
      const result = await store.register(msg.username, msg.password, msg.token);
      if (!result.error) signupLimiter.fail(ip);
      return result;
    }
    case 'session': {
      const profile = store.getSession(msg.session);
      if (!profile) return { error: 'Your login has expired. Please log in again.', expired: true };
      return { profile, session: msg.session };
    }
    default: {
      const profile = store.getGuest(msg.token);
      if (profile && !profile.username) return { profile, token: msg.token };
      return store.createGuest(msg.name);
    }
  }
}

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, version: VERSION, players: game.players.size }));
    return;
  }
  serveStatic(req, res);
});

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4 * 1024 });

function sendJson(ws, data) {
  if (ws.readyState === ws.OPEN) ws.send(typeof data === 'string' ? data : JSON.stringify(data));
}

wss.on('connection', (ws, req) => {
  const ip = clientIp(req);
  let player = null;
  let joining = false;
  let msgCount = 0;
  let windowStart = Date.now();
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', async (data) => {
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
      if (msg.t !== MSG.JOIN || joining) return;
      joining = true;
      const result = await authenticate(msg, ip).catch((err) => {
        console.error('Join failed:', err);
        return { error: 'Something went wrong. Please try again.' };
      });
      joining = false;
      if (ws.readyState !== ws.OPEN) return;
      // Failed logins keep the connection open so the player can retry.
      if (result.error) {
        sendJson(ws, { t: MSG.ERROR, message: result.error, expired: !!result.expired });
        return;
      }
      if (game.players.size >= MAX_PLAYERS) {
        sendJson(ws, { t: MSG.ERROR, message: 'The lake is full. Try again soon.' });
        return;
      }

      let { profile } = result;
      let token = result.token ?? null;
      let guest = false;
      const existing = online.get(profile.id);
      if (existing && profile.username) {
        // An account can only fish in one place at a time: the newest login wins.
        sendJson(existing.ws, { t: MSG.ERROR, message: 'You logged in from another window.', kicked: true });
        game.removePlayer(existing.player.id);
        online.delete(profile.id);
        existing.ws.close();
      } else if (existing) {
        // Same guest profile in a second tab: play as a throwaway guest.
        profile = newProfile(msg.name);
        token = null;
        guest = true;
      }

      // addPlayer sends the private PROFILE message; the client accepts it before WELCOME.
      player = game.addPlayer(msg.name, (payload) => sendJson(ws, payload), profile);
      online.set(profile.id, { player, ws });
      ws.playerId = player.id;
      sendJson(ws, {
        t: MSG.WELCOME,
        id: player.id,
        locationId: world.id,
        species: SPECIES,
        version: VERSION,
        username: profile.username,
        session: result.session ?? null,
        token,
        guest,
      });
      return;
    }
    if (msg.t === MSG.LOGOUT) {
      store.revokeSession(msg.session);
      ws.close();
      return;
    }
    game.handleMessage(player, msg);
  });

  ws.on('close', () => {
    if (!player) return;
    game.removePlayer(player.id);
    if (online.get(player.profile.id)?.player === player) online.delete(player.profile.id);
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
  console.log(`The Last Cast v${VERSION} running at http://localhost:${PORT} (max ${MAX_PLAYERS} players, data in ${DATA_DIR})`);
});

// Save periodically as a safety net, and on shutdown.
setInterval(() => store.flush(), 30000).unref();

async function shutdown() {
  console.log('Shutting down...');
  for (const ws of wss.clients) ws.close(1001, 'Server restarting');
  await store.flush();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
