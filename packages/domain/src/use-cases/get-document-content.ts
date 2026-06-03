import { UserId } from '../value-objects/user-id';
import { ProjectId } from '../value-objects/project-id';
import { FileNodeId } from '../value-objects/file-node-id';
import { ProjectMemberRepository } from '../repositories/project-member.repository';
import { FileNodeRepository } from '../repositories/file-node.repository';
import { DocumentRepository } from '../repositories/document.repository';
import { ProjectFileStore } from '../storage/project-file-store';
import { PermissionDeniedError } from '../errors/permission-denied';
import { FileNodeNotFoundError } from '../errors/file-node-not-found';
import { ContentNotFoundError } from '../errors/content-not-found';
import { DomainError } from '../errors/domain-error';
import { Result } from '../types/result';
import { MimeType } from '../value-objects/mime-type';

/** Reads the raw AsciiDoc content bytes of a document for a project member. */
export class GetDocumentContentUseCase {
  /** Initializes the use case with the repositories and file store needed to read document content. */
  constructor(
    private readonly projectMemberRepo: ProjectMemberRepository,
    private readonly fileNodeRepo: FileNodeRepository,
    private readonly documentRepo: DocumentRepository,
    private readonly fileStore: ProjectFileStore,
  ) {}

  /** Validates membership, resolves the document record, reads its file from disk, and returns the raw bytes. */
  async execute(
    actorId: UserId,
    projectId: ProjectId,
    fileNodeId: FileNodeId,
  ): Promise<Result<{ content: Buffer; mimeType: MimeType }, DomainError>> {
    const member = await this.projectMemberRepo.findByCompositeKey(projectId, actorId);
    if (!member) {
      return { success: false, error: new PermissionDeniedError() };
    }

    const fileNode = await this.fileNodeRepo.findById(fileNodeId);
    if (!fileNode || fileNode.projectId.value !== projectId.value) {
      return { success: false, error: new FileNodeNotFoundError(fileNodeId.value) };
    }

    const document = await this.documentRepo.findByFileNodeId(fileNodeId);
    if (!document) {
      return { success: false, error: new FileNodeNotFoundError(fileNodeId.value) };
    }

    const content = await this.fileStore.read(projectId, fileNode.path);
    if (!content) {
      return { success: false, error: new ContentNotFoundError(fileNode.path.value) };
    }

    return { success: true, value: { content, mimeType: document.mimeType } };
  }
}
