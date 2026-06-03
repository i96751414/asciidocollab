import { EmailVerificationToken } from '../../../src/entities/email-verification-token';
import { UserId } from '../../../src/value-objects/user-id';
import { EmailVerificationTokenRepository } from '../../../src/ports/auth-tokens/email-verification-token.repository';

export class InMemoryEmailVerificationTokenRepository implements EmailVerificationTokenRepository {
  private readonly storage = new Map<string, EmailVerificationToken>();

  async save(token: EmailVerificationToken): Promise<void> {
    this.storage.set(token.id.value, token);
  }

  async findByTokenHash(tokenHash: string): Promise<EmailVerificationToken | null> {
    for (const token of this.storage.values()) {
      if (token.tokenHash === tokenHash) {
        return token;
      }
    }
    return null;
  }

  async deleteByUserId(userId: UserId): Promise<void> {
    for (const [key, token] of this.storage.entries()) {
      if (token.userId.value === userId.value) {
        this.storage.delete(key);
      }
    }
  }
}
