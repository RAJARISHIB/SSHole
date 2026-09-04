import * as commandsRepo from '../data/commandsRepo.js';

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

function forbidden(message) {
  const err = new Error(message);
  err.status = 403;
  return err;
}

// Commands never carry secret material, so the record is returned as-is,
// annotated with what *this* user is allowed to do with it.
function sanitizeCommand(command, userId) {
  const isOwner = command.ownerId === userId;
  const isGlobal = command.visibility === 'global';
  const canEdit = isGlobal ? isOwner || command.editPermission === 'everyone' : isOwner;
  return {
    id: command.id,
    name: command.name,
    command: command.command,
    category: command.category || null,
    visibility: command.visibility,
    editPermission: isGlobal ? command.editPermission : null,
    isMine: isOwner,
    canEdit,
    canDelete: isOwner, // deleting a global command is always owner-only, regardless of editPermission
    createdAt: command.createdAt,
    updatedAt: command.updatedAt,
  };
}

function validateEditPermission(editPermission) {
  if (editPermission !== 'owner_only' && editPermission !== 'everyone') {
    throw badRequest('editPermission must be "owner_only" or "everyone".');
  }
}

export async function listMyCommands(userId) {
  const commands = await commandsRepo.listPersonalCommandsForUser(userId);
  return commands.map((c) => sanitizeCommand(c, userId));
}

export async function listGlobalCommands(userId) {
  const commands = await commandsRepo.listGlobalCommands();
  return commands.map((c) => sanitizeCommand(c, userId));
}

export async function createCommand(userId, input) {
  const name = (input?.name || '').trim();
  const command = (input?.command || '').trim();
  if (!name) throw badRequest('Name is required.');
  if (!command) throw badRequest('Command is required.');
  const category = input?.category ? String(input.category).trim() : null;

  const visibility = input?.visibility === 'global' ? 'global' : 'personal';
  let editPermission = null;
  if (visibility === 'global') {
    editPermission = input?.editPermission || 'owner_only';
    validateEditPermission(editPermission);
  }

  const entry = await commandsRepo.createCommand(userId, { name, command, category, visibility, editPermission });
  return sanitizeCommand(entry, userId);
}

export async function updateCommand(userId, id, input) {
  const existing = await commandsRepo.getCommandById(id);
  if (!existing) return null;

  const isOwner = existing.ownerId === userId;
  const isGlobal = existing.visibility === 'global';

  // A personal command not owned by this user doesn't exist as far as they
  // know — 404, same as every other private resource in this app.
  if (!isGlobal && !isOwner) return null;

  const canEditContent = isOwner || (isGlobal && existing.editPermission === 'everyone');
  if (!canEditContent) {
    throw forbidden('You do not have permission to edit this command.');
  }

  const patch = {};
  if (input.name !== undefined) {
    if (!input.name.trim()) throw badRequest('Name cannot be empty.');
    patch.name = input.name.trim();
  }
  if (input.command !== undefined) {
    if (!input.command.trim()) throw badRequest('Command cannot be empty.');
    patch.command = input.command.trim();
  }
  if (input.category !== undefined) {
    patch.category = input.category ? String(input.category).trim() : null;
  }

  const convertingToGlobal = input.visibility !== undefined && input.visibility !== existing.visibility;

  // Conversion is one-way (personal -> global) and owner-only; going back
  // to personal isn't supported, matching what was asked for. Handled
  // before the standalone editPermission check below, since converting
  // sets the command's *initial* editPermission (checked against the
  // target 'global' state, not the still-personal `existing` one).
  if (convertingToGlobal) {
    if (!isOwner) throw forbidden('Only the owner can change visibility.');
    if (isGlobal) throw badRequest('Converting a global command back to personal is not supported.');
    patch.visibility = 'global';
    patch.editPermission = input.editPermission || 'owner_only';
    validateEditPermission(patch.editPermission);
  } else if (input.editPermission !== undefined) {
    // Only the owner may change who can edit, and only ever for a global
    // command — a non-owner (even one with "everyone" edit rights) can
    // never grant themselves anything, per the spec's explicit requirement.
    if (!isOwner) throw forbidden('Only the owner can change edit permissions.');
    if (!isGlobal) throw badRequest('editPermission only applies to global commands.');
    validateEditPermission(input.editPermission);
    patch.editPermission = input.editPermission;
  }

  const updated = await commandsRepo.updateCommand(id, patch);
  return updated ? sanitizeCommand(updated, userId) : null;
}

export async function deleteCommand(userId, id) {
  const existing = await commandsRepo.getCommandById(id);
  if (!existing) return false;

  if (existing.ownerId !== userId) {
    if (existing.visibility === 'personal') return false; // not yours, and you shouldn't even know it exists
    throw forbidden('Only the owner can delete this command.');
  }

  await commandsRepo.deleteCommand(id);
  return true;
}
