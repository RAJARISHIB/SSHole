import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// server/data — deliberately outside client/dist (the only directory ever
// handed to express.static), so it is never reachable over HTTP.
export const DATA_DIR = path.join(__dirname, '..', '..', 'data');

export const USERS_FILE = path.join(DATA_DIR, 'users.json');
export const SESSION_GROUPS_FILE = path.join(DATA_DIR, 'session-groups.json');
export const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');
export const CREDENTIAL_GROUPS_FILE = path.join(DATA_DIR, 'credential-groups.json');
export const CREDENTIALS_FILE = path.join(DATA_DIR, 'credentials.json');
// Personal and global commands share one file (a `visibility` field tells
// them apart) so that "convert a personal command to global" is a plain
// field update rather than a delete-and-recreate across two files.
export const COMMANDS_FILE = path.join(DATA_DIR, 'commands.json');
