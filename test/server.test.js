// End-to-end smoke test: start the real server and connect two WebSocket clients.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const PORT = 4000 + Math.floor(Math.random() * 1000);
const BASE = `http://localhost:${PORT}`;
let server;

before(async () => {
  server = spawn(process.execPath, [fileURLToPath(new URL('../server/index.js', import.meta.url))], {
    env: { ...process.env, PORT: String(PORT), DATA_DIR: await mkdtemp(path.join(tmpdir(), 'lastcast-')) },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await new Promise((resolve) => server.stdout.once('data', resolve));
});

after(() => server.kill());

function connect(joinMsg) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${PORT}/ws`);
    const client = { ws, messages: [], id: null };
    ws.on('message', (d) => {
      const msg = JSON.parse(d.toString());
      client.messages.push(msg);
      if (msg.t === 'welcome') Object.assign(client, msg);
      if (msg.t === 'welcome' || msg.t === 'error') resolve(client);
    });
    ws.on('open', () => ws.send(JSON.stringify({ t: 'join', ...joinMsg })));
    ws.on('error', reject);
  });
}

const join = (name, token) => connect({ name, token });

function waitFor(client, predicate, ms = 3000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const iv = setInterval(() => {
      const hit = client.messages.find(predicate);
      if (hit) { clearInterval(iv); resolve(hit); }
      else if (Date.now() - start > ms) { clearInterval(iv); reject(new Error('timed out')); }
    }, 20);
  });
}

test('serves the client, shared modules and health check', async () => {
  const html = await fetch(`${BASE}/`).then((r) => r.text());
  assert.match(html, /The Last Cast/);
  const shared = await fetch(`${BASE}/shared/world.js`);
  assert.equal(shared.status, 200);
  assert.match(shared.headers.get('content-type'), /javascript/);
  const health = await fetch(`${BASE}/health`).then((r) => r.json());
  assert.equal(health.ok, true);
  const traversal = await fetch(`${BASE}/..%2Fpackage.json`);
  assert.equal(traversal.status, 404);
});

test('two players see each other and each other\'s casts', async () => {
  const a = await join('Alice');
  const b = await join('Bob');

  await waitFor(a, (m) => m.t === 'state' && m.players.some((p) => p.name === 'Bob'));
  await waitFor(b, (m) => m.t === 'state' && m.players.some((p) => p.name === 'Alice'));

  // Alice casts straight up from the beach into the shallows.
  a.ws.send(JSON.stringify({ t: 'cast', angle: -Math.PI / 2, power: 1 }));
  const seen = await waitFor(b, (m) => m.t === 'state' && m.players.some((p) => p.id === a.id && p.s !== 'idle'));
  const alice = seen.players.find((p) => p.id === a.id);
  assert.ok(Number.isFinite(alice.bx) && Number.isFinite(alice.by));

  // Garbage input must not crash the server.
  a.ws.send('not json');
  a.ws.send(JSON.stringify({ t: 'cast', angle: null }));
  b.ws.close();
  await waitFor(a, (m) => m.t === 'event' && m.kind === 'leave' && m.name === 'Bob');
  a.ws.close();
});

test('profiles: token reconnects to the same profile; duplicate tab becomes a guest', async () => {
  const a = await join('Carol');
  assert.match(a.token, /^[a-f0-9]{32}$/);
  assert.ok(a.messages.some((m) => m.t === 'profile' && m.coins === 0));

  const dup = await join('Carol', a.token);
  assert.equal(dup.guest, true);
  assert.equal(dup.token, null);
  dup.ws.close();

  a.ws.close();
  await new Promise((r) => setTimeout(r, 200));
  const back = await join('Carol', a.token);
  assert.equal(back.token, a.token);
  assert.equal(back.guest, false);
  back.ws.close();
});

test('accounts: sign up, wrong password, log in, session, single login, logout', async () => {
  const signup = await connect({ mode: 'register', username: 'Dana', password: 'reel-it-in' });
  assert.equal(signup.username, 'Dana');
  assert.match(signup.session, /^[a-f0-9]{32}$/);
  signup.ws.close();
  await new Promise((r) => setTimeout(r, 100));

  // Wrong password: error, connection stays open, retry works on the same socket.
  const c = await connect({ mode: 'login', username: 'dana', password: 'nope-nope' });
  assert.equal(c.messages.at(-1).message, 'Wrong username or password.');
  assert.equal(c.ws.readyState, WebSocket.OPEN);
  c.ws.send(JSON.stringify({ t: 'join', mode: 'login', username: 'dana', password: 'reel-it-in' }));
  await waitFor(c, (m) => m.t === 'welcome');
  assert.equal(c.messages.find((m) => m.t === 'welcome').username, 'Dana');

  // Logging in elsewhere (with the saved session) kicks the first window.
  const second = await connect({ mode: 'session', session: signup.session });
  assert.equal(second.username, 'Dana');
  await waitFor(c, (m) => m.t === 'error' && m.kicked);

  // Logging out revokes that session.
  second.ws.send(JSON.stringify({ t: 'logout', session: signup.session }));
  await new Promise((r) => setTimeout(r, 150));
  const again = await connect({ mode: 'session', session: signup.session });
  assert.equal(again.messages.at(-1).expired, true);
  again.ws.close();
});
