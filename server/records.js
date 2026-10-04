// The Hall of Records: the heaviest trophy fish of each species, all-time and
// this week, shared by every room. Saved with the profiles (see profiles.js).
//
// Only trophies and giants (shared/trophies.js) can make the records, and each
// angler holds at most one place per species per table (their heaviest).
// When a week ends, the top three of each species in that week's table win a
// coin prize, paid even to anglers who are offline (they hear about it next
// time they join).

import { SPECIES } from '../shared/fish.js';
import { RECORDS_ALL_TIME, RECORDS_WEEKLY, weekEnds, weekOf, weeklyPrize } from '../shared/trophies.js';

export class Records {
  /**
   * data: saved state from toJSON(), or null.
   * getProfile(profileId): a saved profile, to pay weekly prizes to.
   * onAward(profile, award): a prize was paid (the hub tells the angler).
   * announce(event): a new all-time record, for every room.
   * onChange(): something worth saving changed.
   */
  constructor({ data = null, now = () => Date.now(), getProfile = () => null, onAward = () => {}, announce = () => {}, onChange = () => {} } = {}) {
    this.now = now;
    this.getProfile = getProfile;
    this.onAward = onAward;
    this.announce = announce;
    this.onChange = onChange;
    this.week = data?.week ?? weekOf(now());
    this.allTime = clean(data?.allTime);
    this.weekly = clean(data?.weekly);
    this.tick(); // the server may have been down when the week ended
  }

  toJSON() {
    return { week: this.week, allTime: this.allTime, weekly: this.weekly };
  }

  /**
   * A trophy was landed. Returns { allTime, weekly }: the place (0 = 1st) it
   * took in each table, or null.
   */
  submit(profile, { species, kg, name, tier, zone }) {
    if (!tier || !SPECIES[species]) return { allTime: null, weekly: null };
    this.tick();
    const entry = { pid: profile.id, angler: profile.name, species, kg, name, tier, zone, at: this.now() };
    const allTime = insert(this.allTime, entry, RECORDS_ALL_TIME);
    const weekly = insert(this.weekly, entry, RECORDS_WEEKLY);
    if (allTime !== null || weekly !== null) this.onChange();
    if (allTime === 0) {
      profile.counters.recordsSet = (profile.counters.recordsSet || 0) + 1;
      this.announce({ kind: 'record', name: profile.name, species, speciesName: SPECIES[species].name, kg, fishName: name, tier });
    }
    return { allTime, weekly };
  }

  /** Close the week once it is over: pay the prizes and start a new table. */
  tick() {
    const week = weekOf(this.now());
    if (week === this.week) return;
    for (const [species, list] of Object.entries(this.weekly)) {
      list.forEach((e, place) => {
        const profile = this.getProfile(e.pid);
        const coins = weeklyPrize(species, place);
        if (!profile || !coins) return;
        profile.coins += coins;
        profile.counters.coinsEarned += coins;
        if (place === 0) profile.counters.weeklyWins = (profile.counters.weeklyWins || 0) + 1;
        this.onAward(profile, { kind: 'weeklyPrize', species, speciesName: SPECIES[species].name, place, coins, kg: e.kg, fishName: e.name });
      });
    }
    this.week = week;
    this.weekly = {};
    this.onChange();
  }

  /** The tables for the Records window. `mine` marks the asking angler's entries. */
  view(profileId) {
    const show = (e) => ({ angler: e.angler, kg: e.kg, name: e.name, tier: e.tier, zone: e.zone, at: e.at, ...(e.pid === profileId ? { mine: 1 } : {}) });
    const species = {};
    for (const id of new Set([...Object.keys(this.allTime), ...Object.keys(this.weekly)])) {
      species[id] = { all: (this.allTime[id] ?? []).map(show), week: (this.weekly[id] ?? []).map(show) };
    }
    return { week: this.week, endsAt: weekEnds(this.week), species };
  }
}

/** Put an entry in one species' table. Returns its place, or null if it didn't make it. */
function insert(table, entry, size) {
  const list = (table[entry.species] ??= []);
  const old = list.findIndex((e) => e.pid === entry.pid);
  if (old >= 0 && list[old].kg >= entry.kg) return null; // they already have a heavier one here
  if (old >= 0) list.splice(old, 1);
  let place = list.findIndex((e) => entry.kg > e.kg);
  if (place < 0) place = list.length;
  if (place >= size) return null;
  list.splice(place, 0, entry);
  list.length = Math.min(list.length, size);
  return place;
}

/** Saved tables, minus any species that no longer exist. */
function clean(tables) {
  const out = {};
  for (const [id, list] of Object.entries(tables ?? {})) if (SPECIES[id] && Array.isArray(list)) out[id] = list;
  return out;
}
