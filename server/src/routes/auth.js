import { Router } from 'express';
import * as usersRepo from '../data/usersRepo.js';
import { createAuthToken, destroyAuthToken } from '../auth/authTokens.js';
import { serializeCookie } from '../auth/cookies.js';
import { AUTH_COOKIE_NAME, AUTH_TOKEN_TTL_MS } from '../auth/constants.js';
import { requireAuth } from '../auth/middleware.js';

const router = Router();

function setAuthCookie(res, token) {
  res.setHeader(
    'Set-Cookie',
    serializeCookie(AUTH_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'Lax',
      secure: process.env.COOKIE_SECURE === 'true',
      maxAge: AUTH_TOKEN_TTL_MS,
      path: '/',
    })
  );
}

function clearAuthCookie(res) {
  res.setHeader(
    'Set-Cookie',
    serializeCookie(AUTH_COOKIE_NAME, '', {
      maxAge: 0,
      path: '/',
      secure: process.env.COOKIE_SECURE === 'true',
    })
  );
}

router.post('/register', async (req, res) => {
  const { username, password } = req.body || {};
  if (typeof username !== 'string' || username.trim().length < 3) {
    return res.status(400).json({ error: 'Username must be at least 3 characters.' });
  }
  if (typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }

  try {
    const user = await usersRepo.createUser(username, password);
    const token = createAuthToken(user.id);
    setAuthCookie(res, token);
    res.status(201).json({ user });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    console.error('Register error:', err);
    res.status(500).json({ error: 'Failed to register.' });
  }
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  try {
    const user = await usersRepo.verifyCredentials(username, password);
    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }
    const token = createAuthToken(user.id);
    setAuthCookie(res, token);
    res.json({ user });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Failed to log in.' });
  }
});

router.post('/logout', requireAuth, (req, res) => {
  destroyAuthToken(req.authToken);
  clearAuthCookie(res);
  res.status(204).end();
});

router.get('/me', requireAuth, async (req, res) => {
  const user = await usersRepo.getUserById(req.userId);
  if (!user) {
    // The account backing this token no longer exists.
    destroyAuthToken(req.authToken);
    clearAuthCookie(res);
    return res.status(401).json({ error: 'Authentication required.' });
  }
  res.json({ user });
});

export default router;
