import { DomainError } from '../domain-error';

/**
 * Error thrown when attempting to restore a project that is not archived.
 */
export class ProjectNotArchivedError extends DomainError {
  /** The error name identifier. */
  readonly name = 'ProjectNotArchivedError';

  /** Creates a new ProjectNotArchivedError. */
  constructor() {
    super('Project is not archived');
  }
}
