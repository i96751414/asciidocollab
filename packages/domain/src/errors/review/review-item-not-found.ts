import { DomainError } from '../domain-error';

/** Thrown when a review item (comment/task) cannot be found within the caller's project scope. */
export class ReviewItemNotFoundError extends DomainError {
  readonly name = 'ReviewItemNotFoundError';

  /**
   * @param reviewItemId - The id that was not found (safe to echo — it is the caller's own input).
   */
  constructor(reviewItemId: string) {
    super(`Review item not found: ${reviewItemId}`);
  }
}
