import { DomainError } from './domain-error';

/**
 * Thrown when a file operation fails due to a naming or content conflict.
 */
export class FileConflictError extends DomainError {
  readonly name = 'FileConflictError';

  /**
   * @param message - Description of the conflict.
   */
  constructor(message: string) {
    super(message);
  }
}
