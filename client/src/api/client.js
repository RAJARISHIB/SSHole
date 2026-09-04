// Thin fetch wrapper: always sends the auth cookie, always sends/parses
// JSON, and throws a plain Error (with `.status`) on any non-2xx response
// so callers can just try/catch and show err.message.

let unauthorizedHandler = null;

// Registered once by AuthContext so that a 401 from *any* API call (not
// just the initial /me check) immediately bounces the whole app back to
// the login screen, e.g. if the auth token expired mid-session.
export function setUnauthorizedHandler(fn) {
  unauthorizedHandler = fn;
}

export async function apiFetch(path, options = {}) {
  const { body, headers, ...rest } = options;

  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(headers || {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    ...rest,
  });

  if (res.status === 401 && unauthorizedHandler) {
    unauthorizedHandler();
  }

  let data = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    const message = (data && data.error) || `Request failed (${res.status}).`;
    const err = new Error(message);
    err.status = res.status;
    err.body = data; // full parsed error response, for callers that need more than the message (e.g. referencingSessions)
    throw err;
  }

  return data;
}
