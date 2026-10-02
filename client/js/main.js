// Client entry point: wires networking, input, rendering and HUD together.
// The client only sends intentions; the server decides every outcome.
//
// You are always in one room: the lake, or a boat voyage out at sea. The
// server says which (MSG.ROOM); each room has its own world and renderer.

import { FishingState, MSG, castDistance } from '/shared/constants.js';
import { DEFAULT_LOCATION, LOCATIONS, areaAt, zoneAt } from '/shared/world.js';
import { computeStats } from '/shared/gear.js';
import { VERSION } from '/shared/version.js';
import { DUEL } from '/shared/duel.js';
import { BOAT, SEA_EVENTS, SEA_LOCATIONS, makeSeaWorld } from '/shared/voyage.js';
import { Connection } from './net.js';
import { SnapshotBuffer } from './interpolation.js';
import { Input } from './input.js';
import { Renderer } from './renderer.js';
import { UI, clock } from './ui.js';
import { JoinForm, reloadToSignup, saved } from './account.js';
import { AudioEngine } from './audio.js';

const CHARGE_PERIOD_MS = 1100; // time for the power meter to go 0 -> 1
const DUEL_STATS = computeStats(DUEL.loadout);

const canvas = document.getElementById('game');
const lakeWorld = LOCATIONS[DEFAULT_LOCATION];
const seaWorld = makeSeaWorld();
const renderers = { lake: null, voyage: null }; // made on first use, then kept
let world = lakeWorld;
let renderer = getRenderer('lake');
let room = 'lake';
let voyage = null; // { stops, missions } while at sea
const net = new Connection();
const audio = new AudioEngine();
const ui = new UI({
  world: lakeWorld,
  audio,
  onBuy: (item) => net.send({ t: MSG.BUY, item }),
  onEquip: (item) => net.send({ t: MSG.EQUIP, item }),
});
const buffer = new SnapshotBuffer(100);
ui.setSoundButton(audio.muted, () => ui.setSoundButton(audio.toggleMute()));

// Browsers only allow sound after the player interacts with the page.
window.addEventListener('pointerdown', () => audio.unlock());
window.addEventListener('keydown', () => audio.unlock());

function getRenderer(kind) {
  if (!renderers[kind]) renderers[kind] = new Renderer(canvas, kind === 'voyage' ? seaWorld : lakeWorld);
  return renderers[kind];
}

/** Where a player currently is, for positional sounds. */
function playerPos(id) {
  const p = buffer.latest()?.players.find((q) => q.id === id);
  return p ? { x: p.x, y: p.y } : {};
}

let meId = null;
let input = null;
let charge = null; // { start } while the cast button is held
let reelSent = false;
let stats = computeStats(null); // my tackle stats, from my latest profile
let invite = null; // a duel challenge waiting for my answer: { from, name }
let duel = null; // { opponent, opponentId } while I'm in a duel
const castStarts = new Map(); // player id -> time their current cast began
const lastStates = new Map(); // player id -> last seen fishing state
const selfPos = { x: lakeWorld.spawn.x, y: lakeWorld.spawn.y, ready: false };

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

/** Tackle stats in effect right now (duels use matched tackle). */
function currentStats(me) {
  return me?.du ? DUEL_STATS : stats;
}

// ---- rooms: the lake, or a voyage at sea ----------------------------------------------

function setRoom(info) {
  const next = info.room === 'voyage' ? 'voyage' : 'lake';
  voyage = next === 'voyage' ? { stops: info.stops, missions: info.missions } : null;
  if (next === room && renderer) return;
  room = next;
  world = room === 'voyage' ? seaWorld : lakeWorld;
  renderer = getRenderer(room);
  buffer.clear();
  castStarts.clear();
  lastStates.clear();
  selfPos.ready = false;
  charge = null;
  input?.releaseAll();
  ui.prompt(null);
  audio.setScene(room === 'voyage' ? 'sea' : 'lake');
  if (room === 'voyage') {
    ui.setBoatLine('');
    ui.banner('All aboard!', `Four stops: ${voyage.stops.map((s) => SEA_LOCATIONS[s.loc].name).join(' → ')}`, '#9ad1ff', 4500);
    ui.feed('The boat heads out to sea. Fish at each stop, watch for special events and complete crew missions!', '#9ad1ff');
  } else {
    ui.hidePanel('voyage');
  }
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
  if (msg.room) setRoom(msg.room);
  ui.showGame();
  ui.feed('Welcome to Mirror Lake! Different waters hold different fish.');
  ui.feed('A boat docks at the South Beach dock every 15 minutes. Press E beside it to sail out to sea. Press E next to another angler to challenge them to a duel.', '#9ad1ff');
  if (msg.guest) ui.feed('You are already playing in another tab, so this tab is a guest and its progress is not saved.', '#f9c74f');
  if (!msg.username && !msg.guest) ui.feed('Playing as a guest. Sign up to keep your progress on any device.', '#a9d6e5');
  if (msg.version && msg.version !== VERSION) {
    ui.feed(`A new version (v${msg.version}) is available. Reload the page to update.`, '#f9c74f');
  }
  // Show what's new once after each update.
  try {
    if (localStorage.getItem('lastcast.seenVersion') !== VERSION) {
      localStorage.setItem('lastcast.seenVersion', VERSION);
      ui.openMenu('news');
    }
  } catch { /* storage blocked */ }
  input = new Input(canvas, {
    onMoveChange: (move) => net.send({ t: MSG.INPUT, ...move }),
    onActionDown,
    onActionUp,
    onCancel,
    onInteract,
    onAnswer: answerInvite,
    onMenu: (tab) => {
      ui.toggleMenu(tab);
      if (ui.menuOpen) { charge = null; input.releaseAll(); }
    },
    onMute: () => ui.setSoundButton(audio.toggleMute()),
    isBlocked: () => ui.menuOpen,
  });
});

net.on(MSG.ROOM, (msg) => setRoom(msg));

net.on(MSG.PROFILE, (profile) => {
  stats = computeStats(profile.equipped);
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
  else if (!document.getElementById('results').hidden) ui.hideResults();
  else if (charge) charge = null;
  else net.send({ t: MSG.CANCEL });
}

/** What pressing E would do right now: { text, run } or null. */
function interaction(me) {
  if (!me || room !== 'lake') return null;
  const boat = buffer.latest()?.boat;
  if (me.ab) return boat?.ph === 'docked' ? { text: 'E: step off the boat', run: () => net.send({ t: MSG.BOARD }) } : null;
  if (boat?.ph === 'docked' && Math.hypot(selfPos.x - BOAT.dock.x, selfPos.y - BOAT.dock.y) <= BOAT.boardRange) {
    return { text: `E: board the boat (sails in ${clock(boat.tl)})`, run: () => net.send({ t: MSG.BOARD }) };
  }
  if (me.du) return null;
  let best = null;
  for (const p of buffer.latest()?.players ?? []) {
    if (p.id === meId || p.du || p.ab) continue;
    const d = Math.hypot(p.x - selfPos.x, p.y - selfPos.y);
    if (d <= DUEL.range * 0.9 && (!best || d < best.d)) best = { p, d };
  }
  if (!best) return null;
  return {
    text: `E: challenge ${best.p.name} to a duel`,
    run: () => net.send({ t: MSG.DUEL, op: 'challenge', target: best.p.id }),
  };
}

function onInteract() {
  const action = interaction(latestMe());
  if (action) action.run();
}

function answerInvite(accept) {
  if (!invite) return;
  net.send({ t: MSG.DUEL, op: accept ? 'accept' : 'decline', from: invite.from });
  invite = null;
  ui.hideInvite();
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
  // At sea, the water you aim at is named after the current stop.
  if (snap.vy) seaWorld.zones[0].name = SEA_LOCATIONS[snap.vy.loc]?.name ?? 'Open Sea';
  ui.updateLeaderboard(snap.players, meId, room);
});

function onBoatEvent(ev, mine) {
  switch (ev.what) {
    case 'arriving':
      ui.feed('⛴ A boat is sailing in through the River Mouth!', '#9ad1ff');
      audio.play('horn', { volume: 0.5 });
      break;
    case 'docked':
      ui.feed(`⛴ The boat has docked at South Beach. Board within ${clock(ev.seconds)} to sail out to sea (press E beside it).`, '#9ad1ff');
      ui.banner('The boat has docked', `South Beach dock · ${clock(ev.seconds)} to board`, '#9ad1ff');
      audio.play('horn');
      break;
    case 'lastCall':
      ui.feed('⛴ Last call! The boat leaves in 30 seconds.', '#ffd166');
      break;
    case 'boarded':
      ui.flash(`You're aboard! The boat sails in ${clock(ev.seconds)}. Press E to step off.`, 4000);
      audio.play('coin');
      break;
    case 'left':
      ui.flash('You stepped back onto the dock.', 2500);
      break;
    case 'someoneBoarded':
      if (!mine) ui.feed(`⛴ ${ev.name} boarded the boat (${ev.count} aboard).`, '#9ad1ff');
      break;
    case 'departing':
      ui.feed(ev.count ? `⛴ The boat sets sail with ${ev.count} angler${ev.count > 1 ? 's' : ''} aboard!` : '⛴ The boat sails away empty.', '#9ad1ff');
      audio.play('horn', { volume: 0.7 });
      break;
  }
}

net.on(MSG.EVENT, (ev) => {
  const mine = ev.playerId === meId;
  switch (ev.kind) {
    case 'join':
      if (!mine) ui.feed(ev.fromSea ? `${ev.name} is back from a sea voyage.` : `${ev.name} arrived at the lake.`);
      break;
    case 'leave':
      ui.feed(`${ev.name} packed up and left.`);
      castStarts.delete(ev.playerId);
      lastStates.delete(ev.playerId);
      break;
    case 'catch': {
      const color = ui.rarityColor(ev.rarity);
      const where = ev.hotspot ? `${ev.zone}, hotspot` : ev.zone;
      const tag = ev.duel ? ' (duel)' : '';
      ui.feed(`${mine ? 'You' : ev.name} caught a ${ev.kg} kg ${ev.speciesName} (+${ev.points}) in the ${where}${tag}`, color);
      const p = buffer.latest()?.players.find((q) => q.id === ev.playerId);
      const big = ev.rarity === 'rare' || ev.rarity === 'legendary';
      if (p) renderer.addEffect({ type: 'fishPop', species: ev.species, big, text: `+${ev.points}`, x: p.x, y: p.y, color, duration: 2600 });
      if (mine) ui.showCatch(ev);
      if (mine) audio.play('catch', { rarity: ev.rarity, isNew: ev.isNew });
      else audio.play('catchOther', { rarity: ev.rarity, ...playerPos(ev.playerId) });
      if (mine && ev.duel) ui.flash(`Duel catch! ${ev.kg} kg ${ev.speciesName}: +${ev.points} duel points.`, 3000);
      else if (mine) {
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
    case 'achievement': {
      const detail = [`+${ev.coins} coins`, ev.unlocks.length ? `Unlocked: ${ev.unlocks.join(', ')}` : ''].filter(Boolean).join(' · ');
      ui.toast({ title: 'Achievement unlocked', name: ev.name, detail });
      audio.play('achievement');
      break;
    }
    case 'achievementAll':
      ui.feed(`${mine ? 'You' : ev.name} earned the "${ev.achievement}" achievement!`, '#ffd166');
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
      ui.flash(`Hooked a ${(ev.strength || 'mystery').toLowerCase()} fish! Hold to reel, release when it pulls.`, 1800);
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

    // ---- duels ----
    case 'duelInfo':
      ui.flash(ev.message, 3000);
      ui.feed(ev.message, '#ffe9a8');
      break;
    case 'duelInvite':
      invite = { from: ev.from, name: ev.name };
      ui.showInvite(ev, answerInvite);
      ui.feed(`⚔ ${ev.name} challenges you to a duel! Press Y to accept or N to decline.`, '#ffd166');
      audio.play('bite');
      setTimeout(() => { if (invite?.from === ev.from) invite = null; }, ev.seconds * 1000);
      break;
    case 'duelStart':
      duel = { opponent: ev.opponent, opponentId: ev.opponentId };
      invite = null;
      ui.hideInvite();
      ui.banner('Duel!', `vs ${ev.opponent} · matched tackle · most points in ${Math.round(ev.duration / 60)} minutes`, '#ffd166');
      audio.play('duelStart');
      break;
    case 'duelGo':
      ui.banner('Fish!', 'The duel has begun', '#7bd389', 1800);
      audio.play('duelStart');
      break;
    case 'duelEnd':
      duel = null;
      ui.duelPanel(null);
      ui.showDuelResult(ev);
      audio.play(ev.result === 'win' ? 'duelWin' : 'lose');
      break;
    case 'duelAnnounce':
      ui.feed(`⚔ ${ev.a} and ${ev.b} have started a fishing duel!`, '#ffd166');
      break;
    case 'duelResult':
      if (ev.winner) ui.feed(`⚔ ${ev.winner} beat ${ev.loser} in a duel (${ev.scoreA}–${ev.scoreB})${ev.forfeit ? ' by forfeit' : ''}${ev.prize ? ` and won ${ev.prize} coins` : ''}!`, '#ffd166');
      else ui.feed(`⚔ ${ev.a} and ${ev.b} drew their duel (${ev.scoreA}–${ev.scoreB}).`, '#ffd166');
      break;

    // ---- the boat and voyages ----
    case 'boat':
      onBoatEvent(ev, mine);
      break;
    case 'voyageStop':
      ui.banner(ev.name, `Stop ${ev.index + 1} of ${ev.of} · ${ev.time} · lines out!`, '#9ad1ff');
      ui.feed(`⛴ Stop ${ev.index + 1}: ${ev.name}. ${SEA_LOCATIONS[ev.loc].desc}`, '#9ad1ff');
      audio.play('horn', { volume: 0.5 });
      break;
    case 'voyageSail':
      ui.feed(`⛴ Lines in! Sailing on to ${ev.name}...`, '#9ad1ff');
      break;
    case 'seaEvent': {
      const color = SEA_EVENTS[ev.id]?.color ?? '#ffd166';
      ui.banner(ev.name, ev.desc, color, 5000);
      ui.feed(`✨ ${ev.name}! ${ev.desc}`, color);
      audio.play('seaEvent');
      break;
    }
    case 'seaEventEnd':
      ui.feed(`${ev.name} has ended.`, '#cfd8dc');
      break;
    case 'mission':
      ui.feed(`✓ Crew mission complete: ${ev.text} (+${ev.reward} coins each at the end)`, '#7bd389');
      ui.toast({ title: 'Crew mission complete', name: ev.text, detail: `+${ev.reward} bonus coins for everyone` });
      audio.play('mission');
      break;
    case 'voyageResults':
      ui.showVoyageResults(ev);
      audio.play(ev.rank === 1 ? 'duelWin' : 'achievement');
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

/** Boat timer in the player panel (lake). */
function updateBoatLine(me, boat) {
  if (!boat || room !== 'lake') return;
  if (me?.ab) ui.setBoatLine(boat.ph === 'docked' ? `⛴ Aboard! Sailing in ${clock(boat.tl)} (E to step off)` : '⛴ Aboard! Heading out to sea...', true);
  else if (boat.ph === 'docked') ui.setBoatLine(`⛴ Boat boarding at South Beach dock: ${clock(boat.tl)} left${boat.n ? ` · ${boat.n} aboard` : ''}`, true);
  else if (boat.ph === 'departing') ui.setBoatLine('⛴ The boat is sailing out to sea');
  else ui.setBoatLine(`⛴ Next boat docks in ${clock(boat.nd)}`);
}

/** Duel scoreboard, from the snapshot. */
function updateDuelPanel(me, players) {
  if (!me?.du) { ui.duelPanel(null); return; }
  const them = players.find((p) => p.id === me.du);
  ui.duelPanel({
    opponent: them?.name ?? duel?.opponent ?? 'Opponent',
    me: me.ds ?? 0,
    them: them?.ds ?? 0,
    seconds: me.dt ?? 0,
    live: !!me.dp,
    onForfeit: () => net.send({ t: MSG.DUEL, op: 'forfeit' }),
  });
}

/** Voyage panel, from the snapshot. */
function updateVoyagePanel(me, snap) {
  if (room !== 'voyage' || !snap?.vy || !voyage) return;
  const vy = snap.vy;
  const ranked = [...snap.players].sort((a, b) => (b.vp ?? 0) - (a.vp ?? 0));
  ui.voyagePanel({
    phase: vy.ph,
    stopIndex: vy.st,
    stops: voyage.stops,
    timeLeft: vy.tl,
    next: vy.next,
    event: vy.ev,
    eventLeft: vy.evl,
    crew: vy.crew,
    missions: voyage.missions.map((m, i) => ({ text: m.text, goal: m.goal, progress: vy.ms[i] ?? 0 })),
    myPoints: me?.vp ?? 0,
    rank: Math.max(1, ranked.findIndex((p) => p.id === meId) + 1),
    crewSize: snap.players.length,
  });
}

let lastFrame = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;

  const players = buffer.samplePlayers(now);
  const me = latestMe();
  const snap = buffer.latest();
  const boat = room === 'lake' ? buffer.sampleBoat(now) : null;

  // The local player is drawn from the newest snapshot (smoothed), not the
  // delayed interpolation used for others, so our own movement feels responsive.
  // Aboard the moving boat we ride along with everyone else instead.
  if (me) {
    const sampled = players.find((p) => p.id === meId);
    if (me.ab && sampled) Object.assign(selfPos, { x: sampled.x, y: sampled.y, ready: true });
    else {
      if (!selfPos.ready) Object.assign(selfPos, { x: me.x, y: me.y, ready: true });
      const k = 1 - Math.exp(-dt * 18);
      selfPos.x += (me.x - selfPos.x) * k;
      selfPos.y += (me.y - selfPos.y) * k;
    }
  }

  const drawn = players.map((p) => {
    const out = p.id === meId && me ? { ...me, x: selfPos.x, y: selfPos.y } : p;
    out.castStart = castStarts.get(p.id);
    return out;
  });

  const myStats = currentStats(me);
  let aim = null;
  let aimZone = null;
  const canAim = me && input && me.s === FishingState.IDLE && !me.ab && !(room === 'voyage' && snap?.vy?.ph !== 'fishing');
  if (canAim) {
    const angle = aimAngle();
    const power = charge ? chargePower(now) : 1;
    aim = { x: selfPos.x, y: selfPos.y, angle, power, range: myStats.castRange };
    const d = castDistance(power, myStats.castRange);
    aimZone = zoneAt(world, selfPos.x + Math.cos(angle) * d, selfPos.y + Math.sin(angle) * d)?.name ?? null;
    // Face where we aim while standing still.
    const selfDrawn = drawn.find((p) => p.id === meId);
    if (selfDrawn) selfDrawn.f = angle;
  }

  if (me && input) {
    syncReel(me);
    let text = STATUS_TEXT[me.s] ?? '';
    if (me.s === FishingState.IDLE && charge) text = `Power ${Math.round(chargePower(now) * 100)}%. Release to cast.`;
    if (me.s === FishingState.IDLE && room === 'voyage' && snap?.vy?.ph !== 'fishing') text = 'Lines in while the boat is moving. Get ready for the next stop!';
    if (me.ab) text = snap?.boat?.ph === 'docked' ? 'Waiting aboard the boat. It sails when boarding closes.' : 'Sailing out to sea...';
    const pulling = me.s === FishingState.REELING && me.pl;
    if (pulling) text = 'It\'s pulling! Ease off or the line will snap!';
    ui.status(text, pulling || me.s === FishingState.BITE);
    const where = room === 'voyage'
      ? `At sea · ${SEA_LOCATIONS[snap?.vy?.loc]?.name ?? 'sailing'}`
      : areaAt(world, selfPos.x, selfPos.y)?.name ?? world.name;
    ui.updateMe(me, aimZone, where);
    ui.prompt(ui.menuOpen ? null : interaction(me)?.text ?? null);
    updateBoatLine(me, snap?.boat);
    updateDuelPanel(me, snap?.players ?? []);
    updateVoyagePanel(me, snap);
  }

  audio.listener = selfPos;
  audio.updateReel(me?.s === FishingState.REELING
    ? { reeling: !!input?.actionHeld && !ui.menuOpen, pulling: me.pl, tension: me.tn, progress: me.pg }
    : null);

  renderer.updateCamera(selfPos.x, selfPos.y);
  const vy = snap?.vy;
  renderer.draw({
    time: now,
    players: drawn,
    hotspots: snap?.hotspots ?? [],
    meId,
    aim,
    boat,
    sea: vy ? {
      loc: vy.loc,
      time: voyage?.stops[Math.max(0, vy.st)]?.time ?? 'Morning',
      event: vy.ev,
      sailing: vy.ph !== 'fishing',
    } : null,
  });
}
requestAnimationFrame(frame);
