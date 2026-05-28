import { randomBytes, createHash } from 'node:crypto';
import { getConfig } from '../config';

/**
 * Password reset token data with raw and hashed versions.
 */
export interface PasswordResetToken {
  /** Raw token to send to user via email. */
  token: string;
  /** SHA-256 hash of the token for database storage. */
  hashedToken: string;
  /** Expiration timestamp. */
  expiresAt: Date;
}

/**
 * Generates a cryptographically secure password reset token.
 *
 * @returns A new password reset token with raw and hashed versions.
 */
export function generatePasswordResetToken(): PasswordResetToken {
  const config = getConfig();
  const token = randomBytes(config.auth.passwordReset.tokenByteLength).toString('hex');
  const hashedToken = createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + config.auth.passwordReset.tokenExpiry);

  return { token, hashedToken, expiresAt };
}

/**
 * Hashes a token using SHA-256 for secure storage.
 *
 * @param token - The raw token to hash.
 * @returns The SHA-256 hash of the token.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
