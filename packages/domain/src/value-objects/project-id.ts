import { Uuid, validateUuid } from './uuid';

export class ProjectId extends Uuid {
  private constructor(value: string) {
    super(value);
  }

  static create(value: string): ProjectId {
    validateUuid(value, 'ProjectId');
    return new ProjectId(value);
  }
}
