import { Uuid, validateUuid } from './uuid';

/**
 * Unique identifier for a Template entity.
 */
export class TemplateId extends Uuid {
  private constructor(value: string) {
    super(value);
  }

  /**
   * Creates a new TemplateId after validating the UUID format.
   * 
   * @param value - A UUID v4 string.
   * @returns A new TemplateId instance.
   * @throws {ValidationError} If the value is not a valid UUID v4.
   */
  static create(value: string): TemplateId {
    validateUuid(value, 'TemplateId');
    return new TemplateId(value);
  }
}
