import * as credentialGroupsRepo from '../data/credentialGroupsRepo.js';
import * as credentialsRepo from '../data/credentialsRepo.js';

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

function sanitizeGroup(group) {
  return { id: group.id, name: group.name, createdAt: group.createdAt, updatedAt: group.updatedAt };
}

function validateName(name) {
  if (!name || typeof name !== 'string' || !name.trim()) {
    throw badRequest('Group name is required.');
  }
  return name.trim();
}

export async function listGroups(userId) {
  const groups = await credentialGroupsRepo.listCredentialGroupsForUser(userId);
  return groups.map(sanitizeGroup);
}

export async function createGroup(userId, input) {
  const name = validateName(input?.name);
  const group = await credentialGroupsRepo.createCredentialGroup(userId, name);
  return sanitizeGroup(group);
}

export async function renameGroup(userId, id, input) {
  const name = validateName(input?.name);
  const group = await credentialGroupsRepo.renameCredentialGroup(id, userId, name);
  return group ? sanitizeGroup(group) : null;
}

// Deletes the group and ungroups (never deletes) any credentials in it.
export async function deleteGroup(userId, id) {
  const existing = await credentialGroupsRepo.getCredentialGroupForUser(id, userId);
  if (!existing) return false;
  await credentialsRepo.clearGroupFromCredentials(id, userId);
  await credentialGroupsRepo.deleteCredentialGroup(id, userId);
  return true;
}

// Verifies a groupId (if given) both exists and belongs to userId.
export async function assertGroupOwnership(userId, groupId) {
  if (groupId === undefined || groupId === null || groupId === '') return null;
  const group = await credentialGroupsRepo.getCredentialGroupForUser(groupId, userId);
  if (!group) throw badRequest('Credential group not found.');
  return groupId;
}
