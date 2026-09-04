import 'dotenv/config';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import { WebSocketServer } from 'ws';
import { SshSession } from './sshSession.js';
import { ensureEncryptionKeyConfigured } from './crypto/secretBox.js';
import { attachUser, requireAuth } from './auth/middleware.js';
import { AUTH_COOKIE_NAME } from './auth/constants.js';
import { parseCookieHeader } from './auth/cookies.js';
import { getAuthToken } from './auth/authTokens.js';
import authRoutes from './routes/auth.js';
import sessionRoutes from './routes/sessions.js';
import sessionGroupRoutes from './routes/sessionGroups.js';
import credentialRoutes from './routes/credentials.js';
import credentialGroupRoutes from './routes/credentialGroups.js';
import commandRoutes from './routes/commands.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3001;

// Fail fast and loudly if credential encryption isn't configured, rather
// than only discovering it the first time a user tries to save a key.
try {
  ensureEncryptionKeyConfigured();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

const app = express();

app.use(express.json({ limit: '256kb' }));
app.use(attachUser);

app.get('/healthz', (req, res) => {
  res.json({ ok: true });
});

app.use('/api/auth', authRoutes);
app.use('/api/sessions', requireAuth, sessionRoutes);
app.use('/api/session-groups', requireAuth, sessionGroupRoutes);
app.use('/api/credentials', requireAuth, credentialRoutes);
app.use('/api/credential-groups', requireAuth, credentialGroupRoutes);
app.use('/api/commands', requireAuth, commandRoutes);

// In production, serve the built React client from client/dist.
// In development the client is served separately by the Vite dev server
// (which proxies /api and /ws to this server), so we skip this when
// dist/ is absent. Registered last so it acts as a catch-all without
// shadowing the API/health routes above. Note this only ever serves
// client/dist — server/data (users/sessions/credentials) is a completely
// separate directory that is never handed to express.static and so is
// never reachable over HTTP.
const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get(/^\/(?!api|ws).*/, (req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

// The terminal is only ever reachable over an authenticated WebSocket:
// gate the HTTP -> WS upgrade itself on the same auth cookie used for the
// REST API, before ws even takes over the socket.
server.on('upgrade', (req, socket, head) => {
  let pathname;
  try {
    pathname = new URL(req.url, 'http://localhost').pathname;
  } catch {
    socket.destroy();
    return;
  }
  if (pathname !== '/ws') {
    socket.destroy();
    return;
  }

  const cookies = parseCookieHeader(req.headers.cookie);
  const authEntry = getAuthToken(cookies[AUTH_COOKIE_NAME]);
  if (!authEntry) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, authEntry.userId);
  });
});

wss.on('connection', (ws, userId) => {
  // Each WebSocket connection corresponds to exactly one SSH session
  // (one browser tab = one WebSocket = one SshSession = one remote shell),
  // scoped to the authenticated user who opened it.
  new SshSession(ws, userId);
});

server.listen(PORT, () => {
  console.log(`SSHole server listening on http://localhost:${PORT}`);
  console.log(`WebSocket endpoint: ws://localhost:${PORT}/ws`);
});
