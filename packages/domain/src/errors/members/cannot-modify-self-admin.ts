import { DomainError } from '../domain-error';

/** Error thrown when an administrator attempts to change their own admin status. */
export class CannotModifySelfAdminError extends DomainError {
  readonly name = 'CannotModifySelfAdminError';

  /** Creates a CannotModifySelfAdminError with a fixed message. */
  constructor() {
    super('An administrator cannot change their own admin status');
  }
}
