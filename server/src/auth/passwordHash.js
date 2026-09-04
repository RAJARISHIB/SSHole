import crypto from 'crypto';

// scrypt is a memory-hard KDF built into Node's standard library, which
// keeps this app's dependency footprint small while still being an
// appropriate choice for password hashing (no separate bcrypt/argon2
// package or native build step required).
const KEY_LENGTH = 64;
const SALT_BYTES = 16;
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 };

// Self-describing hash string: scrypt$N$r$p$saltHex$hashHex
export function hashPassword(password) {
  const salt = crypto.randomBytes(SALT_BYTES);
  const derived = crypto.scryptSync(password, salt, KEY_LENGTH, SCRYPT_PARAMS);
  return `scrypt$${SCRYPT_PARAMS.N}$${SCRYPT_PARAMS.r}$${SCRYPT_PARAMS.p}$${salt.toString('hex')}$${derived.toString('hex')}`;
}

export function verifyPassword(password, stored) {
  if (typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, nStr, rStr, pStr, saltHex, hashHex] = parts;
  try {
    const salt = Buffer.from(saltHex, 'hex');
    const expected = Buffer.from(hashHex, 'hex');
    const derived = crypto.scryptSync(password, salt, expected.length, {
      N: Number(nStr),
      r: Number(rStr),
      p: Number(pStr),
    });
    return derived.length === expected.length && crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

// A pre-computed hash used purely to burn similar CPU time when a login
// attempt targets a username that doesn't exist, so response timing leaks
// less about whether an account exists.
export const DUMMY_PASSWORD_HASH = hashPassword('not-a-real-account-timing-guard');
