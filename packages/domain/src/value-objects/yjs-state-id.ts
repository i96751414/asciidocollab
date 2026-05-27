import { Uuid, validateUuid } from './uuid';

/**
 * Unique identifier for a Yjs collaboration state.
 * Each Document has a distinct YjsStateId referencing its collaborative editing state.
 */
export class YjsStateId extends Uuid {
  private constructor(value: string) {
    super(value);
  }

  /**
   * Creates a new YjsStateId after validating the UUID format.
   * 
   * @param value - A UUID v4 string.
   * @returns A new YjsStateId instance.
   * @throws {ValidationError} If the value is not a valid UUID v4.
   */
  static create(value: string): YjsStateId {
    validateUuid(value, 'YjsStateId');
    return new YjsStateId(value);
  }
}
