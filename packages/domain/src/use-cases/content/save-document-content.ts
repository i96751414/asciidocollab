import { UserId } from '../../value-objects/ids/user-id';
import { ProjectId } from '../../value-objects/ids/project-id';
import { FileNodeId } from '../../value-objects/ids/file-node-id';
import { ContentId } from '../../value-objects/ids/content-id';
import { ProjectMemberRepository } from '../../ports/project/project-member.repository';
import { FileNodeRepository } from '../../ports/file-tree/file-node.repository';
import { DocumentRepository } from '../../ports/file-tree/document.repository';
import { ProjectFileStore } from '../../ports/storage/project-file-store';
import { CollaborationSessionRepository } from '../../ports/project/collaboration-session.repository';
import { FileNodeNotFoundError } from '../../errors/file-tree/file-node-not-found';
import { requireMemberAndFileNode } from './content-helpers';
import { ActiveCollaborationSessionError } from '../../errors/content/active-collaboration-session';
import { DomainError } from '../../errors/domain-error';
import { Result } from '../../types/result';
import { Document } from '../../entities/document';
import { Timestamps } from '../../value-objects/common/timestamps';
import { randomUUID } from 'crypto';

/** Atomically saves updated AsciiDoc content for a document a project member can edit. */
export class SaveDocumentContentUseCase {
  /** Initializes the use case with the repositories and file store required to persist document content. */
  constructor(
    private readonly projectMemberRepo: ProjectMemberRepository,
    private readonly fileNodeRepo: FileNodeRepository,
    private readonly documentRepo: DocumentRepository,
    private readonly fileStore: ProjectFileStore,
    private readonly collaborationSessionRepo?: CollaborationSessionRepository,
  ) {}

  /** Validates membership, writes the content to disk, and bumps the document's content ID. */
  async execute(
    actorId: UserId,
    projectId: ProjectId,
    fileNodeId: FileNodeId,
    content: Buffer,
  ): Promise<Result<{ contentId: string }, DomainError>> {
    const access = await requireMemberAndFileNode(this.projectMemberRepo, this.fileNodeRepo, projectId, actorId, fileNodeId);
    if (!access.success) return access;
    const { fileNode } = access;

    const document = await this.documentRepo.findByFileNodeId(fileNodeId);
    if (!document) {
      return { success: false, error: new FileNodeNotFoundError(fileNodeId.value) };
    }

    if (this.collaborationSessionRepo) {
      const isActive = await this.collaborationSessionRepo.isActive(projectId, document.id);
      if (isActive) {
        return { success: false, error: new ActiveCollaborationSessionError(document.id) };
      }
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

    return { success: true, value: { contentId: updated.contentId.value } };
  }
}
