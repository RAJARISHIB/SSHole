import { createGroupsApi } from './groupsApiFactory.js';

export const { listGroups, createGroup, renameGroup, deleteGroup } = createGroupsApi('/api/credential-groups');
