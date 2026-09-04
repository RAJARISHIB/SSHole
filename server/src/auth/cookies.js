// Minimal cookie parse/serialize helpers. Kept dependency-free and usable
// both from Express request handlers and from the raw HTTP `upgrade` event
// (which has no Express `req`/`res`), so the same auth check protects
// regular API routes and the WebSocket endpoint.

export function parseCookieHeader(header) {
  const out = {};
  if (!header) return out;
  for (const pair of header.split(';')) {
    const idx = pair.indexOf('=');
    if (idx === -1) continue;
    const key = pair.slice(0, idx).trim();
    const rawValue = pair.slice(idx + 1).trim();
    if (!key) continue;
    try {
      out[key] = decodeURIComponent(rawValue);
    } catch {
      out[key] = rawValue;
    }
  }
  return out;
}

export function serializeCookie(name, value, options = {}) {
  let str = `${name}=${encodeURIComponent(value)}`;
  if (options.maxAge != null) {
    str += `; Max-Age=${Math.max(0, Math.floor(options.maxAge / 1000))}`;
  }
  str += `; Path=${options.path || '/'}`;
  if (options.httpOnly !== false) str += '; HttpOnly';
  str += `; SameSite=${options.sameSite || 'Lax'}`;
  if (options.secure) str += '; Secure';
  return str;
}
