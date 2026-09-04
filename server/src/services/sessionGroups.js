import * as sessionGroupsRepo from '../data/sessionGroupsRepo.js';
import * as sessionsRepo from '../data/sessionsRepo.js';

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
  const groups = await sessionGroupsRepo.listSessionGroupsForUser(userId);
  return groups.map(sanitizeGroup);
}

export async function createGroup(userId, input) {
  const name = validateName(input?.name);
  const group = await sessionGroupsRepo.createSessionGroup(userId, name);
  return sanitizeGroup(group);
}

export async function renameGroup(userId, id, input) {
  const name = validateName(input?.name);
  const group = await sessionGroupsRepo.renameSessionGroup(id, userId, name);
  return group ? sanitizeGroup(group) : null;
}

// Deletes the group and ungroups (never deletes) any sessions in it.
export async function deleteGroup(userId, id) {
  const existing = await sessionGroupsRepo.getSessionGroupForUser(id, userId);
  if (!existing) return false;
  await sessionsRepo.clearGroupFromSessions(id, userId);
  await sessionGroupsRepo.deleteSessionGroup(id, userId);
  return true;
}

// Verifies a groupId (if given) both exists and belongs to userId — used by
// the saved-sessions service so a session can never be filed under another
// user's group. Returns the normalized groupId (string or null).
export async function assertGroupOwnership(userId, groupId) {
  if (groupId === undefined || groupId === null || groupId === '') return null;
  const group = await sessionGroupsRepo.getSessionGroupForUser(groupId, userId);
  if (!group) throw badRequest('Session group not found.');
  return groupId;
}
