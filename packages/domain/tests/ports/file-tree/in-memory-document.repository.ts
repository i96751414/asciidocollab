import { Document } from '../../../src/entities/document';
import { DocumentId } from '../../../src/value-objects/document-id';
import { FileNodeId } from '../../../src/value-objects/file-node-id';
import { DocumentRepository } from '../../../src/ports/file-tree/document.repository';

/** In-memory implementation of DocumentRepository for use in tests. */
export class InMemoryDocumentRepository implements DocumentRepository {
  private readonly storage = new Map<string, Document>();

  /** Returns the document with the given ID, or null if not found. */
  async findById(id: DocumentId): Promise<Document | null> {
    return this.storage.get(id.value) ?? null;
  }

  /** Returns the document associated with the given file node ID, or null if not found. */
  async findByFileNodeId(fileNodeId: FileNodeId): Promise<Document | null> {
    for (const document of this.storage.values()) {
      if (document.fileNodeId.value === fileNodeId.value) {
        return document;
      }
    }
    return null;
  }

  /** Returns all documents whose file node ID is in the provided list. */
  async findByFileNodeIds(fileNodeIds: FileNodeId[]): Promise<Document[]> {
    const ids = new Set(fileNodeIds.map((id) => id.value));
    return [...this.storage.values()].filter((document) =>
      ids.has(document.fileNodeId.value),
    );
  }

  /** Stores a document in memory, overwriting any existing entry with the same ID. */
  async save(document: Document): Promise<void> {
    this.storage.set(document.id.value, document);
  }

  /** Removes the document with the given ID from memory. */
  async delete(id: DocumentId): Promise<void> {
    this.storage.delete(id.value);
  }
}
