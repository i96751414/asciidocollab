import { EmailChangeTokenId } from '../value-objects/ids/email-change-token-id';
import { UserId } from '../value-objects/ids/user-id';

/** Domain entity representing a pending email address change request. */
export class EmailChangeToken {
  /** Creates an EmailChangeToken. */
  constructor(
    /** The token's unique ID. */
    public readonly id: EmailChangeTokenId,
    /** The ID of the user who requested the change. */
    public readonly userId: UserId,
    /** SHA-256 hash of the raw token sent to the user. */
    public readonly tokenHash: string,
    /** The new email address pending confirmation. */
    public readonly pendingEmail: string,
    /** When the token expires. */
    public readonly expiresAt: Date,
    /** When the token was consumed, or null if unused. */
    public readonly usedAt: Date | null,
    /** When the token was created. */
    public readonly createdAt: Date = new Date(),
  ) {}

  /** True if the token has already been used. */
  get isUsed(): boolean {
    return this.usedAt !== null;
  }

  /** True if the token has passed its expiry date. */
  get isExpired(): boolean {
    return new Date() > this.expiresAt;
  }

  /** True if the token can still be used to confirm an email change. */
  get isValid(): boolean {
    return !this.isUsed && !this.isExpired;
  }
}
