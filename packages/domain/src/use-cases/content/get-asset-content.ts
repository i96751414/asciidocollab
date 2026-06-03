import { UserId } from '../../value-objects/user-id';
import { ProjectId } from '../../value-objects/project-id';
import { AssetId } from '../../value-objects/asset-id';
import { FilePath } from '../../value-objects/file-path';
import { MimeType } from '../../value-objects/mime-type';
import { ProjectMemberRepository } from '../../ports/project/project-member.repository';
import { AssetRepository } from '../../ports/file-tree/asset.repository';
import { FileNodeRepository } from '../../ports/file-tree/file-node.repository';
import { ProjectFileStore } from '../../ports/storage/project-file-store';
import { PermissionDeniedError } from '../../errors/permission-denied';
import { FileNodeNotFoundError } from '../../errors/file-node-not-found';
import { ContentNotFoundError } from '../../errors/content-not-found';
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

  /** Validates membership, locates the asset record, reads its bytes from disk, and returns them with metadata. */
  async execute(
    actorId: UserId,
    projectId: ProjectId,
    assetId: AssetId,
  ): Promise<Result<{ bytes: Buffer; mimeType: MimeType; filename: string }, DomainError>> {
    const member = await this.projectMemberRepo.findByCompositeKey(projectId, actorId);
    if (!member) {
      return { success: false, error: new PermissionDeniedError() };
    }

    const asset = await this.assetRepo.findById(assetId);
    if (!asset || asset.projectId.value !== projectId.value) {
      return { success: false, error: new FileNodeNotFoundError(assetId.value) };
    }

    const filePath = FilePath.create(asset.storagePath);
    const bytes = await this.fileStore.read(projectId, filePath);
    if (!bytes) {
      return { success: false, error: new ContentNotFoundError(asset.storagePath) };
    }

    return { success: true, value: { bytes, mimeType: asset.mimeType, filename: asset.filename } };
  }
}
