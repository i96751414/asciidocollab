import { Uuid, validateUuid } from './uuid';

/**
 * Unique identifier for a ReviewReaction (one user's emoji reaction to an item).
 */
export class ReviewReactionId extends Uuid {
  private constructor(value: string) {
    super(value);
  }

  /**
   * Creates a new ReviewReactionId after validating the UUID format.
   *
   * @param value - A UUID v4 string.
   * @returns A new ReviewReactionId instance.
   * @throws {ValidationError} If the value is not a valid UUID v4.
   */
  static create(value: string): ReviewReactionId {
    validateUuid(value, 'ReviewReactionId');
    return new ReviewReactionId(value);
  }
}
