import { DomainError } from './domain-error';

/**
 * Thrown when an operation would leave a project with no owner.
 */
export class CannotRemoveLastOwnerError extends DomainError {
  readonly name = 'CannotRemoveLastOwnerError';

  /**
   *
   */
  constructor(projectId: string) {
    super(`Cannot remove the last owner from project ${projectId}`);
  }
}
