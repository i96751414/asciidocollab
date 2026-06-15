import { DomainError } from '../domain-error';

/**
 * Thrown when an attempt is made to change the role of the project owner.
 */
export class CannotChangeOwnerRoleError extends DomainError {
  readonly name = 'CannotChangeOwnerRoleError';

  /**
   * @param projectId - The project whose owner role cannot be changed.
   */
  constructor(projectId: string) {
    super(`Cannot change the owner's role in project ${projectId}`);
  }
}
