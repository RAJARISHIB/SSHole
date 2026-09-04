import { AUTH_COOKIE_NAME } from './constants.js';
import { parseCookieHeader } from './cookies.js';
import { getAuthToken, touchAuthToken } from './authTokens.js';

// Decorates req.userId/req.authToken when a valid auth cookie is present.
// Never blocks the request itself — use requireAuth for that.
export function attachUser(req, res, next) {
  const cookies = parseCookieHeader(req.headers.cookie);
  const token = cookies[AUTH_COOKIE_NAME];
  const entry = getAuthToken(token);
  if (entry) {
    touchAuthToken(token);
    req.userId = entry.userId;
    req.authToken = token;
  }
  next();
}

// Blocks unauthenticated requests. Mount after attachUser on any route that
// must not be reachable without a valid login.
export function requireAuth(req, res, next) {
  if (!req.userId) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  next();
}
