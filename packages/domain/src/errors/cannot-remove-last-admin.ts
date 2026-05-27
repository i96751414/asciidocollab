import { DomainError } from './domain-error';

/**
 * Thrown when an attempt is made to remove or demote the last administrator of a project.
 */
export class CannotRemoveLastAdminError extends DomainError {
  readonly name = 'CannotRemoveLastAdminError';

  /**
   * @param projectId - The project that would be left without an administrator.
   */
  constructor(projectId: string) {
    super(`Cannot remove the last administrator from project ${projectId}`);
  }
}
