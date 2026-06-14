import { UserId } from '../../value-objects/ids/user-id';
import { ProjectId } from '../../value-objects/ids/project-id';
import { FileNodeId } from '../../value-objects/ids/file-node-id';
import { MimeType } from '../../value-objects/files/mime-type';
import { ProjectMemberRepository } from '../../ports/project/project-member.repository';
import { AssetRepository } from '../../ports/file-tree/asset.repository';
import { FileNodeRepository } from '../../ports/file-tree/file-node.repository';
import { ProjectFileStore } from '../../ports/storage/project-file-store';
import { FileNodeNotFoundError } from '../../errors/file-tree/file-node-not-found';
import { ContentNotFoundError } from '../../errors/content/content-not-found';
import { requireMemberAndFileNode } from './content-helpers';
import { DomainError } from '../../errors/domain-error';
import { Result } from '../../types/result';

/** Reads the raw bytes of an uploaded file asset for a project member. */
export class GetAssetContentUseCase {
  /** Initializes the use case with the repositories and file store needed to retrieve asset content. */
  constructor(
    private readonly projectMemberRepo: ProjectMemberRepository,
    private readonly assetRepo: AssetRepository,
    private readonly fileNodeRepo: FileNodeRepository,
    private readonly fileStore: ProjectFileStore,
  ) {}

  /**
   * Validates membership, locates the FileNode and Asset records, reads their
   * bytes from disk, and returns them with metadata.
   */
  async execute(
    actorId: UserId,
    projectId: ProjectId,
    fileNodeId: FileNodeId,
  ): Promise<Result<{ bytes: Buffer; mimeType: MimeType; filename: string }, DomainError>> {
    const access = await requireMemberAndFileNode(this.projectMemberRepo, this.fileNodeRepo, projectId, actorId, fileNodeId);
    if (!access.success) return access;
    const { fileNode } = access;

    const asset = await this.assetRepo.findById(fileNodeId);
    if (!asset) {
      return { success: false, error: new FileNodeNotFoundError(fileNodeId.value) };
    }

    const bytes = await this.fileStore.read(projectId, fileNode.path);
    if (!bytes) {
      return { success: false, error: new ContentNotFoundError(fileNode.path.value) };
    }

    return { success: true, value: { bytes, mimeType: asset.mimeType, filename: fileNode.name } };
  }
}
