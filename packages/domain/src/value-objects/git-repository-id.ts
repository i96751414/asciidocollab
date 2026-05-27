import { Uuid, validateUuid } from './uuid';

/**
 * Unique identifier for a GitRepository entity.
 */
export class GitRepositoryId extends Uuid {
  private constructor(value: string) {
    super(value);
  }

  /**
   * Creates a new GitRepositoryId after validating the UUID format.
   * 
   * @param value - A UUID v4 string.
   * @returns A new GitRepositoryId instance.
   * @throws {ValidationError} If the value is not a valid UUID v4.
   */
  static create(value: string): GitRepositoryId {
    validateUuid(value, 'GitRepositoryId');
    return new GitRepositoryId(value);
  }
}
