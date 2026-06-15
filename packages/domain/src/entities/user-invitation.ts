import { UserInvitationId } from '../value-objects/ids/user-invitation-id';
import { Email } from '../value-objects/identity/email';
import { UserId } from '../value-objects/ids/user-id';

/** Domain entity representing a pending registration invitation sent to an email address. */
export class UserInvitation {
  /** Creates a new UserInvitation entity with all its properties. */
  constructor(
    public readonly id: UserInvitationId,
    public readonly recipientEmail: Email,
    public readonly invitedByUserId: UserId | null,
    public readonly tokenHash: string,
    public readonly expiresAt: Date,
    public readonly acceptedAt: Date | null,
    public readonly createdAt: Date,
  ) {}

  /** Returns true when this invitation has already been accepted. */
  get isAccepted(): boolean {
    return this.acceptedAt !== null;
  }

  /** Returns true when the invitation's expiry time has passed. */
  get isExpired(): boolean {
    return new Date() > this.expiresAt;
  }

  /** Returns true when the invitation has not been accepted and has not expired. */
  get isValid(): boolean {
    return !this.isAccepted && !this.isExpired;
  }
}
