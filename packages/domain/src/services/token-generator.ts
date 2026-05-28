/**
 * Data for a generated password reset token.
 */
export interface PasswordResetTokenData {
  /** Raw token to send to user via email. */
  token: string;
  /** Hashed token for database storage. */
  hashedToken: string;
  /** Expiration timestamp. */
  expiresAt: Date;
}

/**
 * Interface for generating password reset tokens.
 */
export interface TokenGenerator {
  /**
   * Generates a new password reset token.
   *
   * @returns A new token with raw and hashed versions.
   */
  generatePasswordResetToken(): PasswordResetTokenData;

  /**
   * Hashes a raw token for secure storage.
   *
   * @param token - The raw token to hash.
   * @returns The hashed token.
   */
  hashToken(token: string): string;
}
