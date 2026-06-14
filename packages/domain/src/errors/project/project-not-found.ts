import { DomainError } from '../domain-error';

/**
 * Thrown when an operation references a project that does not exist.
 */
export class ProjectNotFoundError extends DomainError {
  readonly name = 'ProjectNotFoundError';

  /**
   * @param projectId - The ID of the project that was not found.
   */
  constructor(projectId: string) {
    super(`Project not found: ${projectId}`);
  }
}
