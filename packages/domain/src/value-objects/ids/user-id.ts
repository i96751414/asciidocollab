import { Uuid, validateUuid } from './uuid';

/**
 * Unique identifier for a User entity.
 */
export class UserId extends Uuid {
  private constructor(value: string) {
    super(value);
  }

  /**
   * Creates a new UserId after validating the UUID format.
   * 
   * @param value - A UUID v4 string.
   * @returns A new UserId instance.
   * @throws {ValidationError} If the value is not a valid UUID v4.
   */
  static create(value: string): UserId {
    validateUuid(value, 'UserId');
    return new UserId(value);
  }
}
