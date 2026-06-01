import { DomainError } from './domain-error';

/** Error thrown when an administrator attempts to remove their own account. */
export class CannotRemoveSelfError extends DomainError {
  readonly name = 'CannotRemoveSelfError';

  /** Creates a CannotRemoveSelfError with a fixed message. */
  constructor() {
    super('An administrator cannot remove their own account');
  }
}
