// Player profiles (score, coins, gear, fish index, catch history), persisted
// to a single JSON file. Players are identified by a random secret token the
// browser keeps in localStorage; there are no accounts or passwords.
//
// This is intentionally simple. To move to a database later, keep the same
// getOrCreate() / markDirty() interface and swap the file I/O.

import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { defaultGear } from '../shared/gear.js';

export const HISTORY_LIMIT = 50;
const TOKEN_RE = /^[a-f0-9]{32}$/;
const SAVE_DELAY_MS = 2000;

export function newProfile(name = 'Angler') {
  return {
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
    this.profiles = new Map();
    this.dirty = false;
    this.timer = null;
  }

  async load() {
    if (!this.file) return;
    try {
      const data = JSON.parse(await readFile(this.file, 'utf8'));
      for (const [token, p] of Object.entries(data.profiles || {})) this.profiles.set(token, normalize(p));
      console.log(`Loaded ${this.profiles.size} player profiles from ${this.file}`);
    } catch (err) {
      if (err.code !== 'ENOENT') console.warn(`Could not read ${this.file}:`, err.message);
    }
  }

  /** Existing profile for a known token, otherwise a new profile and token. */
  getOrCreate(token, name) {
    if (typeof token === 'string' && TOKEN_RE.test(token) && this.profiles.has(token)) {
      return { token, profile: this.profiles.get(token) };
    }
    const newToken = randomBytes(16).toString('hex');
    const profile = newProfile(name);
    this.profiles.set(newToken, profile);
    this.markDirty();
    return { token: newToken, profile };
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
      await writeFile(tmp, JSON.stringify({ version: 1, profiles: Object.fromEntries(this.profiles) }));
      await rename(tmp, this.file); // atomic replace so a crash never leaves half a file
    } catch (err) {
      this.dirty = true;
      console.error('Failed to save profiles:', err.message);
    }
  }
}
