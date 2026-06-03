import { PrismaClient } from '@prisma/client';
import { Document, DocumentId, FileNodeId, ContentId, YjsStateId, MimeType, Timestamps, DocumentRepository } from '@asciidocollab/domain';

/**
 * Prisma-backed implementation of the `DocumentRepository` interface.
 * Maps between domain `Document` entities and the `Document` database table.
 * Documents have a one-to-one relationship with `FileNode` via `fileNodeId`.
 */
export class PrismaDocumentRepository implements DocumentRepository {
  /** Creates a new PrismaDocumentRepository. */
  constructor(
    /** The Prisma client used for database operations. */
    private readonly prisma: PrismaClient,
  ) {}

  /**
   * @param id - The unique identifier of the document.
   * @returns The document if found, null otherwise.
   */
  async findById(id: DocumentId): Promise<Document | null> {
    const record = await this.prisma.document.findUnique({ where: { id: id.value } });
    return record ? toDomainDocument(record) : null;
  }

  /**
   * @param fileNodeId - The file node ID associated with the document.
   * @returns The document if a mapping exists, null otherwise.
   */
  async findByFileNodeId(fileNodeId: FileNodeId): Promise<Document | null> {
    const record = await this.prisma.document.findUnique({ where: { fileNodeId: fileNodeId.value } });
    return record ? toDomainDocument(record) : null;
  }

  /**
   * @param fileNodeIds - The file node IDs to look up documents for.
   * @returns All documents matching any of the given file node IDs.
   */
  async findByFileNodeIds(fileNodeIds: FileNodeId[]): Promise<Document[]> {
    const records = await this.prisma.document.findMany({
      where: { fileNodeId: { in: fileNodeIds.map((id) => id.value) } },
    });
    return records.map(toDomainDocument);
  }

  /**
   * Creates or updates a document. Uses upsert so the same method
   * handles both insert and update.
   * 
   * @param document - The document entity to persist.
   */
  async save(document: Document): Promise<void> {
    await this.prisma.document.upsert({
      where: { id: document.id.value },
      create: toPersistenceDocument(document),
      update: toPersistenceDocument(document),
    });
  }

  /**
   * @param id - The unique identifier of the document to delete.
   */
  async delete(id: DocumentId): Promise<void> {
    await this.prisma.document.deleteMany({ where: { id: id.value } });
  }
}

type DocumentRecord = {
  id: string; fileNodeId: string; contentId: string;
  yjsStateId: string; mimeType: string; createdAt: Date; updatedAt: Date;
};

function toDomainDocument(record: DocumentRecord): Document {
  return new Document(
    DocumentId.create(record.id),
    FileNodeId.create(record.fileNodeId),
    ContentId.create(record.contentId),
    YjsStateId.create(record.yjsStateId),
    MimeType.create(record.mimeType),
    new Timestamps(record.createdAt, record.updatedAt),
  );
}

function toPersistenceDocument(document: Document): DocumentRecord {
  return {
    id: document.id.value,
    fileNodeId: document.fileNodeId.value,
    contentId: document.contentId.value,
    yjsStateId: document.yjsStateId.value,
    mimeType: document.mimeType.value,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}
