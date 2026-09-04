import crypto from 'crypto';
import { JsonStore } from './jsonStore.js';

// Session groups and credential groups are structurally identical
// (id/userId/name CRUD) — this factory builds one repo module per JSON
// file rather than duplicating the same logic twice.
export function createGroupsRepo(filePath) {
  const store = new JsonStore(filePath, []);

  return {
    async listGroupsForUser(userId) {
      const all = await store.read();
      return all.filter((g) => g.userId === userId);
    },

    async getGroupForUser(id, userId) {
      const all = await store.read();
      const group = all.find((g) => g.id === id);
      if (!group || group.userId !== userId) return null;
      return group;
    },

    async createGroup(userId, name) {
      return store.update((groups) => {
        const now = new Date().toISOString();
        const group = { id: crypto.randomUUID(), userId, name, createdAt: now, updatedAt: now };
        groups.push(group);
        return group;
      });
    },

    async renameGroup(id, userId, name) {
      return store.update((groups) => {
        const group = groups.find((g) => g.id === id);
        if (!group || group.userId !== userId) return null;
        group.name = name;
        group.updatedAt = new Date().toISOString();
        return group;
      });
    },

    async deleteGroup(id, userId) {
      return store.update((groups) => {
        const idx = groups.findIndex((g) => g.id === id && g.userId === userId);
        if (idx === -1) return null;
        const [removed] = groups.splice(idx, 1);
        return removed;
      });
    },
  };
}
