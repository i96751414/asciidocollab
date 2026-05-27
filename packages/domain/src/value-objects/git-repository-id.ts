import { Uuid, validateUuid } from './uuid';

export class GitRepositoryId extends Uuid {
  private constructor(value: string) {
    super(value);
  }

  static create(value: string): GitRepositoryId {
    validateUuid(value, 'GitRepositoryId');
    return new GitRepositoryId(value);
  }
}
