import { Uuid, validateUuid } from './uuid';

export class FileNodeId extends Uuid {
  private constructor(value: string) {
    super(value);
  }

  static create(value: string): FileNodeId {
    validateUuid(value, 'FileNodeId');
    return new FileNodeId(value);
  }
}
