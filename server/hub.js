// The Hub owns every room: the lake (always open) and any boat voyages that
// are out at sea. It moves players between rooms and routes their messages.
// Each room keeps its own players, events and snapshots; index.js broadcasts
// each room's state only to the players in it.

import { MSG } from '../shared/constants.js';
import { BOAT, VOYAGE } from '../shared/voyage.js';
import { DEFAULT_LOCATION, LOCATIONS } from '../shared/world.js';
import { Game, idSource } from './game.js';
import { Boat } from './boat.js';
import { Voyage } from './voyage.js';
import { newProfile } from './profiles.js';

export class Hub {
  /**
   * now(): ms since the epoch (drives the boat schedule).
   * boatInterval: seconds between boat visits. voyageTiming: see VOYAGE.
   */
  constructor({
    maxPlayers = 50, rng = Math.random, now = () => Date.now(), onProfileChange = () => {},
    boatInterval = BOAT.interval, voyageTiming = VOYAGE,
  } = {}) {
    this.maxPlayers = maxPlayers;
    this.rng = rng;
    this.onProfileChange = onProfileChange;
    this.voyageTiming = voyageTiming;
    this.ids = idSource();
    this.voyages = new Set();
    this.lake = new Game({
      world: LOCATIONS[DEFAULT_LOCATION],
      kind: 'lake',
      ids: this.ids,
      rng,
      maxPlayers: Infinity, // the hub enforces the total
      onProfileChange,
      hooks: { snapshot: () => ({ boat: this.boat.snapshot() }) },
    });
    this.boat = new Boat(this, { now, interval: boatInterval });
  }

  rooms() {
    return [this.lake, ...[...this.voyages].map((v) => v.game)];
  }

  get playerCount() {
    return this.rooms().reduce((n, r) => n + r.players.size, 0);
  }

  /** A new connection joins at the lake. */
  addPlayer(name, send, profile = newProfile()) {
    if (this.playerCount >= this.maxPlayers) return null;
    return this.lake.addPlayer(name, send, profile);
  }

  removePlayer(player) {
    player.room?.removePlayer(player.id);
  }

  handleMessage(player, msg) {
    if (msg.t === MSG.BOARD) {
      if (player.room === this.lake) this.boat.toggle(player);
      return;
    }
    player.room.handleMessage(player, msg);
  }

  tick(dt) {
    this.boat.tick();
    this.lake.tick(dt);
    for (const v of [...this.voyages]) v.tick(dt);
  }

  /** What a client needs to know about the room it is in. */
  roomInfo(player) {
    const voyage = [...this.voyages].find((v) => v.game === player.room);
    return voyage ? voyage.describe() : { room: 'lake' };
  }

  sendRoom(player) {
    player.send({ t: MSG.ROOM, ...this.roomInfo(player) });
  }

  /** The boat has sailed out of sight with these passengers. */
  startVoyage(crew) {
    const ready = crew.filter((p) => this.lake.players.get(p.id) === p);
    if (!ready.length) return null;
    for (const p of ready) this.lake.detach(p);
    const voyage = new Voyage({
      crew: ready,
      ids: this.ids,
      rng: this.rng,
      onProfileChange: this.onProfileChange,
      timing: this.voyageTiming,
      onEnd: (v) => this.endVoyage(v),
    });
    this.voyages.add(voyage);
    for (const p of ready) this.sendRoom(p);
    this.lake.emitAll({ kind: 'boat', what: 'sailed', count: ready.length });
    return voyage;
  }

  /** Bring everyone home to the dock. */
  endVoyage(voyage) {
    this.voyages.delete(voyage);
    for (const p of [...voyage.game.players.values()]) {
      voyage.game.detach(p);
      this.lake.attach(p, BOAT.landing.x + (this.rng() - 0.5) * 30, BOAT.landing.y - 100 + this.rng() * 200);
      this.sendRoom(p);
      this.lake.emitAll({ kind: 'join', playerId: p.id, name: p.name, fromSea: true });
    }
  }
}
