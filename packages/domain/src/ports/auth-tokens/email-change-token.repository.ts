import { EmailChangeToken } from '../../entities/email-change-token';
import { UserId } from '../../value-objects/user-id';

/** Persistence contract for EmailChangeToken entities. */
export interface EmailChangeTokenRepository {
  /**
   * Persists a new or updated token.
   *
   * @param token - The token to save.
   * @returns A promise that resolves when the save is complete.
   */
  save(token: EmailChangeToken): Promise<void>;
  /**
   * Returns the token matching the given hash, or null if not found.
   *
   * @param tokenHash - SHA-256 hash of the raw token.
   * @returns The matching token or null.
   */
  findByTokenHash(tokenHash: string): Promise<EmailChangeToken | null>;
  /**
   * Returns the active (unused, non-expired) token for a user, or null.
   *
   * @param userId - ID of the user to look up.
   * @returns The active token or null.
   */
  findActiveByUserId(userId: UserId): Promise<EmailChangeToken | null>;
  /**
   * Marks the token with the given ID as used at the specified time.
   *
   * @param id - The token ID.
   * @param usedAt - The timestamp when the token was consumed.
   * @returns A promise that resolves when the update is complete.
   */
  markAsUsed(id: string, usedAt: Date): Promise<void>;
  /**
   * Deletes all tokens belonging to the given user.
   *
   * @param userId - ID of the user whose tokens to remove.
   * @returns A promise that resolves when the deletion is complete.
   */
  deleteByUserId(userId: UserId): Promise<void>;
}
