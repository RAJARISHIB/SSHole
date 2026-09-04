import { apiFetch } from './client.js';

export async function listSessions() {
  const data = await apiFetch('/api/sessions');
  return data.sessions;
}

export async function createSession(input) {
  const data = await apiFetch('/api/sessions', { method: 'POST', body: input });
  return data.session;
}

export async function updateSession(id, input) {
  const data = await apiFetch(`/api/sessions/${encodeURIComponent(id)}`, { method: 'PUT', body: input });
  return data.session;
}

export function deleteSession(id) {
  return apiFetch(`/api/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
