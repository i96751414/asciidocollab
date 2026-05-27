import { DomainError } from './domain-error';

/**
 * Thrown when an attempt is made to remove the project owner from the project.
 */
export class CannotRemoveOwnerError extends DomainError {
  readonly name = 'CannotRemoveOwnerError';

  /**
   * @param projectId - The project whose owner cannot be removed.
   */
  constructor(projectId: string) {
    super(`Cannot remove the owner from project ${projectId}`);
  }
}
