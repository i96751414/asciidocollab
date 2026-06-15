import { PasswordResetTokenId } from '../value-objects/ids/password-reset-token-id';
import { UserId } from '../value-objects/ids/user-id';

/**
 * Represents a password reset token for a user.
 *
 * Tokens are single-use and time-limited. The raw token is sent to the user
 * via email; only the SHA-256 hash is stored in the database.
 *
 * @invariant `expiresAt` must be in the future when the token is created.
 * @invariant `usedAt` must be null until the token is consumed.
 */
export class PasswordResetToken {
  /**
   * @param id - Unique identifier for this token record.
   * @param userId - The user who requested the password reset.
   * @param tokenHash - SHA-256 hash of the raw reset token for secure storage.
   * @param expiresAt - When the token expires (typically 1 hour from creation).
   * @param usedAt - When the token was consumed, or null if unused.
   * @param createdAt - When the token record was created.
   */
  constructor(
    /** Unique identifier for this token record. */
    public readonly id: PasswordResetTokenId,
    /** The user who requested the password reset. */
    public readonly userId: UserId,
    /** SHA-256 hash of the raw reset token for secure storage. */
    public readonly tokenHash: string,
    /** When the token expires (typically 1 hour from creation). */
    public readonly expiresAt: Date,
    /** When the token was consumed, or null if unused. */
    public readonly usedAt: Date | null,
    /** When the token record was created. */
    public readonly createdAt: Date = new Date(),
  ) {}

  /** @returns Whether this token has already been used. */
  get isUsed(): boolean {
    return this.usedAt !== null;
  }

  /** @returns Whether this token has expired. */
  get isExpired(): boolean {
    return new Date() > this.expiresAt;
  }

  /** @returns Whether this token is still valid (unused and not expired). */
  get isValid(): boolean {
    return !this.isUsed && !this.isExpired;
  }
}
