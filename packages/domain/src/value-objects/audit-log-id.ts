import { Uuid, validateUuid } from './uuid';

export class AuditLogId extends Uuid {
  private constructor(value: string) {
    super(value);
  }

  static create(value: string): AuditLogId {
    validateUuid(value, 'AuditLogId');
    return new AuditLogId(value);
  }
}
