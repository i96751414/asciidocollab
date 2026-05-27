import { Uuid, validateUuid } from './uuid';

export class DocumentId extends Uuid {
  private constructor(value: string) {
    super(value);
  }

  static create(value: string): DocumentId {
    validateUuid(value, 'DocumentId');
    return new DocumentId(value);
  }
}
