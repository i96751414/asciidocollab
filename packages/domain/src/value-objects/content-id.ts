import { Uuid, validateUuid } from './uuid';

export class ContentId extends Uuid {
  private constructor(value: string) {
    super(value);
  }

  static create(value: string): ContentId {
    validateUuid(value, 'ContentId');
    return new ContentId(value);
  }
}
