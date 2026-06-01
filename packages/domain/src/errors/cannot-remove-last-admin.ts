import { DomainError } from './domain-error';

/** Error thrown when an action would leave the system with no administrator accounts. */
export class CannotRemoveLastAdminError extends DomainError {
  readonly name = 'CannotRemoveLastAdminError';

  /** Creates a CannotRemoveLastAdminError, optionally scoped to a project context. */
  constructor(context?: string) {
    super(
      context
        ? `Cannot remove the last administrator from project ${context}`
        : 'Cannot remove or demote the last system administrator',
    );
  }
}
