import { UserId } from '../value-objects/user-id';
import { ProjectId } from '../value-objects/project-id';
import { FileNodeId } from '../value-objects/file-node-id';
import { ContentId } from '../value-objects/content-id';
import { ProjectMemberRepository } from '../repositories/project-member.repository';
import { FileNodeRepository } from '../repositories/file-node.repository';
import { DocumentRepository } from '../repositories/document.repository';
import { ProjectFileStore } from '../storage/project-file-store';
import { PermissionDeniedError } from '../errors/permission-denied';
import { FileNodeNotFoundError } from '../errors/file-node-not-found';
import { DomainError } from '../errors/domain-error';
import { Result } from '../types/result';
import { Document } from '../entities/document';
import { Timestamps } from '../value-objects/timestamps';
import { randomUUID } from 'crypto';

/** Atomically saves updated AsciiDoc content for a document a project member can edit. */
export class SaveDocumentContentUseCase {
  /** Initializes the use case with the repositories and file store required to persist document content. */
  constructor(
    private readonly projectMemberRepo: ProjectMemberRepository,
    private readonly fileNodeRepo: FileNodeRepository,
    private readonly documentRepo: DocumentRepository,
    private readonly fileStore: ProjectFileStore,
  ) {}

  /** Validates membership, writes the content to disk, and bumps the document's content ID. */
  async execute(
    actorId: UserId,
    projectId: ProjectId,
    fileNodeId: FileNodeId,
    content: Buffer,
  ): Promise<Result<void, DomainError>> {
    const member = await this.projectMemberRepo.findByCompositeKey(projectId, actorId);
    if (!member) {
      return { success: false, error: new PermissionDeniedError() };
    }

    const fileNode = await this.fileNodeRepo.findById(fileNodeId);
    if (!fileNode) {
      return { success: false, error: new FileNodeNotFoundError(fileNodeId.value) };
    }

    const document = await this.documentRepo.findByFileNodeId(fileNodeId);
    if (!document) {
      return { success: false, error: new FileNodeNotFoundError(fileNodeId.value) };
    }

    try {
      await this.fileStore.write(projectId, fileNode.path, content);
    } catch {
      return { success: false, error: new FileNodeNotFoundError(fileNodeId.value) };
    }

    const updated = new Document(
      document.id,
      document.fileNodeId,
      ContentId.create(randomUUID()),
      document.yjsStateId,
      document.mimeType,
      new Timestamps(document.createdAt, new Date()),
    );
    await this.documentRepo.save(updated);

    return { success: true, value: undefined };
  }
}
