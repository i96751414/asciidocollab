import { randomBytes, createHash } from 'node:crypto';
import type { TokenGenerator, PasswordResetTokenData } from '@asciidocollab/domain';
import {
  INVITATION_TOKEN_EXPIRY_MS,
  EMAIL_VERIFICATION_TOKEN_EXPIRY_MS,
} from '@asciidocollab/domain';

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
    return this.generateToken(this.config.tokenExpiry);
  }

  /** Generates a new invitation token with its configured expiry. */
  generateInvitationToken(): PasswordResetTokenData {
    return this.generateToken(INVITATION_TOKEN_EXPIRY_MS);
  }

  /** Generates a new email-verification token with its configured expiry. */
  generateEmailVerificationToken(): PasswordResetTokenData {
    return this.generateToken(EMAIL_VERIFICATION_TOKEN_EXPIRY_MS);
  }

  /** Returns the SHA-256 hex hash of the given raw token. */
  hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private generateToken(expiryMs: number): PasswordResetTokenData {
    const token = randomBytes(this.config.tokenByteLength).toString('hex');
    const hashedToken = createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + expiryMs);
    return { token, hashedToken, expiresAt };
  }
}
