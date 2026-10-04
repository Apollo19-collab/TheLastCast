// The Hub owns every room: the lake (always open) and any boat voyages that
// are out at sea. It moves players between rooms and routes their messages.
// Each room keeps its own players, events and snapshots; index.js broadcasts
// each room's state only to the players in it.

import { WorldEvents } from './events.js';
import { Records } from './records.js';
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
   * records: saved Hall of Records data, getProfile(id): any saved profile
   * (for weekly prizes), onRecordsChange(): the records need saving.
   */
  constructor({
    maxPlayers = 50, rng = Math.random, now = () => Date.now(), onProfileChange = () => {},
    boatInterval = BOAT.interval, voyageTiming = VOYAGE, records = null, getProfile = () => null, onRecordsChange = () => {},
  } = {}) {
    this.maxPlayers = maxPlayers;
    this.rng = rng;
    this.onProfileChange = onProfileChange;
    this.voyageTiming = voyageTiming;
    this.ids = idSource();
    this.voyages = new Set();
    this.records = new Records({
      data: records,
      now,
      getProfile: (id) => this.onlineProfile(id) ?? getProfile(id),
      onAward: (profile, award) => this.award(profile, award),
      announce: (ev) => { for (const room of this.rooms()) room.emitAll(ev); },
      onChange: onRecordsChange,
    });
    this.lake = new Game({
      world: LOCATIONS[DEFAULT_LOCATION],
      kind: 'lake',
      ids: this.ids,
      rng,
      now,
      maxPlayers: Infinity, // the hub enforces the total
      onProfileChange,
      records: this.records,
      hooks: {
        snapshot: () => ({ boat: this.boat.snapshot(), we: this.lake.worldEvents.snapshot(), ts: Math.floor(now() / 1000) }),
        onCatch: (p, c) => this.lake.worldEvents.onCatch(p, c),
      },
    });
    this.lake.worldEvents = new WorldEvents(this.lake, { now });
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
    this.lake.worldEvents.tick(dt);
    this.records.tick();
    this.lake.tick(dt);
    for (const v of [...this.voyages]) v.tick(dt);
  }

  /** The player online with this profile, if any. */
  onlinePlayer(profileId) {
    if (!this.lake) return null; // still starting up
    for (const room of this.rooms()) for (const p of room.players.values()) if (p.profile.id === profileId) return p;
    return null;
  }

  onlineProfile(profileId) {
    return this.onlinePlayer(profileId)?.profile ?? null;
  }

  /** A weekly records prize was paid: tell the angler now, or next time they join. */
  award(profile, award) {
    const player = this.onlinePlayer(profile.id);
    if (player) {
      player.room.emitTo(player, award);
      player.room.checkAchievements(player);
      player.room.profileChanged(player);
    } else {
      profile.notices = [...(profile.notices ?? []), award].slice(-50);
      this.onProfileChange(null);
    }
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
      records: this.records,
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
