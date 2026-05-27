import { Uuid, validateUuid } from './uuid';

/**
 * Unique identifier for an AuditLog entity.
 */
export class AuditLogId extends Uuid {
  private constructor(value: string) {
    super(value);
  }

  /**
   * Creates a new AuditLogId after validating the UUID format.
   * 
   * @param value - A UUID v4 string.
   * @returns A new AuditLogId instance.
   * @throws {ValidationError} If the value is not a valid UUID v4.
   */
  static create(value: string): AuditLogId {
    validateUuid(value, 'AuditLogId');
    return new AuditLogId(value);
  }
}
