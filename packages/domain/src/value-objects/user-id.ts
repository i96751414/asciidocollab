import { Uuid, validateUuid } from './uuid';

export class UserId extends Uuid {
  private constructor(value: string) {
    super(value);
  }

  static create(value: string): UserId {
    validateUuid(value, 'UserId');
    return new UserId(value);
  }
}
