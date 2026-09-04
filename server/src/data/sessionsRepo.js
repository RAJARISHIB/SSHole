import crypto from 'crypto';
import { JsonStore } from './jsonStore.js';
import { SESSIONS_FILE } from './paths.js';

const store = new JsonStore(SESSIONS_FILE, []);

export async function listSessionsForUser(userId) {
  const all = await store.read();
  return all.filter((s) => s.userId === userId);
}

// Returns the raw session only if it belongs to userId — never leaks
// another user's session, not even its existence.
export async function getSessionForUser(id, userId) {
  const all = await store.read();
  const session = all.find((s) => s.id === id);
  if (!session || session.userId !== userId) return null;
  return session;
}

export async function createSession(userId, data) {
  return store.update((sessions) => {
    const now = new Date().toISOString();
    const session = {
      id: crypto.randomUUID(),
      userId,
      name: data.name,
      host: data.host,
      port: data.port,
      username: data.username,
      authenticationType: data.authenticationType,
      groupId: data.groupId ?? null,
      // Exactly one credential source at a time is enforced by the service
      // layer (services/savedSessions.js) before this is ever called — this
      // repo just persists whatever it's handed.
      credentialId: data.credentialId ?? null,
      inlineCredential: data.inlineCredential ?? null,
      createdAt: now,
      updatedAt: now,
    };
    sessions.push(session);
    return session;
  });
}

export async function updateSession(id, userId, patch) {
  return store.update((sessions) => {
    const session = sessions.find((s) => s.id === id);
    if (!session || session.userId !== userId) return null;
    Object.assign(session, patch, { updatedAt: new Date().toISOString() });
    return session;
  });
}

export async function deleteSession(id, userId) {
  return store.update((sessions) => {
    const idx = sessions.findIndex((s) => s.id === id && s.userId === userId);
    if (idx === -1) return null;
    const [removed] = sessions.splice(idx, 1);
    return removed;
  });
}

// Used to block deleting a credential that's still referenced, and to show
// the user which sessions use it.
export async function listSessionsReferencingCredential(credentialId, userId) {
  const all = await store.read();
  return all.filter((s) => s.userId === userId && s.credentialId === credentialId);
}

// Used when a group is deleted: its sessions are ungrouped (kept, with
// groupId cleared) rather than deleted, so removing a group never destroys
// saved credentials.
export async function clearGroupFromSessions(groupId, userId) {
  return store.update((sessions) => {
    let count = 0;
    const now = new Date().toISOString();
    for (const session of sessions) {
      if (session.userId === userId && session.groupId === groupId) {
        session.groupId = null;
        session.updatedAt = now;
        count += 1;
      }
    }
    return count;
  });
}
