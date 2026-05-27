import { Document } from '../entities/document';
import { DocumentId } from '../value-objects/document-id';
import { FileNodeId } from '../value-objects/file-node-id';

/**
 * Repository interface for managing Document persistence.
 * Handles storage and retrieval of document content associated with file nodes.
 */
export interface DocumentRepository {
  /**
   * Finds a document by its unique identifier.
   * 
   * @param id - The unique identifier of the document.
   * @returns The document if found, null otherwise.
   */
  findById(id: DocumentId): Promise<Document | null>;

  /**
   * Finds a document associated with a specific file node.
   * 
   * @param fileNodeId - The unique identifier of the file node.
   * @returns The document if found, null otherwise.
   */
  findByFileNodeId(fileNodeId: FileNodeId): Promise<Document | null>;

  /**
   * Finds all documents associated with the given file node identifiers.
   * 
   * @param fileNodeIds - An array of file node unique identifiers.
   * @returns An array of matching documents.
   */
  findByFileNodeIds(fileNodeIds: FileNodeId[]): Promise<Document[]>;

  /**
   * Persists a document entity (create or update).
   * 
   * @param document - The document entity to save.
   * @returns A promise that resolves when the operation completes.
   */
  save(document: Document): Promise<void>;

  /**
   * Removes a document by its unique identifier.
   * 
   * @param id - The unique identifier of the document to delete.
   * @returns A promise that resolves when the operation completes.
   */
  delete(id: DocumentId): Promise<void>;
}
