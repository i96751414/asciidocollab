import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { getConfig } from '../config';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const KEY_LENGTH = 32;

let cachedKey: Buffer | null = null;

/**
 * Gets or generates the encryption key.
 * If ASCIIDOCOLLAB_AUTH_SESSION_ENCRYPTION_KEY is defined, validates it's a 64-char hex string.
 * If not defined, generates a random key (ephemeral - lost on restart).
 *
 * @returns The 32-byte encryption key.
 * @throws {Error} If the key is defined but not a valid 64-character hexadecimal string.
 */
function getEncryptionKey(): Buffer {
  if (cachedKey) {
    return cachedKey;
  }
  const config = getConfig();
  const raw = config.auth.session.encryptionKey;
  if (raw) {
    if (!/^[0-9a-f]{64}$/i.test(raw)) {
      throw new Error('ASCIIDOCOLLAB_AUTH_SESSION_ENCRYPTION_KEY must be a 64-character hexadecimal string');
    }
    cachedKey = Buffer.from(raw, 'hex');
  } else {
    cachedKey = randomBytes(KEY_LENGTH);
  }
  return cachedKey;
}

/**
 * Encrypts text using AES-256-GCM.
 *
 * @param text - The plaintext to encrypt.
 * @returns The encrypted text in format iv:tag:ciphertext.
 */
export function encrypt(text: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag();
  return iv.toString('hex') + ':' + tag.toString('hex') + ':' + encrypted;
}

/**
 * Decrypts text encrypted with AES-256-GCM.
 *
 * @param encryptedText - The encrypted text in format iv:tag:ciphertext.
 * @returns The decrypted plaintext.
 */
export function decrypt(encryptedText: string): string {
  const key = getEncryptionKey();
  const parts = encryptedText.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const tag = Buffer.from(parts[1], 'hex');
  const encrypted = parts[2];
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
