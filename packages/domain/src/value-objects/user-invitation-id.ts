import { Uuid, validateUuid } from './uuid';

/** Strongly-typed UUID value object identifying a user invitation. */
export class UserInvitationId extends Uuid {
  private constructor(value: string) {
    super(value);
  }

  /** Creates and validates a UserInvitationId from a UUID string. */
  static create(value: string): UserInvitationId {
    validateUuid(value, 'UserInvitationId');
    return new UserInvitationId(value);
  }
}
