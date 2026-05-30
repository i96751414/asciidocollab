import { DomainError } from './domain-error';

/**
 * Error thrown when attempting to archive a project that is already archived.
 */
export class ProjectAlreadyArchivedError extends DomainError {
  /** The error name identifier. */
  readonly name = 'ProjectAlreadyArchivedError';

  /** Creates a new ProjectAlreadyArchivedError. */
  constructor() {
    super('Project is already archived');
  }
}
