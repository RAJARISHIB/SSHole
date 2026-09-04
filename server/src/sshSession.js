import { Client } from 'ssh2';
import { resolveConnectionConfig } from './services/savedSessions.js';

const DEFAULT_COLS = 80;
const DEFAULT_ROWS = 24;
const CONNECT_TIMEOUT_MS = 20000;
const KEEPALIVE_INTERVAL_MS = 15000;

/**
 * Wraps a single browser WebSocket connection and proxies it to a single
 * SSH shell session. The WebSocket is only ever accepted (at the HTTP
 * upgrade stage, see index.js) for an authenticated user, whose id is
 * passed in here so saved-session lookups can be ownership-checked.
 *
 * Protocol (JSON messages over the WebSocket):
 *
 * Client -> Server:
 *   { type: 'connect', payload:
 *       // ad-hoc, one-off connection:
 *       { host, port, username, authMethod, password?, privateKey?, passphrase?, cols, rows }
 *       // or: connect using a saved session (ownership verified server-side);
 *       // password/privateKey/passphrase here, if given, override (and are
 *       // never persisted from) the saved session's stored credential:
 *       { savedSessionId, password?, privateKey?, passphrase?, cols, rows } }
 *   { type: 'data', data: string }              // raw keystrokes/input, or a
 *                                                // "paste to terminal" command
 *                                                // string — both go through
 *                                                // the exact same path below
 *   { type: 'resize', cols: number, rows: number }
 *   { type: 'disconnect' }
 *
 * Server -> Client:
 *   { type: 'status', status: 'connecting'|'connected'|'disconnected'|'error', message }
 *   { type: 'data', data: string }               // stdout/stderr from the remote shell
 *
 * One WebSocket = one SshSession = one ssh2 stream: there is no message
 * shape that can address a *different* connection's stream, so a frontend
 * feature like "paste this command into the active terminal" is enforced
 * server-side simply by which socket the message arrives on — sending it
 * anywhere but the intended tab's own WebSocket is not a thing the client
 * can even express. The 'data' handler below additionally requires
 * `this.connected`, so a write that arrives before the shell is ready or
 * after it has disconnected is a safe no-op rather than being queued up or
 * thrown at a stale stream.
 */
export class SshSession {
  constructor(ws, userId) {
    this.ws = ws;
    this.userId = userId;
    this.client = null;
    this.stream = null;
    this.connected = false;
    this.connecting = false;

    ws.on('message', (raw) => this.handleMessage(raw));
    ws.on('close', () => this.cleanup());
    ws.on('error', () => this.cleanup());
  }

  send(obj) {
    if (this.ws.readyState === this.ws.OPEN) {
      this.ws.send(JSON.stringify(obj));
    }
  }

  handleMessage(raw) {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return; // ignore malformed frames
    }
    if (!msg || typeof msg.type !== 'string') return;

    switch (msg.type) {
      case 'connect':
        this.connect(msg.payload || {}).catch((err) => {
          console.error('Unexpected error resolving connection:', err);
          this.send({ type: 'status', status: 'error', message: 'Failed to resolve connection details.' });
          this.cleanup();
        });
        break;
      case 'data':
        // Requiring `connected` (not just a truthy stream) means input —
        // whether typed or pasted from the Command Dictionary — is only
        // ever written to a live, ready shell, never to one that's still
        // connecting or has already gone away.
        if (this.connected && this.stream && typeof msg.data === 'string') {
          this.stream.write(msg.data);
        }
        break;
      case 'resize':
        if (this.stream && Number.isFinite(msg.cols) && Number.isFinite(msg.rows)) {
          this.stream.setWindow(msg.rows, msg.cols, 0, 0);
        }
        break;
      case 'disconnect':
        this.cleanup();
        break;
      default:
        break;
    }
  }

  async connect(payload) {
    if (this.client || this.connecting) {
      return; // a connection already exists / is in progress on this socket
    }

    let resolved = payload;
    if (payload.savedSessionId) {
      const config = await resolveConnectionConfig(this.userId, payload.savedSessionId, {
        password: payload.password,
        privateKey: payload.privateKey,
        passphrase: payload.passphrase,
      });
      if (!config) {
        return this.send({ type: 'status', status: 'error', message: 'Saved session not found.' });
      }
      resolved = { ...config, cols: payload.cols, rows: payload.rows };
    }

    const { host, port, username, authMethod, password, privateKey, passphrase, cols, rows } = resolved;

    if (!host || typeof host !== 'string' || !host.trim()) {
      return this.send({ type: 'status', status: 'error', message: 'Host is required.' });
    }
    if (!username || typeof username !== 'string' || !username.trim()) {
      return this.send({ type: 'status', status: 'error', message: 'Username is required.' });
    }

    const sshPort = Number(port) || 22;
    if (!Number.isInteger(sshPort) || sshPort < 1 || sshPort > 65535) {
      return this.send({ type: 'status', status: 'error', message: 'Port must be between 1 and 65535.' });
    }

    const config = {
      host: host.trim(),
      port: sshPort,
      username: username.trim(),
      readyTimeout: CONNECT_TIMEOUT_MS,
      keepaliveInterval: KEEPALIVE_INTERVAL_MS,
    };

    if (authMethod === 'privateKey') {
      if (!privateKey || typeof privateKey !== 'string' || !privateKey.trim()) {
        return this.send({ type: 'status', status: 'error', message: 'Private key is required.' });
      }
      config.privateKey = privateKey;
      if (passphrase) config.passphrase = passphrase;
    } else {
      if (!password) {
        return this.send({ type: 'status', status: 'error', message: 'Password is required.' });
      }
      config.password = password;
    }

    this.connecting = true;
    this.send({
      type: 'status',
      status: 'connecting',
      message: `Connecting to ${config.username}@${config.host}:${config.port}...`,
    });

    const client = new Client();
    this.client = client;

    client
      .on('ready', () => {
        client.shell(
          { term: 'xterm-256color', cols: cols || DEFAULT_COLS, rows: rows || DEFAULT_ROWS },
          (err, stream) => {
            this.connecting = false;
            if (err) {
              this.send({ type: 'status', status: 'error', message: `Failed to open shell: ${err.message}` });
              return this.cleanup();
            }

            this.stream = stream;
            this.connected = true;
            this.send({ type: 'status', status: 'connected', message: 'Connected.' });

            stream.on('data', (chunk) => {
              this.send({ type: 'data', data: chunk.toString('utf8') });
            });
            stream.stderr.on('data', (chunk) => {
              this.send({ type: 'data', data: chunk.toString('utf8') });
            });
            stream.on('close', () => {
              this.send({ type: 'status', status: 'disconnected', message: 'Remote shell closed.' });
              this.cleanup();
            });
          }
        );
      })
      .on('error', (err) => {
        this.connecting = false;
        this.send({ type: 'status', status: 'error', message: err.message || 'SSH connection error.' });
        this.cleanup();
      })
      .on('end', () => {
        if (this.connected) {
          this.send({ type: 'status', status: 'disconnected', message: 'Connection ended.' });
        }
        this.connected = false;
      });

    try {
      // ssh2 validates/parses privateKey synchronously here and throws
      // immediately (rather than emitting 'error') on malformed key data,
      // so this needs its own try/catch to surface a useful message
      // instead of falling through to handleMessage's generic catch.
      client.connect(config);
    } catch (err) {
      this.connecting = false;
      this.send({ type: 'status', status: 'error', message: err.message || 'Failed to start SSH connection.' });
      this.cleanup();
    }
  }

  cleanup() {
    this.connected = false;
    this.connecting = false;
    if (this.stream) {
      try {
        this.stream.end();
      } catch {
        // stream already closed
      }
      this.stream = null;
    }
    if (this.client) {
      try {
        this.client.end();
      } catch {
        // client already closed
      }
      this.client = null;
    }
  }
}
