import { EmailVerificationTokenId } from '../value-objects/email-verification-token-id';
import { UserId } from '../value-objects/user-id';

/** Domain entity representing a one-time email verification token. */
export class EmailVerificationToken {
  /** Creates a new EmailVerificationToken entity with all its properties. */
  constructor(
    public readonly id: EmailVerificationTokenId,
    public readonly userId: UserId,
    public readonly tokenHash: string,
    public readonly expiresAt: Date,
    public readonly usedAt: Date | null,
    public readonly createdAt: Date,
  ) {}

  /** Returns true when this token has already been consumed. */
  get isUsed(): boolean {
    return this.usedAt !== null;
  }

  /** Returns true when the token's expiry time has passed. */
  get isExpired(): boolean {
    return new Date() > this.expiresAt;
  }

  /** Returns true when the token has not been used and has not expired. */
  get isValid(): boolean {
    return !this.isUsed && !this.isExpired;
  }
}
