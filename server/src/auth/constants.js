// Name of the cookie that carries the opaque auth token. Deliberately not
// called "session" to avoid clashing with the "SSH session" / "saved
// session" vocabulary used everywhere else in this codebase.
export const AUTH_COOKIE_NAME = 'ssh_web_terminal_auth';

export const AUTH_TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
