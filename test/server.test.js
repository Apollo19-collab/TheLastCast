// End-to-end smoke test: start the real server and connect two WebSocket clients.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const PORT = 4000 + Math.floor(Math.random() * 1000);
const BASE = `http://localhost:${PORT}`;
let server;

before(async () => {
  server = spawn(process.execPath, [fileURLToPath(new URL('../server/index.js', import.meta.url))], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await new Promise((resolve) => server.stdout.once('data', resolve));
});

after(() => server.kill());

function join(name) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${PORT}/ws`);
    const client = { ws, messages: [], id: null };
    ws.on('message', (d) => {
      const msg = JSON.parse(d.toString());
      client.messages.push(msg);
      if (msg.t === 'welcome') { client.id = msg.id; resolve(client); }
    });
    ws.on('open', () => ws.send(JSON.stringify({ t: 'join', name })));
    ws.on('error', reject);
  });
}

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
  a.ws.send(JSON.stringify({ t: 'cast', angle: -Math.PI / 2, power: 0.5 }));
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
