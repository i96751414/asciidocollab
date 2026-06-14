import { UserId } from '../../value-objects/ids/user-id';
import { ProjectId } from '../../value-objects/ids/project-id';
import { FileNodeId } from '../../value-objects/ids/file-node-id';
import { ProjectMemberRepository } from '../../ports/project/project-member.repository';
import { FileNodeRepository } from '../../ports/file-tree/file-node.repository';
import { DocumentRepository } from '../../ports/file-tree/document.repository';
import { ProjectFileStore } from '../../ports/storage/project-file-store';
import { FileNodeNotFoundError } from '../../errors/file-tree/file-node-not-found';
import { ContentNotFoundError } from '../../errors/content/content-not-found';
import { requireMemberAndFileNode } from './content-helpers';
import { DomainError } from '../../errors/domain-error';
import { Result } from '../../types/result';
import { MimeType } from '../../value-objects/files/mime-type';

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
  ): Promise<Result<{ content: Buffer; mimeType: MimeType; contentId: string }, DomainError>> {
    const access = await requireMemberAndFileNode(this.projectMemberRepo, this.fileNodeRepo, projectId, actorId, fileNodeId);
    if (!access.success) return access;
    const { fileNode } = access;

    const document = await this.documentRepo.findByFileNodeId(fileNodeId);
    if (!document) {
      return { success: false, error: new FileNodeNotFoundError(fileNodeId.value) };
    }

    const content = await this.fileStore.read(projectId, fileNode.path);
    if (!content) {
      return { success: false, error: new ContentNotFoundError(fileNode.path.value) };
    }

    return { success: true, value: { content, mimeType: document.mimeType, contentId: document.contentId.value } };
  }
}
