import { UserId } from '../../value-objects/user-id';
import { ProjectId } from '../../value-objects/project-id';
import { FileNodeId } from '../../value-objects/file-node-id';
import { ProjectMemberRepository } from '../../ports/project/project-member.repository';
import { FileNodeRepository } from '../../ports/file-tree/file-node.repository';
import { DocumentRepository } from '../../ports/file-tree/document.repository';
import { AssetRepository } from '../../ports/file-tree/asset.repository';
import { ProjectFileStore } from '../../ports/storage/project-file-store';
import { PermissionDeniedError } from '../../errors/permission-denied';
import { FileNodeNotFoundError } from '../../errors/file-node-not-found';
import { ContentNotFoundError } from '../../errors/content-not-found';
import { DomainError } from '../../errors/domain-error';
import { Result } from '../../types/result';
import { MimeType } from '../../value-objects/mime-type';

/** Result type that includes an optional contentId (present for documents, absent for assets). */
export interface FileNodeContent {
  content: Buffer;
  mimeType: MimeType;
  contentId?: string;
}

/**
 * Reads the raw bytes for any file node — documents (AsciiDoc/text) or binary assets (images).
 * Tries the document store first; falls back to the asset store when no document record exists.
 */
export class GetFileNodeContentUseCase {
  constructor(
    private readonly projectMemberRepo: ProjectMemberRepository,
    private readonly fileNodeRepo: FileNodeRepository,
    private readonly documentRepo: DocumentRepository,
    private readonly assetRepo: AssetRepository,
    private readonly fileStore: ProjectFileStore,
  ) {}

  async execute(
    actorId: UserId,
    projectId: ProjectId,
    fileNodeId: FileNodeId,
  ): Promise<Result<FileNodeContent, DomainError>> {
    const member = await this.projectMemberRepo.findByCompositeKey(projectId, actorId);
    if (!member) {
      return { success: false, error: new PermissionDeniedError() };
    }

    const fileNode = await this.fileNodeRepo.findById(fileNodeId);
    if (!fileNode || fileNode.projectId.value !== projectId.value) {
      return { success: false, error: new FileNodeNotFoundError(fileNodeId.value) };
    }

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
