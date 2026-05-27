import { Uuid, validateUuid } from './uuid';

/**
 * Unique identifier for a Document entity.
 */
export class DocumentId extends Uuid {
  private constructor(value: string) {
    super(value);
  }

  /**
   * Creates a new DocumentId after validating the UUID format.
   * 
   * @param value - A UUID v4 string.
   * @returns A new DocumentId instance.
   * @throws {ValidationError} If the value is not a valid UUID v4.
   */
  static create(value: string): DocumentId {
    validateUuid(value, 'DocumentId');
    return new DocumentId(value);
  }
}
