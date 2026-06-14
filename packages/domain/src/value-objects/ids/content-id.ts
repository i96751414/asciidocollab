import { Uuid, validateUuid } from './uuid';

/**
 * Unique identifier for document content.
 * Each Document has a distinct ContentId referencing its content blob.
 */
export class ContentId extends Uuid {
  private constructor(value: string) {
    super(value);
  }

  /**
   * Creates a new ContentId after validating the UUID format.
   * 
   * @param value - A UUID v4 string.
   * @returns A new ContentId instance.
   * @throws {ValidationError} If the value is not a valid UUID v4.
   */
  static create(value: string): ContentId {
    validateUuid(value, 'ContentId');
    return new ContentId(value);
  }
}
