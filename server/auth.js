// Password hashing, token helpers and input validation for accounts.
// Uses Node's built-in scrypt, so there are no native dependencies.

import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb);
const KEY_LENGTH = 64;

export const USERNAME_RE = /^[A-Za-z0-9_]{3,16}$/;
export const MIN_PASSWORD = 6;
export const MAX_PASSWORD = 128;

/** Returns an error message, or null if the username is acceptable. */
export function checkUsername(username) {
  if (typeof username !== 'string' || !USERNAME_RE.test(username)) {
    return 'Usernames are 3-16 characters: letters, numbers and underscores.';
  }
  return null;
}

/** Returns an error message, or null if the password is acceptable. */
export function checkPassword(password) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD) {
    return `Passwords need at least ${MIN_PASSWORD} characters.`;
  }
  if (password.length > MAX_PASSWORD) return `Passwords can be at most ${MAX_PASSWORD} characters.`;
  return null;
}

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, KEY_LENGTH);
  return { salt: salt.toString('hex'), hash: key.toString('hex') };
}

export async function verifyPassword(password, { salt, hash }) {
  if (typeof password !== 'string' || password.length > MAX_PASSWORD) return false;
  const key = await scrypt(password, Buffer.from(salt, 'hex'), KEY_LENGTH);
  const expected = Buffer.from(hash, 'hex');
  return expected.length === key.length && timingSafeEqual(key, expected);
}

/** A new random secret token (session or guest), 32 hex chars. */
export function newToken() {
  return randomBytes(16).toString('hex');
}

/** Tokens are stored hashed so a leaked save file can't be used to log in. */
export function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

export const TOKEN_RE = /^[a-f0-9]{32}$/;

/**
 * Throttles failed logins per key (IP address): `max` failures per `windowMs`.
 */
export class LoginLimiter {
  constructor({ max = 10, windowMs = 10 * 60 * 1000 } = {}) {
    this.max = max;
    this.windowMs = windowMs;
    this.failures = new Map(); // key -> { count, resetAt }
  }

  blocked(key) {
    const f = this.failures.get(key);
    if (!f) return false;
    if (Date.now() > f.resetAt) { this.failures.delete(key); return false; }
    return f.count >= this.max;
  }

  fail(key) {
    const f = this.failures.get(key);
    if (!f || Date.now() > f.resetAt) this.failures.set(key, { count: 1, resetAt: Date.now() + this.windowMs });
    else f.count += 1;
  }

  succeed(key) {
    this.failures.delete(key);
  }
}
