import { DomainError } from '../domain-error';

/**
 * Thrown when a bulk-delete's optimistic `expectedCount` guard does not match the
 * live count — protects against surprise wipes when items changed concurrently.
 */
export class ReviewCountConflictError extends DomainError {
  readonly name = 'ReviewCountConflictError';

  /**
   * @param expected - The count the caller expected.
   * @param actual - The live count found at delete time.
   */
  constructor(
    public readonly expected: number,
    public readonly actual: number,
  ) {
    super(`Review item count mismatch: expected ${expected}, found ${actual}`);
  }
}
