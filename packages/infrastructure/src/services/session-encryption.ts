import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const KEY_LENGTH = 32;
// Pin the GCM authentication tag to the full 16 bytes on both sides. Being explicit rejects
// truncated-tag ciphertexts (a weaker-integrity attack surface) rather than relying on the default.
const AUTH_TAG_LENGTH = 16;

/**
 * Configuration for session encryption.
 */
export interface SessionEncryptionConfig {
  /** Base64-encoded 32-byte key (e.g. `openssl rand -base64 32`), or empty for random ephemeral key. */
  encryptionKey: string;
}

/**
 * AES-256-GCM session encryption service.
 *
 * Encrypts and decrypts session data for secure storage.
 * If no encryption key is provided, generates a random ephemeral key (lost on restart).
 */
export class SessionEncryption {
  private cachedKey: Buffer | null = null;

  /**
   * @param config - Session encryption configuration.
   */
  constructor(private readonly config: SessionEncryptionConfig) {}

  /**
   * Gets or generates the encryption key.
   *
   * @returns The 32-byte encryption key.
   * @throws {Error} If the key is defined but does not decode to exactly 32 bytes.
   */
  private getEncryptionKey(): Buffer {
    if (this.cachedKey) {
      return this.cachedKey;
    }
    const raw = this.config.encryptionKey;
    if (raw) {
      // Validate before decoding: Buffer.from silently strips whitespace in base64 strings,
      // so a key with a trailing newline (e.g. copied from a terminal) would decode to
      // exactly 32 bytes and pass the length check — but it is not the key the operator intended.
      if (!/^[A-Za-z0-9+/]*={0,2}$/.test(raw)) {
        throw new Error(
          'Encryption key must be a base64-encoded 32-byte string (e.g. openssl rand -base64 32)',
        );
      }
      const keyBuffer = Buffer.from(raw, 'base64');
      if (keyBuffer.length !== KEY_LENGTH) {
        throw new Error(
          'Encryption key must be a base64-encoded 32-byte string (e.g. openssl rand -base64 32)',
        );
      }
      this.cachedKey = keyBuffer;
    } else {
      this.cachedKey = randomBytes(KEY_LENGTH);
    }
    return this.cachedKey;
  }

  /**
   * Encrypts text using AES-256-GCM.
   *
   * @param text - The plaintext to encrypt.
   * @returns The encrypted text in format iv:tag:ciphertext.
   */
  encrypt(text: string): string {
    const key = this.getEncryptionKey();
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
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
  decrypt(encryptedText: string): string {
    const key = this.getEncryptionKey();
    const parts = encryptedText.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const tag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];
    const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
    decipher.setAuthTag(tag);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }
}
