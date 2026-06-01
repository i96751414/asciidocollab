import { DomainError } from './domain-error';

/** Error thrown when attempting to invite an email address that already has a pending invitation. */
export class InvitationAlreadyPendingError extends DomainError {
  readonly name = 'InvitationAlreadyPendingError';

  /** Creates an InvitationAlreadyPendingError for the given email address. */
  constructor(email: string) {
    super(`A pending invitation already exists for ${email}`);
  }
}
