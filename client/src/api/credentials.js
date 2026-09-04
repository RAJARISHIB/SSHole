import { apiFetch } from './client.js';

export async function listCredentials() {
  const data = await apiFetch('/api/credentials');
  return data.credentials;
}

export async function createCredential(input) {
  const data = await apiFetch('/api/credentials', { method: 'POST', body: input });
  return data.credential;
}

export async function updateCredential(id, input) {
  const data = await apiFetch(`/api/credentials/${encodeURIComponent(id)}`, { method: 'PUT', body: input });
  return data.credential;
}

// Throws an Error with `.status === 409` and `.body.referencingSessions`
// (array of { id, name }) when the credential is still used by one or more
// sessions — the delete is refused rather than leaving a dangling
// reference or silently downgrading a session to unauthenticated.
export function deleteCredential(id) {
  return apiFetch(`/api/credentials/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
