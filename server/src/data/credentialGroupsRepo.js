import { createGroupsRepo } from './groupsRepoFactory.js';
import { CREDENTIAL_GROUPS_FILE } from './paths.js';

export const {
  listGroupsForUser: listCredentialGroupsForUser,
  getGroupForUser: getCredentialGroupForUser,
  createGroup: createCredentialGroup,
  renameGroup: renameCredentialGroup,
  deleteGroup: deleteCredentialGroup,
} = createGroupsRepo(CREDENTIAL_GROUPS_FILE);
