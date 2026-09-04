import { createGroupsRepo } from './groupsRepoFactory.js';
import { SESSION_GROUPS_FILE } from './paths.js';

export const {
  listGroupsForUser: listSessionGroupsForUser,
  getGroupForUser: getSessionGroupForUser,
  createGroup: createSessionGroup,
  renameGroup: renameSessionGroup,
  deleteGroup: deleteSessionGroup,
} = createGroupsRepo(SESSION_GROUPS_FILE);
