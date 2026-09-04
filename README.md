# SSHole

A browser-based SSH client: log in, connect to remote hosts from a web page,
and get a real interactive terminal (xterm.js) backed by a live SSH session,
with support for multiple simultaneous sessions in tabs, saved connection
profiles organized into groups, reusable encrypted credentials (organized
into their own groups) that any number of sessions can share, a command
dictionary — personal or shared with every user — you can paste into the
active terminal, and search across sessions/credentials/commands — all
scoped per user account.

## Architecture

```
client/   React + Vite frontend. xterm.js renders the terminal; one
          WebSocket per session tab talks to the backend.
server/   Node.js (Express + ws) backend. Each WebSocket connection is
          proxied 1:1 to an SSH shell session opened with ssh2, and is only
          ever accepted for an authenticated, logged-in user.
```

### Live terminal

Flow: browser opens a WebSocket to `/ws` (only accepted if the request
carries a valid auth cookie — see Authentication below) → sends a `connect`
message with either raw host/port/username/credentials, or a `savedSessionId`
(the backend resolves that session's credential — referenced or inline, see
below — and decrypts it in memory) → server opens an SSH connection with
`ssh2` and requests an interactive
shell (`xterm-256color` PTY) → from then on, keystrokes flow browser →
WebSocket → SSH stream, and SSH stdout/stderr flow back the same way, so
ANSI colors, cursor movement, `Ctrl+C`/`Ctrl+D`, arrow keys, etc. all work
exactly as they would in a native terminal because the remote end sees a
real PTY. Resizing the browser window (or switching to a resized tab) sends
a `resize` message that calls `stream.setWindow(...)` on the PTY.

Credentials are kept only in memory in the Node process for the lifetime of
the connection — never written to disk or logged — unless the user
explicitly checks **Save Key**, in which case they're encrypted at rest (see
below) rather than stored in plaintext.

### Authentication

- User accounts live in `server/data/users.json`: id, username, a salted
  `scrypt` password hash (Node's built-in `crypto.scryptSync`, no extra
  dependency), and a creation timestamp. Plaintext passwords are never
  stored.
- Logging in issues an opaque, random, server-side session token (kept in an
  in-memory `Map`, not a JWT — nothing for a client to decode or forge), set
  as an `HttpOnly` cookie. Logging out deletes it.
- Every `/api/*` route except `/api/auth/register` and `/api/auth/login`
  requires that cookie. The WebSocket `/ws` endpoint is gated the same way
  at the HTTP → WebSocket **upgrade** step, before `ws` even takes over the
  socket — so an unauthenticated browser cannot open a terminal at all, not
  even an ad-hoc one.

### Saved sessions, groups, and two credential-storage modes

- Saved connection profiles (name, host, port, username, optional
  `groupId`) live in `server/data/sessions.json`, each tagged with the
  owning `userId`. Session groups live in `server/data/session-groups.json`
  (same ownership-checked create/rename/delete pattern used everywhere
  else); deleting a group **ungroups** its sessions rather than deleting
  them.
- Every session's credential source is in exactly one of three states —
  enforced by construction in `server/src/services/savedSessions.js` (every
  code path sets both fields explicitly, so they can never both end up
  populated):
  - **`none`** — nothing stored; the user is prompted for a password/key
    each time they connect (with an option to save it right there).
  - **`reference`** (`credentialId` set) — the session points at a
    standalone, reusable credential (see below). Any number of sessions can
    reference the same one; editing that credential changes what all of
    them use on their *next* connection, without ever copying the secret
    around. Deleting a credential that's still referenced is refused (409,
    with the list of sessions using it) rather than silently leaving a
    session unauthenticated.
  - **`inline`** (`inlineCredential` set) — the encrypted secret is
    embedded directly in that one session's own record, for a
    one-off/throwaway connection not worth naming and reusing.

  (The task that requested this described the two "storage" modes —
  reference and inline — as strictly either/or via a JSON-schema XOR. Taken
  completely literally, that would also outlaw the pre-existing `none`
  state — i.e. it would force every saved session to always carry a
  credential, removing the "prompt me each time" option this app already
  had. That read would delete working, intentional functionality nobody
  asked to remove, so what's actually enforced is "never both **reference**
  and **inline** at once" (a NAND), with `none` preserved as a legitimate
  third state.)
- Standalone credentials (`server/data/credentials.json`) are name + type
  (password/private key) + **username** (plaintext — not a secret) + group +
  the encrypted secret — no `sessionId`; they don't belong to any one
  session. They have their own groups (`server/data/credential-groups.json`),
  same ungroup-on-delete behavior.
- A session in **`reference`** mode never stores its own `username` — it's
  derived from the credential, at both display and connect time, exactly
  like the password/key (see the credential-reuse point above: rename the
  credential's username and every referencing session picks it up on its
  next connect, with nothing to keep in sync). The connection form and edit
  form both hide the Username field whenever "Use a saved credential" is
  selected, showing which username will be used instead. Sessions in
  `inline`/`none` mode are unaffected — they still store and ask for their
  own username, since there's no credential to derive one from.
- Whichever storage mode is used, the secret is AES-256-GCM-encrypted with a
  key derived from the `ENCRYPTION_KEY` environment variable (see
  Configuration) — never written to any JSON file or committed to Git — and
  decrypted secrets are never sent back to the frontend; they only ever
  exist in memory on the server, for the moment it takes to open the SSH
  connection.
- Every session/credential/group read, update, delete, and connect verifies
  `userId` ownership server-side (in the `services/*.js` and `data/*Repo.js`
  modules) — the frontend's UI never determines access, so one user can
  never see, edit, delete, or connect using another user's sessions,
  credentials, or groups.
- `server/src/data/jsonStore.js` gives every JSON file: auto-created
  directory/file, JSON validation with automatic recovery (a corrupted file
  is backed up alongside itself and reset rather than crashing the app or
  silently discarding other users' data), atomic writes (write to a temp
  file + rename), and a per-file async lock so concurrent requests can't
  interleave and corrupt a read-modify-write cycle.
- The sidebar renders sessions (and, on its own tab, credentials) as a
  collapsible group tree with a live search box. Per the "small number of
  items" scale this app targets, both searches are entirely client-side —
  no backend search endpoint.

### Command Dictionary & paste-to-terminal

- Personal and global commands share one file (`server/data/commands.json`)
  with a `visibility` field (`'personal' | 'global'`) telling them apart —
  chosen over the two-file layout the task suggested because it makes
  "convert a personal command to global" a plain field update instead of a
  delete-and-recreate across two collections. Category is a free-text
  display grouping, not a foreign key.
- A **personal** command is only ever visible to, and only ever editable
  by, its owner (`ownerId`) — like every other private resource here, a
  personal command belonging to someone else 404s rather than 403s, so its
  existence isn't leaked.
- A **global** command is visible to (and copyable/pasteable by) every
  authenticated user, with an owner-controlled `editPermission`:
  `owner_only` or `everyone`. Everyone-editable still means *edit only* —
  deleting a global command, and changing its `editPermission`, is always
  owner-only, even for someone currently allowed to edit its text; a
  non-owner can never grant themselves anything (enforced in
  `server/src/services/commands.js`, not just hidden in the UI). Converting
  a personal command to global is supported (owner-only); converting back
  is not.
- **Copy** uses the browser clipboard. **Paste to Terminal** sends the raw
  command text over that tab's WebSocket as a `data` message — the exact
  same message type/path as typed keystrokes — with no trailing newline, so
  nothing is ever auto-executed.
- Paste always targets the currently active tab specifically: one
  WebSocket = one SSH session server-side (see Live terminal above), so
  there is no message shape that could address a *different* tab's shell —
  the frontend only needs to pick which tab's WebSocket to write to, and
  wiring a "paste" event into the right tab is itself just React refs
  (`Workspace` keeps one imperative ref per open tab). The backend's `data`
  handler additionally requires the session to be `connected`, so a paste
  arriving for a tab that isn't (yet, or anymore) connected is a safe no-op
  rather than being queued or thrown at a stale stream — enforced
  server-side, not just by the frontend disabling the button.
- **Paste to Terminal** is disabled in the UI whenever the active tab isn't
  a live, connected session (no tab selected, still connecting, or
  disconnected/errored) and re-enables the instant that tab reconnects.

## Prerequisites

- Node.js 18.17+ (uses `node --watch`; tested on Node 24)
- Network access to whatever SSH host(s) you want to connect to

## Setup

```bash
npm run install:all
```

This installs dependencies for the root (dev tooling), `server/`, and
`client/` separately.

## Configuration

Copy `server/.env.example` to `server/.env` and set:

```
PORT=3001
ENCRYPTION_KEY=   # required — see below
COOKIE_SECURE=false
```

- **`ENCRYPTION_KEY`** is required; the server refuses to start without it.
  Generate one with:
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
  Keep it secret and back it up outside of Git — losing or changing it makes
  every previously saved credential undecryptable.
- **`COOKIE_SECURE`**: set to `true` once this app is served over HTTPS (see
  Security notes) so the auth cookie gets the `Secure` flag. Leave `false`
  for local `http://localhost` development, since browsers drop `Secure`
  cookies sent over plain HTTP.

## Development

```bash
npm run dev
```

This runs the backend on `http://localhost:3001` (WebSocket at
`ws://localhost:3001/ws`) and the Vite dev server on `http://localhost:5173`,
which proxies `/api` and `/ws` to the backend. Open `http://localhost:5173`.

## Production build

```bash
npm run build   # builds client/dist
npm start       # builds client, then starts the server, which now also
                 # serves the built frontend as static files
```

In production, everything is served from a single origin/port (the value of
`PORT`, default `3001`), so no proxy config is needed.

## Using it

1. **Register** an account (or **log in** if you already have one).
2. Click **+ New Session** to open a tab with the connection form.
3. Fill in host, port (defaults to 22), username, and choose **Password** or
   **Private Key** (paste the key or upload a key file; an optional
   passphrase field appears for encrypted keys).
4. Optionally check **Save this session** (give it a name, pick a session
   group) and choose how its credential is handled: **don't save one**
   (you'll be asked again next time), **store it directly in this session**
   (encrypted, one-off), or **use a saved credential** (pick one from the
   Credentials tab — create one inline with **+ New Credential** if you
   haven't yet).
5. Click **Connect**. The tab switches to a live terminal once the SSH
   session is established; the status badge shows
   Connecting → Connected, or Error if something went wrong.
6. Open more tabs for more simultaneous sessions — each tab has its own
   independent SSH connection and keeps its own scrollback/state even while
   you're looking at a different tab.
7. **Disconnect** ends the SSH session but keeps the tab (with a
   **Reconnect** button to start a new connection); **Close Tab** ends the
   session and removes the tab entirely.
8. In the **Sessions** sidebar tab: **Connect** opens a new tab straight
   into the terminal (no re-entering credentials, if one is saved or
   referenced) or prompts once for the missing password/key otherwise;
   **Edit** lets you rename, change host/port/username, move it to a
   different session group, or switch/replace its credential; **Delete**
   removes the session (an inline credential goes with it; a referenced one
   is untouched and stays available to other sessions). Use **+ Group** to
   create a session group, click a group's ▼/▶ to collapse or expand it,
   and use its **Rename**/**Delete** buttons to manage it — deleting a
   group only ungroups its sessions. Type in **Search sessions…** to filter
   by group name, session name, host, or username as you type.
9. In the **Credentials** sidebar tab: create/edit/delete standalone,
   reusable credentials (name, username, type, password/key), organized
   into their own groups exactly like sessions. Editing a credential —
   including its username — updates every session that references it, the
   next time each one connects; nothing is ever copied around, and a
   session using "Use a saved credential" never asks for a username at all.
   Deleting one that's still referenced is blocked; the error names which
   sessions use it, so you can reassign or delete those first. Search here
   matches credential name, credential group name, or type.
10. Switch the sidebar to **Command Dictionary** to save frequently-used
    commands (with an optional category), as **Personal** (only you) or
    **Global** (every user — you choose whether only you or everyone can
    edit it; deleting stays yours alone either way). **Copy** puts the
    command on your clipboard; **Paste to Terminal** inserts it into the
    currently active terminal tab exactly as typed — it never presses Enter
    for you, and it's greyed out whenever there's no connected tab to paste
    into. Search spans both your personal commands and every global one.

## Security notes

- **Use HTTPS/WSS in any real deployment.** As built, this app is meant to
  run behind a reverse proxy (nginx, Caddy, etc.) that terminates TLS, so
  that login credentials, host credentials, and the terminal traffic itself
  aren't sent over plaintext HTTP/WebSocket. Without TLS, anyone on the
  network path can read passwords/private keys/terminal output. Set
  `COOKIE_SECURE=true` once TLS is in place.
- Ad-hoc (unsaved) credentials are only ever held in server memory for the
  life of the SSH connection and are discarded when the WebSocket closes.
  Saved credentials are encrypted at rest (AES-256-GCM) and only decrypted
  in memory, on the server, at the moment a connection is opened.
- The backend does not verify host keys (no known_hosts checking), which is
  standard for this kind of "paste in any host" web SSH client but means
  it's trusting whatever host it connects to. If you need strict host key
  verification, add a host key callback in `server/src/sshSession.js`
  (`ssh2`'s `hostVerifier` option) tied to a known-hosts store.
- There's no rate limiting on login/register. For a real deployment, put a
  reverse proxy or middleware in front that throttles repeated failed
  logins per IP/username.
- `server/data/` (users, sessions, groups, credentials, commands) is a
  plain directory on disk, outside anything handed to `express.static`, so
  it's never reachable over HTTP — but it's still only as safe as the host
  it lives on. Back it up like any other secret-bearing data store, and
  note it's excluded from Git via `.gitignore` (along with `.env`).

## Project layout

```
server/
  src/index.js                  Express + WebSocket server bootstrap, auth
                                 wiring, WS upgrade auth gate
  src/sshSession.js              Per-connection SSH<->WebSocket proxy (ssh2),
                                 supports ad-hoc and saved-session connects
  src/auth/
    constants.js                 Auth cookie name/TTL
    cookies.js                   Cookie parse/serialize (no dependency)
    authTokens.js                 In-memory opaque session tokens
    middleware.js                 attachUser / requireAuth Express middleware
    passwordHash.js               scrypt password hashing + verification
  src/crypto/secretBox.js        AES-256-GCM encrypt/decrypt, keyed by
                                 ENCRYPTION_KEY — used for both standalone
                                 and inline session credentials
  src/data/
    paths.js                     server/data/*.json file locations
    jsonStore.js                  Safe JSON file storage: auto-create,
                                  corruption recovery, atomic writes, locking
    groupsRepoFactory.js          Shared CRUD builder for session-groups
                                  and credential-groups (identical shape)
    usersRepo.js / sessionGroupsRepo.js / sessionsRepo.js /
    credentialGroupsRepo.js / credentialsRepo.js / commandsRepo.js
                                  Per-collection CRUD over jsonStore
  src/services/
    savedSessions.js              Session CRUD; resolves/enforces the
                                  none|reference|inline credential modes
    sessionGroups.js               Session-group CRUD, cascade-ungroup
    credentials.js                 Standalone credential CRUD; blocks
                                  deleting one still referenced by a session
    credentialGroups.js             Credential-group CRUD, cascade-ungroup
    commands.js                    Personal + global command CRUD, visibility
                                  conversion, edit/delete permission checks
  src/routes/
    auth.js                        /api/auth/{register,login,logout,me}
    sessions.js                    /api/sessions CRUD (all behind requireAuth)
    sessionGroups.js                /api/session-groups CRUD
    credentials.js                  /api/credentials CRUD
    credentialGroups.js             /api/credential-groups CRUD
    commands.js                     /api/commands (+ /global) CRUD
client/
  src/App.jsx                     Top-level shell: auth gate (loading /
                                  AuthScreen / Workspace)
  src/context/AuthContext.jsx     Current-user state, login/register/logout
  src/components/auth/            LoginForm, RegisterForm, AuthScreen
  src/components/Workspace.jsx   Session/tab state, per-tab terminal refs,
                                 active-session/paste-to-terminal logic
  src/components/TabBar.jsx       Tab strip + "new session" button
  src/components/SessionPane.jsx  Per-tab container (form or terminal)
  src/components/ConnectionForm.jsx  Host/port/user/auth form, with
                                  Save Session + none/inline/reference
                                  credential-mode choice
  src/components/TerminalPane.jsx     xterm.js + WebSocket wiring; exposes
                                  disconnect()/sendData() via ref
  src/components/StatusBadge.jsx      Connecting/Connected/... indicator
  src/components/Sidebar.jsx          Tab switcher: Sessions / Credentials /
                                  Command Dictionary
  src/components/SavedSessionsPanel.jsx   Session-group tree, search,
                                  connect/edit/delete, group CRUD
  src/components/EditSessionModal.jsx      Rename/edit/move group, switch
                                  between none/inline/reference credential
  src/components/CredentialPromptModal.jsx   One-time prompt when connecting
                                  to a session with no stored credential
  src/components/CredentialsPanel.jsx       Credential-group tree, search,
                                  edit/delete, group CRUD
  src/components/CredentialFormModal.jsx     Create/edit a standalone
                                  credential (name, group, type, secret)
  src/components/GroupModal.jsx       Create/rename a group — shared by
                                  session groups and credential groups
  src/components/CommandDictionaryPanel.jsx   My Commands / Global Commands,
                                  search, permission-gated copy/paste/edit
  src/components/CommandFormModal.jsx        Create/edit a command;
                                  visibility + edit-permission choices
  src/components/ConfirmDialog.jsx    Generic confirm (used for delete)
  src/api/                        client.js (fetch wrapper, attaches error
                                  body for e.g. 409 referencingSessions),
                                  groupsApiFactory.js (shared session-/
                                  credential-group CRUD), auth.js,
                                  savedSessions.js, sessionGroups.js,
                                  credentials.js, credentialGroups.js,
                                  commands.js
```
