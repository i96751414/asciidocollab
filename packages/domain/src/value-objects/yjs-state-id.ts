import { Uuid, validateUuid } from './uuid';

export class YjsStateId extends Uuid {
  private constructor(value: string) {
    super(value);
  }

  static create(value: string): YjsStateId {
    validateUuid(value, 'YjsStateId');
    return new YjsStateId(value);
  }
}
