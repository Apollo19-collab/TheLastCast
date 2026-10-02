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
import { defaultGear } from '../shared/gear.js';
import {
  TOKEN_RE, checkPassword, checkUsername, hashPassword, hashToken, newToken, verifyPassword,
} from './auth.js';

export const HISTORY_LIMIT = 50;
const SAVE_DELAY_MS = 2000;
const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days
const BAD_LOGIN = 'Wrong username or password.';

export function newProfile(name = 'Angler') {
  return {
    id: newToken(),
    username: null, // set when the profile belongs to an account
    name,
    score: 0,
    coins: 0,
    catches: 0,
    best: null, // { species, kg, points }
    gear: defaultGear(), // slot -> owned tier index
    index: {}, // species id -> { count, bestKg, firstAt }
    history: [], // newest first: { species, kg, points, zone, hotspot, at }
    createdAt: Date.now(),
  };
}

// Fill in fields added in later versions so old save files keep working.
function normalize(saved) {
  const base = newProfile(saved.name);
  return { ...base, ...saved, gear: { ...base.gear, ...saved.gear } };
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
