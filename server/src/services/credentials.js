import * as credentialsRepo from '../data/credentialsRepo.js';
import * as sessionsRepo from '../data/sessionsRepo.js';
import { assertGroupOwnership as assertCredentialGroupOwnership } from './credentialGroups.js';

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

function conflict(message, extra) {
  const err = new Error(message);
  err.status = 409;
  Object.assign(err, extra);
  return err;
}

// Never includes the encrypted secret — a credential's contents are only
// ever decrypted in memory on the server, at connect time.
function sanitizeCredential(credential) {
  return {
    id: credential.id,
    name: credential.name,
    type: credential.type,
    groupId: credential.groupId ?? null,
    createdAt: credential.createdAt,
    updatedAt: credential.updatedAt,
  };
}

function validateType(type) {
  if (type !== 'password' && type !== 'privateKey') {
    throw badRequest('type must be "password" or "privateKey".');
  }
}

export async function listCredentials(userId) {
  const credentials = await credentialsRepo.listCredentialsForUser(userId);
  return credentials.map(sanitizeCredential);
}

export async function createCredential(userId, input) {
  const name = (input?.name || '').trim();
  if (!name) throw badRequest('Name is required.');
  validateType(input?.type);

  const secret = input.type === 'privateKey' ? input.privateKey : input.password;
  if (!secret) throw badRequest('A password or private key is required.');

  const groupId = await assertCredentialGroupOwnership(userId, input.groupId);

  const credential = await credentialsRepo.createCredential(userId, {
    name,
    type: input.type,
    groupId,
    secret,
    passphrase: input.type === 'privateKey' ? input.passphrase : null,
  });
  return sanitizeCredential(credential);
}

export async function updateCredential(userId, id, input) {
  const existing = await credentialsRepo.getCredentialForUser(id, userId);
  if (!existing) return null;

  const patch = {};
  if (input.name !== undefined) {
    if (!input.name.trim()) throw badRequest('Name cannot be empty.');
    patch.name = input.name.trim();
  }
  if (input.groupId !== undefined) {
    patch.groupId = await assertCredentialGroupOwnership(userId, input.groupId);
  }

  // Replacing the secret is optional on edit — omit password/privateKey to
  // just rename/move the credential without touching what's stored.
  if (input.password !== undefined || input.privateKey !== undefined) {
    const type = input.type || existing.type;
    validateType(type);
    const secret = type === 'privateKey' ? input.privateKey : input.password;
    if (!secret) throw badRequest('A password or private key is required to replace the credential.');
    patch.type = type;
    patch.secret = secret;
    patch.passphrase = type === 'privateKey' ? input.passphrase : null;
  }

  const updated = await credentialsRepo.updateCredential(id, userId, patch);
  return updated ? sanitizeCredential(updated) : null;
}

export async function deleteCredential(userId, id) {
  const existing = await credentialsRepo.getCredentialForUser(id, userId);
  if (!existing) return false;

  // Never leave a session with a dangling credentialId, and never silently
  // fall back to "no credential" for a session the user didn't touch —
  // block the delete and tell the caller which sessions need to be
  // reassigned (to a different credential, or an inline one) first.
  const referencingSessions = await sessionsRepo.listSessionsReferencingCredential(id, userId);
  if (referencingSessions.length > 0) {
    throw conflict('This credential is still used by one or more sessions.', {
      referencingSessions: referencingSessions.map((s) => ({ id: s.id, name: s.name })),
    });
  }

  await credentialsRepo.deleteCredential(id, userId);
  return true;
}
