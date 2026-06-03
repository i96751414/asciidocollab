import { PasswordResetToken } from '../../entities/password-reset-token';
import { UserId } from '../../value-objects/user-id';

/**
 * Repository interface for managing PasswordResetToken persistence.
 * Handles storage, lookup, and cleanup of password reset tokens.
 */
export interface PasswordResetTokenRepository {
  /**
   * Persists a new password reset token.
   *
   * @param token - The token entity to save.
   * @returns A promise that resolves when the operation completes.
   */
  save(token: PasswordResetToken): Promise<void>;

  /**
   * Finds a valid (unused, non-expired) token by its hash.
   *
   * @param tokenHash - The SHA-256 hash of the raw token.
   * @returns The matching token if found and valid, null otherwise.
   */
  findByTokenHash(tokenHash: string): Promise<PasswordResetToken | null>;

  /**
   * Finds all tokens for a given user.
   *
   * @param userId - The user who owns the tokens.
   * @returns A list of tokens for the user, ordered by creation date descending.
   */
  findByUserId(userId: UserId): Promise<PasswordResetToken[]>;

  /**
   * Marks a token as used.
   *
   * @param id - The token record ID.
   * @param usedAt - The timestamp when the token was consumed.
   * @returns A promise that resolves when the operation completes.
   */
  markAsUsed(id: string, usedAt: Date): Promise<void>;

  /**
   * Deletes all expired tokens for a given user.
   *
   * @param userId - The user whose expired tokens should be removed.
   * @returns A promise that resolves with the number of deleted tokens.
   */
  deleteExpired(userId: UserId): Promise<number>;
}
