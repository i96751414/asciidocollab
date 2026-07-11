import { Uuid, validateUuid } from './uuid';

/**
 * Unique identifier for a ReviewComment (a review item — comment or task).
 */
export class ReviewCommentId extends Uuid {
  private constructor(value: string) {
    super(value);
  }

  /**
   * Creates a new ReviewCommentId after validating the UUID format.
   *
   * @param value - A UUID v4 string.
   * @returns A new ReviewCommentId instance.
   * @throws {ValidationError} If the value is not a valid UUID v4.
   */
  static create(value: string): ReviewCommentId {
    validateUuid(value, 'ReviewCommentId');
    return new ReviewCommentId(value);
  }
}
