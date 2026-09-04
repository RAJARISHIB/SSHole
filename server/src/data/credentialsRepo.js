import crypto from 'crypto';
import { JsonStore } from './jsonStore.js';
import { CREDENTIALS_FILE } from './paths.js';
import { encryptSecret, decryptSecret } from '../crypto/secretBox.js';

// Standalone, reusable credentials: NOT owned by any one session. A
// session references one by id (credentialId) instead of embedding it, so
// editing a credential here changes what every referencing session uses on
// its next connection, without ever copying the secret around.
const store = new JsonStore(CREDENTIALS_FILE, []);

export async function listCredentialsForUser(userId) {
  const all = await store.read();
  return all.filter((c) => c.userId === userId);
}

export async function getCredentialForUser(id, userId) {
  const all = await store.read();
  const credential = all.find((c) => c.id === id);
  if (!credential || credential.userId !== userId) return null;
  return credential;
}

export async function createCredential(userId, { name, type, groupId, secret, passphrase }) {
  return store.update((credentials) => {
    const now = new Date().toISOString();
    const credential = {
      id: crypto.randomUUID(),
      userId,
      groupId: groupId ?? null,
      name,
      type, // 'password' | 'privateKey'
      secret: encryptSecret(secret),
      passphrase: passphrase ? encryptSecret(passphrase) : null,
      createdAt: now,
      updatedAt: now,
    };
    credentials.push(credential);
    return credential;
  });
}

// `patch` may include name/groupId, and optionally a new type/secret/passphrase
// to replace the stored secret. Only the fields provided are changed.
export async function updateCredential(id, userId, patch) {
  return store.update((credentials) => {
    const credential = credentials.find((c) => c.id === id);
    if (!credential || credential.userId !== userId) return null;

    if (patch.name !== undefined) credential.name = patch.name;
    if (patch.groupId !== undefined) credential.groupId = patch.groupId;
    if (patch.secret !== undefined) {
      credential.type = patch.type;
      credential.secret = encryptSecret(patch.secret);
      credential.passphrase = patch.passphrase ? encryptSecret(patch.passphrase) : null;
    }
    credential.updatedAt = new Date().toISOString();
    return credential;
  });
}

export async function deleteCredential(id, userId) {
  return store.update((credentials) => {
    const idx = credentials.findIndex((c) => c.id === id && c.userId === userId);
    if (idx === -1) return null;
    const [removed] = credentials.splice(idx, 1);
    return removed;
  });
}

// Used when a credential group is deleted: its credentials are ungrouped
// (kept, groupId cleared) rather than deleted.
export async function clearGroupFromCredentials(groupId, userId) {
  return store.update((credentials) => {
    let count = 0;
    const now = new Date().toISOString();
    for (const credential of credentials) {
      if (credential.userId === userId && credential.groupId === groupId) {
        credential.groupId = null;
        credential.updatedAt = now;
        count += 1;
      }
    }
    return count;
  });
}

// Decrypts in memory and returns the plaintext secret. Only ever called
// from the backend SSH-connect path — the result must never be sent to a
// client verbatim.
export async function decryptCredentialForUser(id, userId) {
  const credential = await getCredentialForUser(id, userId);
  if (!credential) return null;
  return {
    type: credential.type,
    secret: decryptSecret(credential.secret),
    passphrase: credential.passphrase ? decryptSecret(credential.passphrase) : null,
  };
}
