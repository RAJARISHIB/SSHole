import crypto from 'crypto';
import { AUTH_TOKEN_TTL_MS } from './constants.js';

// Opaque, random, server-side-only auth tokens (not JWTs — nothing for a
// client to decode or forge). Kept in memory: simple, and consistent with
// this app's "keep it simple" JSON-file persistence model, at the cost of
// logging everyone out on a server restart, which is an acceptable
// trade-off for this app's scope.
const tokens = new Map(); // token -> { userId, expiresAt }

export function createAuthToken(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  tokens.set(token, { userId, expiresAt: Date.now() + AUTH_TOKEN_TTL_MS });
  return token;
}

export function getAuthToken(token) {
  if (!token) return null;
  const entry = tokens.get(token);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    tokens.delete(token);
    return null;
  }
  return entry;
}

export function touchAuthToken(token) {
  const entry = tokens.get(token);
  if (entry) entry.expiresAt = Date.now() + AUTH_TOKEN_TTL_MS;
}

export function destroyAuthToken(token) {
  tokens.delete(token);
}
