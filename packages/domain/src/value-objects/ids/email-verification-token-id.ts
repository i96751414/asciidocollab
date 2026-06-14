import { Uuid, validateUuid } from './uuid';

/** Strongly-typed UUID value object identifying an email verification token. */
export class EmailVerificationTokenId extends Uuid {
  private constructor(value: string) {
    super(value);
  }

  /** Creates and validates an EmailVerificationTokenId from a UUID string. */
  static create(value: string): EmailVerificationTokenId {
    validateUuid(value, 'EmailVerificationTokenId');
    return new EmailVerificationTokenId(value);
  }
}
