import { Uuid, validateUuid } from './uuid';

export class TemplateId extends Uuid {
  private constructor(value: string) {
    super(value);
  }

  static create(value: string): TemplateId {
    validateUuid(value, 'TemplateId');
    return new TemplateId(value);
  }
}
