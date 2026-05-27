import { DomainError } from './domain-error';

/**
 * Thrown when a project name fails validation.
 */
export class InvalidProjectNameError extends DomainError {
  readonly name = 'InvalidProjectNameError';

  /**
   * @param message - Optional custom message describing the validation failure.
   */
  constructor(message = 'Invalid project name') {
    super(message);
  }
}
