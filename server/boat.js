// The boat that visits Mirror Lake every 15 minutes (schedule and route in
// shared/voyage.js). While it is docked, players near it can board (E). When
// it has sailed out of sight, everyone aboard starts a voyage at sea.

import { BOAT, boatSlot, boatState } from '../shared/voyage.js';
import { FishingState } from '../shared/constants.js';
import { newLine } from './fishing.js';

export class Boat {
  /** now(): milliseconds since the epoch. interval: seconds between visits. */
  constructor(hub, { now = () => Date.now(), interval = BOAT.interval } = {}) {
    this.hub = hub;
    this.now = now;
    this.interval = interval;
    this.aboard = []; // players, in boarding order (their slot on deck)
    this.state = boatState(now() / 1000, interval);
    this.lastCall = false;
  }

  get lake() {
    return this.hub.lake;
  }

  tick() {
    const prev = this.state.phase;
    this.state = boatState(this.now() / 1000, this.interval);
    const { phase } = this.state;
    // Passengers who disconnected or left the lake lose their place.
    this.aboard = this.aboard.filter((p) => p.aboard && this.lake.players.get(p.id) === p);

    if (phase !== prev) {
      if (phase === 'arriving') this.lake.emitAll({ kind: 'boat', what: 'arriving' });
      if (phase === 'docked') {
        this.lastCall = false;
        this.lake.emitAll({ kind: 'boat', what: 'docked', seconds: Math.round(this.state.left) });
      }
      if (phase === 'departing') this.lake.emitAll({ kind: 'boat', what: 'departing', count: this.aboard.length });
      if (prev === 'departing') this.launch();
    }
    if (phase === 'docked' && !this.lastCall && this.state.left <= 30) {
      this.lastCall = true;
      this.lake.emitAll({ kind: 'boat', what: 'lastCall', seconds: 30 });
    }
    // Passengers ride along on deck.
    if (this.state.x != null) {
      this.aboard.forEach((p, i) => {
        const pos = boatSlot(this.state, i);
        p.x = pos.x;
        p.y = pos.y;
        p.facing = this.state.h + (i % 2 ? Math.PI / 2 : -Math.PI / 2); // looking out over the rail
      });
    }
  }

  /** Board, or step back off while still docked. */
  toggle(player) {
    if (player.room !== this.lake) return;
    if (player.aboard) {
      if (this.state.phase !== 'docked') return; // too late: you're going to sea
      this.aboard = this.aboard.filter((p) => p !== player);
      player.aboard = false;
      player.x = BOAT.landing.x + (Math.random() - 0.5) * 30;
      player.y = BOAT.landing.y + (Math.random() - 0.5) * 120;
      this.lake.emitTo(player, { kind: 'boat', what: 'left' });
      return;
    }
    if (this.state.phase !== 'docked') {
      this.lake.emitTo(player, { kind: 'info', message: 'The boat isn\'t docked right now.' });
      return;
    }
    if (Math.hypot(player.x - BOAT.dock.x, player.y - BOAT.dock.y) > BOAT.boardRange) {
      this.lake.emitTo(player, { kind: 'info', message: 'Walk up to the boat at the South Beach dock to board.' });
      return;
    }
    if (player.duel) {
      this.lake.emitTo(player, { kind: 'info', message: 'Finish your duel first.' });
      return;
    }
    if (player.line.state === FishingState.REELING) {
      this.lake.emitTo(player, { kind: 'info', message: 'Land your fish first!' });
      return;
    }
    player.line = newLine();
    player.input = { up: false, down: false, left: false, right: false };
    player.aboard = true;
    this.aboard.push(player);
    this.lake.duels?.playerLeft(player); // drops any pending challenge
    this.lake.emitTo(player, { kind: 'boat', what: 'boarded', seconds: Math.round(this.state.left) });
    this.lake.emitAll({ kind: 'boat', what: 'someoneBoarded', name: player.name, playerId: player.id, count: this.aboard.length });
  }

  /** The boat is out of sight: everyone aboard goes to sea. */
  launch() {
    const crew = this.aboard;
    this.aboard = [];
    if (crew.length) this.hub.startVoyage(crew);
  }

  /** What every lake client sees. */
  snapshot() {
    const s = this.state;
    const r1 = (v) => Math.round(v * 10) / 10;
    const out = { ph: s.phase, tl: Math.ceil(s.left), nd: Math.ceil(s.nextDock), n: this.aboard.length };
    if (s.x != null) Object.assign(out, { x: r1(s.x), y: r1(s.y), h: Math.round(s.h * 100) / 100 });
    return out;
  }
}
