import { DomainError } from '../domain-error';

/**
 * Thrown when a file node (file or folder) is referenced but does not exist.
 */
export class FileNodeNotFoundError extends DomainError {
  readonly name = 'FileNodeNotFoundError';

  /**
   * @param fileNodeId - The ID of the file node that was not found.
   */
  constructor(fileNodeId: string) {
    super(`FileNode not found: ${fileNodeId}`);
  }
}
