// Client entry point: wires networking, input, rendering and HUD together.
// The client only sends intentions; the server decides every outcome.

import { FishingState, MSG, castDistance } from '/shared/constants.js';
import { DEFAULT_LOCATION, LOCATIONS, zoneAt } from '/shared/world.js';
import { gearStats } from '/shared/gear.js';
import { Connection } from './net.js';
import { SnapshotBuffer } from './interpolation.js';
import { Input } from './input.js';
import { Renderer } from './renderer.js';
import { UI } from './ui.js';
import { JoinForm, reloadToSignup, saved } from './account.js';
import { AudioEngine } from './audio.js';

const CHARGE_PERIOD_MS = 1100; // time for the power meter to go 0 -> 1

const canvas = document.getElementById('game');
let world = LOCATIONS[DEFAULT_LOCATION];
let renderer = new Renderer(canvas, world);
const net = new Connection();
const ui = new UI({ world, onBuy: (slot) => net.send({ t: MSG.BUY, slot }) });
const buffer = new SnapshotBuffer(100);
const audio = new AudioEngine();
ui.setSoundButton(audio.muted, () => ui.setSoundButton(audio.toggleMute()));

// Browsers only allow sound after the player interacts with the page.
window.addEventListener('pointerdown', () => audio.unlock());
window.addEventListener('keydown', () => audio.unlock());

/** Where a player currently is, for positional sounds. */
function playerPos(id) {
  const p = buffer.latest()?.players.find((q) => q.id === id);
  return p ? { x: p.x, y: p.y } : {};
}

let meId = null;
let input = null;
let charge = null; // { start } while the cast button is held
let reelSent = false;
let stats = gearStats(null); // my gear stats, from my latest profile
const castStarts = new Map(); // player id -> time their current cast began
const lastStates = new Map(); // player id -> last seen fishing state
const selfPos = { x: world.spawn.x, y: world.spawn.y, ready: false };

function latestMe() {
  return buffer.latest()?.players.find((p) => p.id === meId) ?? null;
}

function chargePower(now) {
  const t = ((now - charge.start) / CHARGE_PERIOD_MS) % 2;
  return t < 1 ? t : 2 - t; // ping-pong so holding too long loses power
}

function aimAngle() {
  const m = renderer.screenToWorld(input.mouse.x, input.mouse.y);
  return Math.atan2(m.y - selfPos.y, m.x - selfPos.x);
}

// ---- joining: log in / sign up / guest -------------------------------------------

let kicked = false;

async function join(msg, busyText) {
  form.setBusy(true, busyText);
  form.showError('');
  try {
    await net.ensureConnected();
    net.send(msg);
  } catch (err) {
    form.showError(err.message);
    form.setBusy(false);
  }
}

const form = new JoinForm({ onSubmit: (msg) => join(msg, 'Please wait...') });

// Stay logged in: reuse a saved session automatically.
if (saved.session()) join({ t: MSG.JOIN, mode: 'session', session: saved.session() }, 'Logging in...');

net.on(MSG.WELCOME, (msg) => {
  meId = msg.id;
  form.clearPassword();
  if (msg.session) saved.setSession(msg.session);
  if (msg.username) saved.setToken(null); // guest progress now lives in the account
  else if (msg.token) saved.setToken(msg.token);

  ui.setAccount(msg.username, msg.guest, {
    onLogout: () => {
      net.send({ t: MSG.LOGOUT, session: saved.session() });
      saved.setSession(null);
      location.reload();
    },
    onSignup: reloadToSignup,
  });
  if (LOCATIONS[msg.locationId] && LOCATIONS[msg.locationId] !== world) {
    world = LOCATIONS[msg.locationId];
    renderer = new Renderer(canvas, world);
  }
  ui.showGame();
  ui.feed('Welcome to Mirror Lake! Different waters hold different fish.');
  if (msg.guest) ui.feed('You are already playing in another tab, so this tab is a guest and its progress is not saved.', '#f9c74f');
  if (!msg.username && !msg.guest) ui.feed('Playing as a guest. Sign up to keep your progress on any device.', '#a9d6e5');
  input = new Input(canvas, {
    onMoveChange: (move) => net.send({ t: MSG.INPUT, ...move }),
    onActionDown,
    onActionUp,
    onCancel,
    onMenu: (tab) => {
      ui.toggleMenu(tab);
      if (ui.menuOpen) { charge = null; input.releaseAll(); }
    },
    onMute: () => ui.setSoundButton(audio.toggleMute()),
    isBlocked: () => ui.menuOpen,
  });
});

net.on(MSG.PROFILE, (profile) => {
  stats = gearStats(profile.gear);
  ui.updateProfile(profile);
});

net.on(MSG.ERROR, (msg) => {
  if (msg.expired) saved.setSession(null);
  if (msg.kicked) {
    kicked = true;
    meId = null;
    ui.showJoin(`${msg.message} Reload the page to play here instead.`);
    return;
  }
  form.setBusy(false);
  form.showError(msg.message);
});

net.on('close', () => {
  if (kicked) return;
  if (meId) ui.showJoin('Disconnected from the server. Reload the page to rejoin.');
  else form.setBusy(false);
  meId = null;
});

// ---- actions ----------------------------------------------------------------------

function onActionDown() {
  const me = latestMe();
  if (!me) return;
  if (me.s === FishingState.IDLE) charge = { start: performance.now() };
  else if (me.s === FishingState.BITE) net.send({ t: MSG.HOOK });
  // While reeling, the held state is synced every frame (see syncReel).
}

function onActionUp() {
  if (!charge) return;
  const power = chargePower(performance.now());
  charge = null;
  if (ui.menuOpen) return;
  net.send({ t: MSG.CAST, angle: aimAngle(), power });
  audio.play('cast');
}

function onCancel() {
  if (ui.menuOpen) ui.closeMenu();
  else if (charge) charge = null;
  else net.send({ t: MSG.CANCEL });
}

function syncReel(me) {
  const want = me?.s === FishingState.REELING && input.actionHeld;
  if (me?.s !== FishingState.REELING) { reelSent = false; return; }
  if (want !== reelSent) {
    net.send({ t: MSG.REEL, on: want });
    reelSent = want;
  }
}

// ---- server messages ----------------------------------------------------------------

net.on(MSG.STATE, (snap) => {
  buffer.push(snap);
  const now = performance.now();
  for (const p of snap.players) {
    const prev = lastStates.get(p.id);
    if (p.s === FishingState.CASTING && prev !== FishingState.CASTING) castStarts.set(p.id, now);
    if (p.s === FishingState.WAITING && prev === FishingState.CASTING) {
      renderer.addEffect({ type: 'splash', x: p.bx, y: p.by, duration: 700 });
      audio.play('splash', { x: p.bx, y: p.by, volume: p.id === meId ? 1 : 0.6 });
    }
    lastStates.set(p.id, p.s);
  }
  ui.updateLeaderboard(snap.players, meId);
});

net.on(MSG.EVENT, (ev) => {
  const mine = ev.playerId === meId;
  switch (ev.kind) {
    case 'join':
      if (!mine) ui.feed(`${ev.name} arrived at the lake.`);
      break;
    case 'leave':
      ui.feed(`${ev.name} packed up and left.`);
      castStarts.delete(ev.playerId);
      lastStates.delete(ev.playerId);
      break;
    case 'catch': {
      const color = ui.rarityColor(ev.rarity);
      const where = ev.hotspot ? `${ev.zone}, hotspot` : ev.zone;
      ui.feed(`${mine ? 'You' : ev.name} caught a ${ev.kg} kg ${ev.speciesName} (+${ev.points}) in the ${where}`, color);
      const p = buffer.latest()?.players.find((q) => q.id === ev.playerId);
      if (p) renderer.addEffect({ type: 'text', text: `${ev.speciesName} +${ev.points}`, x: p.x, y: p.y, color, duration: 2200 });
      if (mine) audio.play('catch', { rarity: ev.rarity, isNew: ev.isNew });
      else audio.play('catchOther', { rarity: ev.rarity, ...playerPos(ev.playerId) });
      if (mine) {
        const isNew = ev.isNew ? ' NEW species for your Fish Index!' : '';
        ui.flash(`You caught a ${ev.kg} kg ${ev.speciesName}! +${ev.points} points & coins.${isNew}`, 3500);
      }
      break;
    }
    case 'shop':
      ui.flash(ev.message, 2500);
      ui.feed(ev.message, ev.ok ? '#7bd389' : '#ff8f8f');
      audio.play(ev.ok ? 'coin' : 'error');
      break;
    case 'snap':
      ui.feed(`${mine ? 'Your' : `${ev.name}'s`} line snapped!`, '#ff6b6b');
      if (mine) ui.flash('SNAP! Too much tension. Let go when the fish pulls.', 3000);
      audio.play('snap', mine ? {} : { volume: 0.5, ...playerPos(ev.playerId) });
      break;
    case 'landed': {
      const notes = [];
      if (ev.hotspot) notes.push('hotspot! rare fish more likely');
      if (ev.crowd > 0) notes.push(`crowded: ${ev.crowd} line${ev.crowd > 1 ? 's' : ''} nearby, bites slower`);
      ui.flash(`Bobber landed in the ${ev.zone}${notes.length ? ` (${notes.join('; ')})` : ''}`, 3000);
      break;
    }
    case 'bite':
      ui.flash('BITE! Press Space or click now!', 1300);
      audio.play('bite');
      break;
    case 'hooked':
      ui.flash('Hooked! Hold to reel, release when it pulls.', 1500);
      audio.play('hook');
      break;
    case 'castFail':
      ui.flash(ev.message, 2500);
      audio.play('error');
      break;
    case 'missed':
    case 'escape':
      ui.flash(ev.message, 2500);
      audio.play('lose');
      break;
    case 'info':
      ui.flash(ev.message, 2500);
      break;
  }
});

// ---- render loop --------------------------------------------------------------------

const STATUS_TEXT = {
  [FishingState.IDLE]: 'Move with WASD. Aim with the mouse. Hold Space or click to charge, release to cast.',
  [FishingState.CASTING]: '',
  [FishingState.WAITING]: 'Waiting for a bite... (Esc to reel in)',
  [FishingState.BITE]: 'BITE! Press Space or click!',
  [FishingState.REELING]: 'Hold to reel. Release when it pulls!',
};

let lastFrame = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;

  const players = buffer.samplePlayers(now);
  const me = latestMe();

  // The local player is drawn from the newest snapshot (smoothed), not the
  // delayed interpolation used for others, so our own movement feels responsive.
  if (me) {
    if (!selfPos.ready) Object.assign(selfPos, { x: me.x, y: me.y, ready: true });
    const k = 1 - Math.exp(-dt * 18);
    selfPos.x += (me.x - selfPos.x) * k;
    selfPos.y += (me.y - selfPos.y) * k;
  }

  const drawn = players.map((p) => {
    const out = p.id === meId && me ? { ...me, x: selfPos.x, y: selfPos.y } : p;
    out.castStart = castStarts.get(p.id);
    return out;
  });

  let aim = null;
  let aimZone = null;
  if (me && input && me.s === FishingState.IDLE) {
    const angle = aimAngle();
    const power = charge ? chargePower(now) : 1;
    aim = { x: selfPos.x, y: selfPos.y, angle, power, range: stats.castRange };
    const d = castDistance(power, stats.castRange);
    aimZone = zoneAt(world, selfPos.x + Math.cos(angle) * d, selfPos.y + Math.sin(angle) * d)?.name ?? null;
    // Face where we aim while standing still.
    const selfDrawn = drawn.find((p) => p.id === meId);
    if (selfDrawn) selfDrawn.f = angle;
  }

  if (me && input) {
    syncReel(me);
    let text = STATUS_TEXT[me.s] ?? '';
    if (me.s === FishingState.IDLE && charge) text = `Power ${Math.round(chargePower(now) * 100)}%. Release to cast.`;
    const pulling = me.s === FishingState.REELING && me.pl;
    if (pulling) text = 'It\'s pulling! Ease off or the line will snap!';
    ui.status(text, pulling || me.s === FishingState.BITE);
    ui.updateMe(me, aimZone);
  }

  audio.listener = selfPos;
  audio.updateReel(me?.s === FishingState.REELING
    ? { reeling: !!input?.actionHeld && !ui.menuOpen, pulling: me.pl, tension: me.tn, progress: me.pg }
    : null);

  renderer.updateCamera(selfPos.x, selfPos.y, dt);
  renderer.draw({
    time: now,
    players: drawn,
    hotspots: buffer.latest()?.hotspots ?? [],
    meId,
    aim,
  });
}
requestAnimationFrame(frame);
