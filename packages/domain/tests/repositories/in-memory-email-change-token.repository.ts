import { EmailChangeToken } from '../../src/entities/email-change-token';
import { UserId } from '../../src/value-objects/user-id';
import { EmailChangeTokenRepository } from '../../src/repositories/email-change-token.repository';

/** In-memory implementation of EmailChangeTokenRepository for use in unit tests. */
export class InMemoryEmailChangeTokenRepository implements EmailChangeTokenRepository {
  private readonly storage = new Map<string, EmailChangeToken>();

  /** Saves or replaces a token by its ID. */
  async save(token: EmailChangeToken): Promise<void> {
    this.storage.set(token.id.value, token);
  }

  /** Returns the token whose tokenHash matches, or null. */
  async findByTokenHash(tokenHash: string): Promise<EmailChangeToken | null> {
    for (const token of this.storage.values()) {
      if (token.tokenHash === tokenHash) {
        return token;
      }
    }
    return null;
  }

  /** Returns the first active (unused, non-expired) token for the user, or null. */
  async findActiveByUserId(userId: UserId): Promise<EmailChangeToken | null> {
    for (const token of this.storage.values()) {
      if (token.userId.value === userId.value && token.isValid) {
        return token;
      }
    }
    return null;
  }

  /** Marks the token with the given ID as used at the specified time. */
  async markAsUsed(id: string, usedAt: Date): Promise<void> {
    const token = this.storage.get(id);
    if (token) {
      this.storage.set(
        id,
        new EmailChangeToken(
          token.id,
          token.userId,
          token.tokenHash,
          token.pendingEmail,
          token.expiresAt,
          usedAt,
          token.createdAt,
        ),
      );
    }
  }

  /** Deletes all tokens for the given user. */
  async deleteByUserId(userId: UserId): Promise<void> {
    for (const [id, token] of this.storage.entries()) {
      if (token.userId.value === userId.value) {
        this.storage.delete(id);
      }
    }
  }
}
