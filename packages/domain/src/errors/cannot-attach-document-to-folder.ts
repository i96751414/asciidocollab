import { DomainError } from './domain-error';

/**
 * Thrown when a document is attempted to be attached to a folder-type FileNode.
 */
export class CannotAttachDocumentToFolderError extends DomainError {
  readonly name = 'CannotAttachDocumentToFolderError';

  /**
   * @param fileNodeId - The ID of the folder FileNode.
   */
  constructor(fileNodeId: string) {
    super(`Cannot attach a document to folder FileNode: ${fileNodeId}`);
  }
}
