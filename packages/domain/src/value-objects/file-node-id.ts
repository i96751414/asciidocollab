import { Uuid, validateUuid } from './uuid';

/**
 * Unique identifier for a FileNode entity.
 */
export class FileNodeId extends Uuid {
  private constructor(value: string) {
    super(value);
  }

  /**
   * Creates a new FileNodeId after validating the UUID format.
   * 
   * @param value - A UUID v4 string.
   * @returns A new FileNodeId instance.
   * @throws {ValidationError} If the value is not a valid UUID v4.
   */
  static create(value: string): FileNodeId {
    validateUuid(value, 'FileNodeId');
    return new FileNodeId(value);
  }
}
