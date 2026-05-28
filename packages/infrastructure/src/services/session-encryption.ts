import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const KEY_LENGTH = 32;

/**
 * Configuration for session encryption.
 */
export interface SessionEncryptionConfig {
  /** 64-character hex string for the encryption key, or empty for random ephemeral key. */
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
   * @throws {Error} If the key is defined but not a valid 64-character hexadecimal string.
   */
  private getEncryptionKey(): Buffer {
    if (this.cachedKey) {
      return this.cachedKey;
    }
    const raw = this.config.encryptionKey;
    if (raw) {
      if (!/^[0-9a-f]{64}$/i.test(raw)) {
        throw new Error('Encryption key must be a 64-character hexadecimal string');
      }
      this.cachedKey = Buffer.from(raw, 'hex');
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
  decrypt(encryptedText: string): string {
    const key = this.getEncryptionKey();
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
}
