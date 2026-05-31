import { PasswordResetToken } from '../../src/entities/password-reset-token';
import { UserId } from '../../src/value-objects/user-id';
import { PasswordResetTokenRepository } from '../../src/repositories/password-reset-token.repository';

/**
 * In-memory implementation of PasswordResetTokenRepository for testing.
 */
export class InMemoryPasswordResetTokenRepository implements PasswordResetTokenRepository {
  private readonly storage = new Map<string, PasswordResetToken>();

  /**
   * @param token - The token entity to save.
   */
  async save(token: PasswordResetToken): Promise<void> {
    this.storage.set(token.id.value, token);
  }

  /**
   * @param tokenHash - The SHA-256 hash of the raw token.
   * @returns The matching token if found and valid, null otherwise.
   */
  async findByTokenHash(tokenHash: string): Promise<PasswordResetToken | null> {
    for (const token of this.storage.values()) {
      if (token.tokenHash === tokenHash && token.isValid) {
        return token;
      }
    }
    return null;
  }

  /**
   * @param userId - The user who owns the tokens.
   * @returns A list of tokens for the user, ordered by creation date descending.
   */
  async findByUserId(userId: UserId): Promise<PasswordResetToken[]> {
    return [...this.storage.values()]
      .filter((t) => t.userId.value === userId.value)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  /**
   * @param id - The token record ID.
   * @param usedAt - The timestamp when the token was consumed.
   */
  async markAsUsed(id: string, usedAt: Date): Promise<void> {
    const token = this.storage.get(id);
    if (token) {
      this.storage.set(
        id,
        new PasswordResetToken(
          token.id,
          token.userId,
          token.tokenHash,
          token.expiresAt,
          usedAt,
          token.createdAt,
        ),
      );
    }
  }

  /**
   * @param userId - The user whose expired tokens should be removed.
   * @returns The number of deleted tokens.
   */
  async deleteExpired(userId: UserId): Promise<number> {
    let count = 0;
    for (const [id, token] of this.storage.entries()) {
      if (token.userId.value === userId.value && token.isExpired) {
        this.storage.delete(id);
        count++;
      }
    }
    return count;
  }
}
