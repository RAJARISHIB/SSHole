import * as sessionsRepo from '../data/sessionsRepo.js';
import * as credentialsRepo from '../data/credentialsRepo.js';
import { assertGroupOwnership } from './sessionGroups.js';
import { encryptSecret, decryptSecret } from '../crypto/secretBox.js';

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

// Never includes a decryptable secret. `credentialId` IS exposed (unlike a
// secret, an id is harmless and the UI needs it to preselect the current
// credential when editing) but only when the session actually references
// one. `hasSavedKey` is a plain convenience flag (true unless the session's
// credential source is 'none') kept for the UI's connect/prompt branching.
//
// `username` is resolved fresh here rather than trusted from the stored
// row: for a 'reference' session it's never stored on the session at all
// (the referenced credential is the single source of truth, exactly like
// its password/key — never copied, always looked up), so this needs the
// credential lookup and is therefore async.
async function sanitizeSession(session) {
  const credentialSource = session.credentialId ? 'reference' : session.inlineCredential ? 'inline' : 'none';

  let username = session.username;
  if (credentialSource === 'reference') {
    const credential = await credentialsRepo.getCredentialForUser(session.credentialId, session.userId);
    username = credential ? credential.username : null;
  }

  return {
    id: session.id,
    name: session.name,
    host: session.host,
    port: session.port,
    username,
    authenticationType: session.authenticationType,
    groupId: session.groupId ?? null,
    credentialSource,
    credentialId: credentialSource === 'reference' ? session.credentialId : null,
    hasSavedKey: credentialSource !== 'none',
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
}

function validatePort(port) {
  const p = Number(port);
  if (!Number.isInteger(p) || p < 1 || p > 65535) {
    throw badRequest('Port must be between 1 and 65535.');
  }
  return p;
}

function validateAuthType(authenticationType) {
  if (authenticationType !== 'password' && authenticationType !== 'privateKey') {
    throw badRequest('authenticationType must be "password" or "privateKey".');
  }
}

/**
 * Resolves the credentialMode ('none' | 'reference' | 'inline', default
 * 'none') into the { authenticationType, credentialId, inlineCredential,
 * username } a session row actually stores — always exactly one of
 * credentialId / inlineCredential, never both (enforced by construction:
 * every branch below sets both explicitly).
 *
 * 'reference' derives both authenticationType *and* username from the
 * credential and stores neither on the session itself — the UI never asks
 * for a username in this mode, and none is persisted redundantly.
 * 'inline'/'none' still need their own username (there's no credential to
 * derive it from); `fallback` supplies the session's existing
 * authenticationType/username on update, when the caller isn't touching
 * those fields directly.
 */
async function resolveCredentialFields(userId, input, fallback = {}) {
  const mode = input.credentialMode || 'none';

  if (mode === 'reference') {
    const credentialId = input.credentialId;
    if (!credentialId) throw badRequest('credentialId is required for credentialMode "reference".');
    const credential = await credentialsRepo.getCredentialForUser(credentialId, userId);
    if (!credential) throw badRequest('Credential not found.');
    return { authenticationType: credential.type, credentialId, inlineCredential: null, username: null };
  }

  const username = (input.username !== undefined ? input.username : fallback.username || '').trim();
  if (!username) throw badRequest('Username is required.');

  if (mode === 'inline') {
    const authenticationType = input.authenticationType;
    validateAuthType(authenticationType);
    const secret = authenticationType === 'privateKey' ? input.privateKey : input.password;
    if (!secret) throw badRequest('A password or private key is required for credentialMode "inline".');
    const inlineCredential = {
      type: authenticationType,
      secret: encryptSecret(secret),
      passphrase: authenticationType === 'privateKey' && input.passphrase ? encryptSecret(input.passphrase) : null,
    };
    return { authenticationType, credentialId: null, inlineCredential, username };
  }

  // 'none': no credential stored — the user will be prompted at connect
  // time. Still need to know password-vs-key so the prompt asks for the
  // right thing, and a username since there's no credential to supply one.
  const authenticationType = input.authenticationType || fallback.authenticationType;
  validateAuthType(authenticationType);
  return { authenticationType, credentialId: null, inlineCredential: null, username };
}

export async function listSessions(userId) {
  const sessions = await sessionsRepo.listSessionsForUser(userId);
  return Promise.all(sessions.map(sanitizeSession));
}

export async function createSession(userId, input) {
  const { name, host } = input || {};
  if (!name || !name.trim()) throw badRequest('Name is required.');
  if (!host || !host.trim()) throw badRequest('Host is required.');
  const port = validatePort(input.port ?? 22);
  const groupId = await assertGroupOwnership(userId, input.groupId);
  const credentialFields = await resolveCredentialFields(userId, input);

  const session = await sessionsRepo.createSession(userId, {
    name: name.trim(),
    host: host.trim(),
    port,
    groupId,
    ...credentialFields,
  });

  return sanitizeSession(session);
}

export async function updateSession(userId, id, input) {
  const existing = await sessionsRepo.getSessionForUser(id, userId);
  if (!existing) return null;

  const patch = {};
  if (input.name !== undefined) {
    if (!input.name.trim()) throw badRequest('Name cannot be empty.');
    patch.name = input.name.trim();
  }
  if (input.host !== undefined) {
    if (!input.host.trim()) throw badRequest('Host cannot be empty.');
    patch.host = input.host.trim();
  }
  if (input.port !== undefined) {
    patch.port = validatePort(input.port);
  }
  if (input.groupId !== undefined) {
    // null/'' explicitly moves the session out of any group ("ungrouped").
    patch.groupId = await assertGroupOwnership(userId, input.groupId);
  }

  // credentialMode is only touched when the caller explicitly asks to
  // change the credential source; otherwise the existing source (and its
  // stored secret/reference/username) is left completely untouched.
  if (input.credentialMode !== undefined) {
    const credentialFields = await resolveCredentialFields(userId, input, {
      authenticationType: existing.authenticationType,
      username: existing.username,
    });
    Object.assign(patch, credentialFields);
  } else if (existing.credentialId) {
    // Referencing a credential: username/authenticationType are derived
    // from it, not independently editable — the frontend never sends these
    // in this mode, and silently ignoring rather than erroring keeps a
    // stray field from breaking an otherwise-valid host/port/name edit.
  } else {
    if (input.authenticationType !== undefined) {
      validateAuthType(input.authenticationType);
      patch.authenticationType = input.authenticationType;
    }
    if (input.username !== undefined) {
      if (!input.username.trim()) throw badRequest('Username cannot be empty.');
      patch.username = input.username.trim();
    }
  }

  const updated = await sessionsRepo.updateSession(id, userId, patch);
  return updated ? sanitizeSession(updated) : null;
}

export async function deleteSession(userId, id) {
  const existing = await sessionsRepo.getSessionForUser(id, userId);
  if (!existing) return false;
  // Referenced credentials are standalone/reusable and are NOT deleted here
  // — other sessions may still use them, and even if none do, credential
  // lifecycle is managed explicitly via the Credentials panel. An inline
  // credential is embedded in the session document itself, so it's removed
  // automatically along with the session — nothing extra to clean up.
  await sessionsRepo.deleteSession(id, userId);
  return true;
}

/**
 * Resolves everything needed to open an SSH connection for a saved session,
 * verifying ownership first. `overrides` (password/privateKey/passphrase),
 * when given, are used as-is instead of the stored credential — this covers
 * connecting to a saved session that has no stored credential (or
 * supplying one just for this connection). Returns null if the session
 * doesn't exist or doesn't belong to userId.
 */
export async function resolveConnectionConfig(userId, savedSessionId, overrides = {}) {
  const session = await sessionsRepo.getSessionForUser(savedSessionId, userId);
  if (!session) return null;

  let { password, privateKey, passphrase } = overrides;
  let username = session.username;

  if (session.credentialId) {
    const credential = await credentialsRepo.decryptCredentialForUser(session.credentialId, userId);
    if (credential) {
      // Always derived from the credential — independent of whether the
      // secret itself came from an override — since a reference-mode
      // session never has its own username to fall back to.
      username = credential.username;
      if (password === undefined && privateKey === undefined) {
        if (credential.type === 'password') password = credential.secret;
        else privateKey = credential.secret;
        passphrase = credential.passphrase || undefined;
      }
    }
  } else if (session.inlineCredential && password === undefined && privateKey === undefined) {
    const inline = session.inlineCredential;
    const secret = decryptSecret(inline.secret);
    if (inline.type === 'password') password = secret;
    else privateKey = secret;
    passphrase = inline.passphrase ? decryptSecret(inline.passphrase) : undefined;
  }

  return {
    host: session.host,
    port: session.port,
    username,
    authMethod: session.authenticationType,
    password,
    privateKey,
    passphrase,
  };
}
