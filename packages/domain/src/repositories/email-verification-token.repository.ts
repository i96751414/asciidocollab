import { EmailVerificationToken } from '../entities/email-verification-token';
import { UserId } from '../value-objects/user-id';

/** Repository interface for persisting and retrieving email verification tokens. */
export interface EmailVerificationTokenRepository {
  /**
   * Persists an email verification token (create or update).
   *
   * @param token - The token entity to save.
   * @returns A promise that resolves when the token is persisted.
   */
  save(token: EmailVerificationToken): Promise<void>;
  /**
   * Finds a token by its hashed value.
   *
   * @param tokenHash - SHA-256 hash of the raw verification token.
   * @returns The token if found, null otherwise.
   */
  findByTokenHash(tokenHash: string): Promise<EmailVerificationToken | null>;
  /**
   * Deletes all tokens belonging to the given user.
   *
   * @param userId - The user whose tokens should be removed.
   * @returns A promise that resolves when the tokens are deleted.
   */
  deleteByUserId(userId: UserId): Promise<void>;
}
