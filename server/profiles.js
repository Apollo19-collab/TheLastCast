// Player profiles (score, coins, gear, fish index, catch history) and the
// ways to reach them, persisted to a single JSON file:
//
//   accounts:     username + password (scrypt hash)  -> profile
//   sessions:     secret token from a login          -> profile   (stay logged in)
//   guestTokens:  secret token from guest play       -> profile   (no account yet)
//
// Tokens are stored hashed. Signing up while playing as a guest turns that
// guest profile into the account, so no progress is lost.
//
// To move to a database later, keep this class's public methods and swap the
// file I/O.

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ITEMS, STARTER, isConsumable, starterInventory } from '../shared/gear.js';
import { newCounters } from '../shared/achievements.js';
import { ARMOUR, ARMOUR_SLOTS, emptyArmour } from '../shared/armour.js';
import { PETS } from '../shared/pets.js';
import { SPECIES } from '../shared/fish.js';
import {
  TOKEN_RE, checkPassword, checkUsername, hashPassword, hashToken, newToken, verifyPassword,
} from './auth.js';

export const HISTORY_LIMIT = 50;
const SAVE_DELAY_MS = 2000;
const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days
const BAD_LOGIN = 'Wrong username or password.';
const OWNED_BAIT_USES = 40; // uses given for each bait owned before bait became consumable

export function newProfile(name = 'Angler') {
  return {
    id: newToken(),
    username: null, // set when the profile belongs to an account
    name,
    score: 0,
    coins: 0,
    catches: 0,
    best: null, // { species, kg, points }
    inventory: starterInventory(), // owned rods, reels and lines (see shared/gear.js)
    bait: {}, // consumable bait and lures: item id -> uses left
    chum: 0, // chum buckets in your bag (shared/chum.js)
    xp: 0, // total XP; your level comes from this (shared/levels.js)
    armourOwned: [], // armour piece ids (shared/armour.js)
    armour: emptyArmour(), // slot -> piece id or null
    pets: [], // pet ids you own (shared/pets.js)
    pet: null, // the pet with you
    equipped: { ...STARTER }, // slot -> item id
    achievements: {}, // achievement id -> time earned
    counters: newCounters(), // lifetime stats that achievements measure
    index: {}, // species id -> { count, bestKg, firstAt }
    history: [], // newest first: { species, kg, points, zone, hotspot, at }
    trophies: [], // Trophy Cabinet, newest first: { species, kg, name, tier, zone, at } (shared/trophies.js)
    notices: [], // news for the next time you join, e.g. a weekly records prize
    createdAt: Date.now(),
  };
}

// Tiered gear from versions before 0.7, by slot and tier.
const OLD_TIERS = {
  rod: ['willow', 'fiberglass', 'carbon', 'master'],
  reel: ['rusty', 'spinning', 'baitcaster', 'tournament'],
  bait: ['bread', 'worms', 'spinner', 'goldlure'],
};

/** Fill in fields added in later versions so old save files keep working. */
export function normalize(saved) {
  const base = newProfile(saved.name);
  const p = { ...base, ...saved, counters: { ...base.counters, ...saved.counters } };
  if (saved.gear && !saved.inventory) {
    // 0.2-0.6: { rod: tier, reel: tier, bait: tier }. Keep everything bought
    // (even items that now need an achievement) and equip the best of each.
    const owned = new Set(starterInventory());
    let spent = 0;
    for (const [slot, tiers] of Object.entries(OLD_TIERS)) {
      const tier = Math.min(saved.gear[slot] | 0, tiers.length - 1);
      for (let i = 0; i <= tier; i++) {
        owned.add(tiers[i]);
        spent += ITEMS[tiers[i]].price;
      }
      p.equipped[slot] = tiers[tier];
    }
    p.inventory = [...owned];
    p.counters.coinsSpent = spent;
  }
  delete p.gear;
  if (!saved.counters) backfillCounters(p);
  if (!saved.bait) {
    // Before 0.9 bait was bought once and kept forever. Turn each bait you
    // owned into a generous stock of uses.
    p.bait = {};
    for (const id of p.inventory) if (isConsumable(id)) p.bait[id] = OWNED_BAIT_USES;
  }
  p.inventory = p.inventory.filter((id) => ITEMS[id] && !isConsumable(id));
  // Before 0.10 there were no levels: start from your score (1 XP per point).
  if (saved.xp == null) p.xp = saved.score || 0;
  p.armourOwned = (p.armourOwned || []).filter((id) => ARMOUR[id]);
  p.armour = { ...emptyArmour(), ...p.armour };
  for (const slot of ARMOUR_SLOTS) {
    const id = p.armour[slot];
    if (id && (ARMOUR[id]?.slot !== slot || !p.armourOwned.includes(id))) p.armour[slot] = null;
  }
  p.chum = Math.max(0, p.chum | 0);
  p.trophies = Array.isArray(p.trophies) ? p.trophies.filter((t) => SPECIES[t?.species]) : [];
  p.notices = Array.isArray(p.notices) ? p.notices : [];
  p.pets = [...new Set((p.pets || []).filter((id) => PETS[id]))];
  if (!p.pets.includes(p.pet)) p.pet = null;
  p.bait = { ...p.bait };
  for (const id of Object.keys(p.bait)) if (!isConsumable(id) || !(p.bait[id] > 0)) delete p.bait[id];
  for (const [slot, id] of Object.entries(STARTER)) {
    if (!p.inventory.includes(id)) p.inventory.push(id);
    const eq = p.equipped[slot];
    const have = isConsumable(eq) ? p.bait[eq] > 0 : p.inventory.includes(eq);
    if (ITEMS[eq]?.slot !== slot || !have) p.equipped[slot] = id;
  }
  return p;
}

/** Rebuild what we can of the lifetime counters from the Fish Index. */
function backfillCounters(p) {
  const c = p.counters;
  c.catches = p.catches || 0;
  c.coinsEarned = p.score || 0;
  for (const [id, e] of Object.entries(p.index || {})) {
    const s = SPECIES[id];
    if (!s) continue;
    c.family[s.family] = (c.family[s.family] || 0) + e.count;
    if (s.rarity === 'legendary') c.legendaryCatches += e.count;
    if (s.rarity === 'mythic') c.mythicCatches += e.count;
    c.heaviest = Math.max(c.heaviest, e.bestKg || 0);
    if ((e.bestKg || 0) >= 10) c.bigFish += 1; // at least the best one
  }
  for (const h of p.history || []) if (h.hotspot) c.hotspotCatches += 1;
}

export class ProfileStore {
  /** @param {string|null} file  JSON file path, or null for memory only (tests). */
  constructor(file) {
    this.file = file;
    this.profiles = new Map(); // profile id -> profile
    this.accounts = new Map(); // lowercase username -> { profileId, salt, hash }
    this.sessions = new Map(); // hashed token -> { profileId, createdAt }
    this.guestTokens = new Map(); // hashed token -> profile id
    this.dirty = false;
    this.timer = null;
    this.records = null; // the Hall of Records (server/records.js), saved in the same file
    this.recordsData = null; // ...as loaded, until it is created
  }

  // ---- persistence -------------------------------------------------------------

  async load() {
    if (!this.file) return;
    let data;
    try {
      data = JSON.parse(await readFile(this.file, 'utf8'));
    } catch (err) {
      if (err.code !== 'ENOENT') console.warn(`Could not read ${this.file}:`, err.message);
      return;
    }
    if (data.version === 1) {
      // v1 stored guest profiles keyed directly by their (unhashed) token.
      for (const [token, p] of Object.entries(data.profiles || {})) {
        const profile = normalize({ ...p, id: newToken() });
        this.profiles.set(profile.id, profile);
        this.guestTokens.set(hashToken(token), profile.id);
      }
      this.markDirty();
    } else {
      for (const [id, p] of Object.entries(data.profiles || {})) this.profiles.set(id, normalize({ ...p, id }));
      for (const [k, v] of Object.entries(data.accounts || {})) this.accounts.set(k, v);
      for (const [k, v] of Object.entries(data.guestTokens || {})) this.guestTokens.set(k, v);
      this.recordsData = data.records ?? null;
      const now = Date.now();
      for (const [k, v] of Object.entries(data.sessions || {})) {
        if (now - v.createdAt < SESSION_TTL_MS) this.sessions.set(k, v);
      }
    }
    console.log(`Loaded ${this.profiles.size} profiles (${this.accounts.size} accounts) from ${this.file}`);
  }

  markDirty() {
    this.dirty = true;
    if (this.file && !this.timer) this.timer = setTimeout(() => this.flush(), SAVE_DELAY_MS);
  }

  async flush() {
    clearTimeout(this.timer);
    this.timer = null;
    if (!this.file || !this.dirty) return;
    this.dirty = false;
    try {
      await mkdir(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      await writeFile(tmp, JSON.stringify({
        version: 2,
        profiles: Object.fromEntries(this.profiles),
        accounts: Object.fromEntries(this.accounts),
        sessions: Object.fromEntries(this.sessions),
        guestTokens: Object.fromEntries(this.guestTokens),
        records: this.records?.toJSON() ?? this.recordsData,
      }));
      await rename(tmp, this.file); // atomic replace so a crash never leaves half a file
    } catch (err) {
      this.dirty = true;
      console.error('Failed to save profiles:', err.message);
    }
  }

  // ---- guests -------------------------------------------------------------------

  getGuest(token) {
    if (typeof token !== 'string' || !TOKEN_RE.test(token)) return null;
    return this.profiles.get(this.guestTokens.get(hashToken(token))) ?? null;
  }

  createGuest(name) {
    const token = newToken();
    const profile = newProfile(name);
    this.profiles.set(profile.id, profile);
    this.guestTokens.set(hashToken(token), profile.id);
    this.markDirty();
    return { token, profile };
  }

  // ---- accounts -----------------------------------------------------------------

  /**
   * Create an account. If `guestToken` belongs to a guest profile, that
   * profile (and its progress) becomes the account's profile.
   * Returns { profile, session } or { error }.
   */
  async register(username, password, guestToken = null) {
    const invalid = checkUsername(username) || checkPassword(password);
    if (invalid) return { error: invalid };
    const key = username.toLowerCase();
    if (this.accounts.has(key)) return { error: 'That username is taken.' };

    const creds = await hashPassword(password);
    if (this.accounts.has(key)) return { error: 'That username is taken.' }; // lost a race while hashing

    let profile = this.getGuest(guestToken);
    if (profile) this.guestTokens.delete(hashToken(guestToken)); // the guest token no longer opens it
    else {
      profile = newProfile(username);
      this.profiles.set(profile.id, profile);
    }
    profile.username = username;
    profile.name = username;
    this.accounts.set(key, { profileId: profile.id, ...creds });
    return { profile, session: this.createSession(profile.id) };
  }

  /** Returns { profile, session } or { error }. */
  async login(username, password) {
    const account = typeof username === 'string' ? this.accounts.get(username.toLowerCase()) : null;
    if (!account) {
      // Hash anyway so response time doesn't reveal which usernames exist.
      await hashPassword(typeof password === 'string' ? password.slice(0, 128) : '');
      return { error: BAD_LOGIN };
    }
    if (!(await verifyPassword(password, account))) return { error: BAD_LOGIN };
    return { profile: this.profiles.get(account.profileId), session: this.createSession(account.profileId) };
  }

  createSession(profileId) {
    const token = newToken();
    this.sessions.set(hashToken(token), { profileId, createdAt: Date.now() });
    this.markDirty();
    return token;
  }

  /** Profile for a login session token, or null if unknown or expired. */
  getSession(token) {
    if (typeof token !== 'string' || !TOKEN_RE.test(token)) return null;
    const key = hashToken(token);
    const s = this.sessions.get(key);
    if (!s) return null;
    if (Date.now() - s.createdAt > SESSION_TTL_MS) {
      this.sessions.delete(key);
      this.markDirty();
      return null;
    }
    return this.profiles.get(s.profileId) ?? null;
  }

  revokeSession(token) {
    if (typeof token === 'string' && this.sessions.delete(hashToken(token))) this.markDirty();
  }
}
