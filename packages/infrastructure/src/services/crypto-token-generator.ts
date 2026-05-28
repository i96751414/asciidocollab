import { randomBytes, createHash } from 'node:crypto';
import type { TokenGenerator, PasswordResetTokenData } from '@asciidocollab/domain';

/**
 * Configuration for the crypto token generator.
 */
export interface CryptoTokenConfig {
  /** Number of bytes for the random token. */
  tokenByteLength: number;
  /** Token expiration time in milliseconds. */
  tokenExpiry: number;
}

/**
 * Cryptographically secure token generator implementation.
 */
export class CryptoTokenGenerator implements TokenGenerator {
  /**
   * @param config - Token generation configuration.
   */
  constructor(private readonly config: CryptoTokenConfig) {}

  /**
   * Generates a new password reset token.
   *
   * @returns A new token with raw and hashed versions.
   */
  generatePasswordResetToken(): PasswordResetTokenData {
    const token = randomBytes(this.config.tokenByteLength).toString('hex');
    const hashedToken = createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + this.config.tokenExpiry);

    return { token, hashedToken, expiresAt };
  }

  /**
   * Hashes a raw token using SHA-256.
   *
   * @param token - The raw token to hash.
   * @returns The SHA-256 hash of the token.
   */
  hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
