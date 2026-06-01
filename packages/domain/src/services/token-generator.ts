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

/** Service interface for generating and hashing cryptographic tokens. */
export interface TokenGenerator {
  /**
   * Generates a new password-reset token with raw value, hash, and expiry.
   *
   * @returns A new password reset token data object.
   */
  generatePasswordResetToken(): PasswordResetTokenData;
  /**
   * Generates a new invitation token with raw value, hash, and expiry.
   *
   * @returns A new invitation token data object.
   */
  generateInvitationToken(): PasswordResetTokenData;
  /**
   * Generates a new email-verification token with raw value, hash, and expiry.
   *
   * @returns A new email verification token data object.
   */
  generateEmailVerificationToken(): PasswordResetTokenData;
  /**
   * Returns the SHA-256 hex hash of the given raw token.
   *
   * @param token - The raw token string to hash.
   * @returns The hex-encoded SHA-256 hash of the token.
   */
  hashToken(token: string): string;
}
