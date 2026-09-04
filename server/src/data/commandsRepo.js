import crypto from 'crypto';
import { JsonStore } from './jsonStore.js';
import { COMMANDS_FILE } from './paths.js';

// Personal and global commands share one file — a `visibility` field
// ('personal' | 'global') tells them apart, which is what lets a personal
// command be "converted" to global with a plain field update instead of a
// delete-and-recreate across two collections.
const store = new JsonStore(COMMANDS_FILE, []);

export async function listPersonalCommandsForUser(userId) {
  const all = await store.read();
  return all.filter((c) => c.visibility === 'personal' && c.ownerId === userId);
}

export async function listGlobalCommands() {
  const all = await store.read();
  return all.filter((c) => c.visibility === 'global');
}

// No ownership filter — callers (the service layer) apply personal/global
// visibility and edit-permission rules themselves, since those rules
// differ from a simple "you own it" check.
export async function getCommandById(id) {
  const all = await store.read();
  return all.find((c) => c.id === id) || null;
}

export async function createCommand(ownerId, { name, command, category, visibility, editPermission }) {
  return store.update((commands) => {
    const now = new Date().toISOString();
    const entry = {
      id: crypto.randomUUID(),
      ownerId,
      visibility, // 'personal' | 'global'
      editPermission: visibility === 'global' ? editPermission : null, // 'owner_only' | 'everyone'
      name,
      command,
      category: category || null,
      createdAt: now,
      updatedAt: now,
    };
    commands.push(entry);
    return entry;
  });
}

// No ownership filter here either — the service layer has already decided
// this write is allowed by the time it calls this.
export async function updateCommand(id, patch) {
  return store.update((commands) => {
    const entry = commands.find((c) => c.id === id);
    if (!entry) return null;
    Object.assign(entry, patch, { updatedAt: new Date().toISOString() });
    return entry;
  });
}

export async function deleteCommand(id) {
  return store.update((commands) => {
    const idx = commands.findIndex((c) => c.id === id);
    if (idx === -1) return null;
    const [removed] = commands.splice(idx, 1);
    return removed;
  });
}
