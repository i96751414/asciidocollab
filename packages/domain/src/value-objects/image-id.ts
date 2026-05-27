import { Uuid, validateUuid } from './uuid';

export class ImageId extends Uuid {
  private constructor(value: string) {
    super(value);
  }

  static create(value: string): ImageId {
    validateUuid(value, 'ImageId');
    return new ImageId(value);
  }
}
