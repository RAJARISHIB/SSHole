import { apiFetch } from './client.js';

// Session groups and credential groups expose identical CRUD — build one
// small API module per endpoint instead of duplicating this twice.
export function createGroupsApi(basePath) {
  return {
    async listGroups() {
      const data = await apiFetch(basePath);
      return data.groups;
    },
    async createGroup(name) {
      const data = await apiFetch(basePath, { method: 'POST', body: { name } });
      return data.group;
    },
    async renameGroup(id, name) {
      const data = await apiFetch(`${basePath}/${encodeURIComponent(id)}`, { method: 'PUT', body: { name } });
      return data.group;
    },
    deleteGroup(id) {
      return apiFetch(`${basePath}/${encodeURIComponent(id)}`, { method: 'DELETE' });
    },
  };
}
