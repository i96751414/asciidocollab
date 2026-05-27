import { Uuid, validateUuid } from './uuid';

/**
 * Unique identifier for an Image entity.
 */
export class ImageId extends Uuid {
  private constructor(value: string) {
    super(value);
  }

  /**
   * Creates a new ImageId after validating the UUID format.
   * 
   * @param value - A UUID v4 string.
   * @returns A new ImageId instance.
   * @throws {ValidationError} If the value is not a valid UUID v4.
   */
  static create(value: string): ImageId {
    validateUuid(value, 'ImageId');
    return new ImageId(value);
  }
}
