import { UserId } from '../value-objects/user-id';
import { ProjectId } from '../value-objects/project-id';
import { ImageId } from '../value-objects/image-id';
import { FilePath } from '../value-objects/file-path';
import { MimeType } from '../value-objects/mime-type';
import { ProjectMemberRepository } from '../repositories/project-member.repository';
import { ImageRepository } from '../repositories/image.repository';
import { FileNodeRepository } from '../repositories/file-node.repository';
import { ProjectFileStore } from '../storage/project-file-store';
import { PermissionDeniedError } from '../errors/permission-denied';
import { FileNodeNotFoundError } from '../errors/file-node-not-found';
import { ContentNotFoundError } from '../errors/content-not-found';
import { DomainError } from '../errors/domain-error';
import { Result } from '../types/result';

/** Reads the raw bytes of an uploaded file asset for a project member. */
export class GetAssetContentUseCase {
  /** Initializes the use case with the repositories and file store needed to retrieve asset content. */
  constructor(
    private readonly projectMemberRepo: ProjectMemberRepository,
    private readonly imageRepo: ImageRepository,
    private readonly fileNodeRepo: FileNodeRepository,
    private readonly fileStore: ProjectFileStore,
  ) {}

  /** Validates membership, locates the asset record, reads its bytes from disk, and returns them with metadata. */
  async execute(
    actorId: UserId,
    projectId: ProjectId,
    assetId: ImageId,
  ): Promise<Result<{ bytes: Buffer; mimeType: MimeType; filename: string }, DomainError>> {
    const member = await this.projectMemberRepo.findByCompositeKey(projectId, actorId);
    if (!member) {
      return { success: false, error: new PermissionDeniedError() };
    }

    const image = await this.imageRepo.findById(assetId);
    if (!image) {
      return { success: false, error: new FileNodeNotFoundError(assetId.value) };
    }

    const filePath = FilePath.create(image.storagePath);
    const bytes = await this.fileStore.read(projectId, filePath);
    if (!bytes) {
      return { success: false, error: new ContentNotFoundError(image.storagePath) };
    }

    return { success: true, value: { bytes, mimeType: image.mimeType, filename: image.filename } };
  }
}
