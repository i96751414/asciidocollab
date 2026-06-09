import { UserId } from '../../value-objects/user-id';
import { ProjectId } from '../../value-objects/project-id';
import { FileNodeId } from '../../value-objects/file-node-id';
import { ProjectMemberRepository } from '../../ports/project/project-member.repository';
import { FileNodeRepository } from '../../ports/file-tree/file-node.repository';
import { DocumentRepository } from '../../ports/file-tree/document.repository';
import { AssetRepository } from '../../ports/file-tree/asset.repository';
import { ProjectFileStore } from '../../ports/storage/project-file-store';
import { ContentNotFoundError } from '../../errors/content-not-found';
import { requireMemberAndFileNode } from './content-helpers';
import { DomainError } from '../../errors/domain-error';
import { Result } from '../../types/result';
import { MimeType } from '../../value-objects/mime-type';

/** Result type that includes an optional contentId (present for documents, absent for assets). */
export interface FileNodeContent {
  /** Raw file bytes. */
  content: Buffer;
  /** MIME type of the file. */
  mimeType: MimeType;
  /** Content record id — present for text documents, absent for binary assets. */
  contentId?: string;
}

/**
 * Reads the raw bytes for any file node — documents (AsciiDoc/text) or binary assets (images).
 * Tries the document store first; falls back to the asset store when no document record exists.
 */
export class GetFileNodeContentUseCase {
  /** Creates a new GetFileNodeContentUseCase. */
  constructor(
    private readonly projectMemberRepo: ProjectMemberRepository,
    private readonly fileNodeRepo: FileNodeRepository,
    private readonly documentRepo: DocumentRepository,
    private readonly assetRepo: AssetRepository,
    private readonly fileStore: ProjectFileStore,
  ) {}

  /** Reads the raw bytes for the given file node, checking project membership first. */
  async execute(
    actorId: UserId,
    projectId: ProjectId,
    fileNodeId: FileNodeId,
  ): Promise<Result<FileNodeContent, DomainError>> {
    const access = await requireMemberAndFileNode(this.projectMemberRepo, this.fileNodeRepo, projectId, actorId, fileNodeId);
    if (!access.success) return access;
    const { fileNode } = access;

    // Try document record first (text files / AsciiDoc).
    const document = await this.documentRepo.findByFileNodeId(fileNodeId);
    if (document) {
      const content = await this.fileStore.read(projectId, fileNode.path);
      if (!content) {
        return { success: false, error: new ContentNotFoundError(fileNode.path.value) };
      }
      return { success: true, value: { content, mimeType: document.mimeType, contentId: document.contentId.value } };
    }

    // Fall back to asset record (binary/image files). Asset.id == FileNode.id.
    const asset = await this.assetRepo.findById(fileNodeId);
    if (!asset) {
      return { success: false, error: new ContentNotFoundError(fileNode.path.value) };
    }

    const content = await this.fileStore.read(projectId, fileNode.path);
    if (!content) {
      return { success: false, error: new ContentNotFoundError(fileNode.path.value) };
    }

    return { success: true, value: { content, mimeType: asset.mimeType } };
  }
}
