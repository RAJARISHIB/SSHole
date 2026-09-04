import crypto from 'crypto';
import { JsonStore } from './jsonStore.js';
import { USERS_FILE } from './paths.js';
import { hashPassword, verifyPassword, DUMMY_PASSWORD_HASH } from '../auth/passwordHash.js';

const store = new JsonStore(USERS_FILE, []);

function sanitize(user) {
  return { id: user.id, username: user.username, createdAt: user.createdAt };
}

export async function createUser(username, password) {
  return store.update((users) => {
    const normalized = username.trim().toLowerCase();
    if (users.some((u) => u.username.toLowerCase() === normalized)) {
      const err = new Error('That username is already taken.');
      err.status = 409;
      throw err;
    }
    const user = {
      id: crypto.randomUUID(),
      username: username.trim(),
      passwordHash: hashPassword(password),
      createdAt: new Date().toISOString(),
    };
    users.push(user);
    return sanitize(user);
  });
}

export async function verifyCredentials(username, password) {
  const users = await store.read();
  const normalized = username.trim().toLowerCase();
  const user = users.find((u) => u.username.toLowerCase() === normalized);
  if (!user) {
    // Burn comparable CPU time to a real verification so response timing
    // doesn't reveal whether the username exists.
    verifyPassword(password, DUMMY_PASSWORD_HASH);
    return null;
  }
  if (!verifyPassword(password, user.passwordHash)) return null;
  return sanitize(user);
}

export async function getUserById(id) {
  const users = await store.read();
  const user = users.find((u) => u.id === id);
  return user ? sanitize(user) : null;
}
