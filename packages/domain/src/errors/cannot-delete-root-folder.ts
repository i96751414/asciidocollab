import { DomainError } from './domain-error';

/**
 * Thrown when an attempt is made to delete the root folder of a project.
 */
export class CannotDeleteRootFolderError extends DomainError {
  readonly name = 'CannotDeleteRootFolderError';

  /**
   * @param fileNodeId - The ID of the root folder that cannot be deleted.
   */
  constructor(fileNodeId: string) {
    super(`Cannot delete root folder: ${fileNodeId}`);
  }
}
