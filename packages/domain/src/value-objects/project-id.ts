import { Uuid, validateUuid } from './uuid';

/**
 * Unique identifier for a Project entity.
 */
export class ProjectId extends Uuid {
  private constructor(value: string) {
    super(value);
  }

  /**
   * Creates a new ProjectId after validating the UUID format.
   * 
   * @param value - A UUID v4 string.
   * @returns A new ProjectId instance.
   * @throws {ValidationError} If the value is not a valid UUID v4.
   */
  static create(value: string): ProjectId {
    validateUuid(value, 'ProjectId');
    return new ProjectId(value);
  }
}
