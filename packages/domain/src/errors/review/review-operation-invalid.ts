import { DomainError } from '../domain-error';

/**
 * Thrown when a review operation is invalid for the item's current shape — e.g.
 * Resolving a task through the comment path, replying with task fields, or
 * setting a status on a comment. Distinct from a value-validation failure.
 */
export class ReviewOperationInvalidError extends DomainError {
  readonly name = 'ReviewOperationInvalidError';

  /**
   * @param message - A safe, human-readable description of the invalid operation.
   */
  constructor(message: string) {
    super(message);
  }
}
