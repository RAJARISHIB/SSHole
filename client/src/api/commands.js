import { apiFetch } from './client.js';

export async function listCommands() {
  const data = await apiFetch('/api/commands');
  return data.commands;
}

export async function listGlobalCommands() {
  const data = await apiFetch('/api/commands/global');
  return data.commands;
}

// input.visibility: 'personal' (default) | 'global'; when 'global', pass
// editPermission: 'owner_only' | 'everyone'.
export async function createCommand(input) {
  const data = await apiFetch('/api/commands', { method: 'POST', body: input });
  return data.command;
}

export async function updateCommand(id, input) {
  const data = await apiFetch(`/api/commands/${encodeURIComponent(id)}`, { method: 'PUT', body: input });
  return data.command;
}

export function deleteCommand(id) {
  return apiFetch(`/api/commands/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
