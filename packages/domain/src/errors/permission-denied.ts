import { DomainError } from './domain-error';

/**
 * Thrown when the caller does not have the required permissions for an operation.
 */
export class PermissionDeniedError extends DomainError {
  readonly name = 'PermissionDeniedError';

  /**
   * @param message - Optional custom message (defaults to "Permission denied").
   */
  constructor(message = 'Permission denied') {
    super(message);
  }
}
