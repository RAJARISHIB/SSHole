import crypto from 'crypto';

// Encryption at rest for saved SSH passwords/private keys, using AES-256-GCM
// with a key derived from the ENCRYPTION_KEY environment variable. The
// derived key is cached in memory for the life of the process and the raw
// ENCRYPTION_KEY value is never written to any JSON file, logged, or sent
// to the frontend.
let cachedKey = null;

function deriveKey() {
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret || secret.trim().length < 16) {
    throw new Error(
      'ENCRYPTION_KEY environment variable is missing or too short (need 16+ characters). ' +
        'Set a strong random value in server/.env (see server/.env.example) — it must never be committed to Git.'
    );
  }
  // scrypt with a fixed, application-specific salt turns any operator-chosen
  // secret string into a well-formed 32-byte AES-256 key.
  return crypto.scryptSync(secret, 'ssh-web-terminal:credential-store:v1', 32);
}

function getKey() {
  if (!cachedKey) cachedKey = deriveKey();
  return cachedKey;
}

// Called once at server startup so a missing/weak key fails fast with a
// clear message instead of only surfacing when a user first saves a key.
export function ensureEncryptionKeyConfigured() {
  getKey();
}

export function encryptSecret(plaintext) {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  };
}

export function decryptSecret(payload) {
  if (!payload || !payload.iv || !payload.authTag || !payload.ciphertext) {
    throw new Error('Malformed encrypted credential payload.');
  }
  const key = getKey();
  const iv = Buffer.from(payload.iv, 'base64');
  const authTag = Buffer.from(payload.authTag, 'base64');
  const ciphertext = Buffer.from(payload.ciphertext, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
}
