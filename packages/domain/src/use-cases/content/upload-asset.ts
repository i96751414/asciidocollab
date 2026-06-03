import { UserId } from '../../value-objects/user-id';
import { ProjectId } from '../../value-objects/project-id';
import { FileNodeId } from '../../value-objects/file-node-id';
import { FilePath } from '../../value-objects/file-path';
import { MimeType } from '../../value-objects/mime-type';
import { FileNodeType } from '../../value-objects/file-node-type';
import { AssetId } from '../../value-objects/asset-id';
import { ProjectMemberRepository } from '../../ports/project/project-member.repository';
import { FileNodeRepository } from '../../ports/file-tree/file-node.repository';
import { AssetRepository } from '../../ports/file-tree/asset.repository';
import { SystemSettingRepository } from '../../ports/admin/system-setting.repository';
import { ProjectFileStore } from '../../ports/storage/project-file-store';
import { PermissionDeniedError } from '../../errors/permission-denied';
import { FileNodeNotFoundError } from '../../errors/file-node-not-found';
import { ValidationError } from '../../errors/validation-error';
import { DomainError } from '../../errors/domain-error';
import { Result } from '../../types/result';
import { FileNode } from '../../entities/file-node';
import { Asset } from '../../entities/asset';
import { SETTING_MAX_UPLOAD_SIZE_BYTES } from '../../constants';
import { randomUUID } from 'crypto';

/** Saves an uploaded file asset and persists its metadata. */
export class UploadAssetUseCase {
  private static readonly ALLOWED_MIME_TYPES = new Set([
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp',
    'image/svg+xml',
    'image/bmp',
    'image/tiff',
    'application/pdf',
    'application/octet-stream',
    'text/plain',
    'text/csv',
  ]);
  /** Initializes the use case with the repositories and file store required to store and record an asset. */
  constructor(
    private readonly projectMemberRepo: ProjectMemberRepository,
    private readonly fileNodeRepo: FileNodeRepository,
    private readonly assetRepo: AssetRepository,
    private readonly fileStore: ProjectFileStore,
    private readonly systemSettingRepo: SystemSettingRepository,
    private readonly defaultMaxUploadSizeBytes: number,
  ) {}

  /** Validates membership and file size, stores the bytes on disk, and creates the file node and asset metadata records. */
  async execute(
    actorId: UserId,
    projectId: ProjectId,
    parentId: FileNodeId,
    filename: string,
    mimeType: MimeType,
    bytes: Buffer,
  ): Promise<Result<{ assetId: AssetId; fileNodeId: FileNodeId; storagePath: string }, DomainError>> {
    const member = await this.projectMemberRepo.findByCompositeKey(projectId, actorId);
    if (!member) {
      return { success: false, error: new PermissionDeniedError() };
    }

    if (!UploadAssetUseCase.ALLOWED_MIME_TYPES.has(mimeType.value)) {
      return { success: false, error: new ValidationError(`MIME type '${mimeType.value}' is not permitted`) };
    }

    const stored = await this.systemSettingRepo.get(SETTING_MAX_UPLOAD_SIZE_BYTES);
    const parsed = stored === null ? Number.NaN : Number(stored);
    const effectiveLimit = Number.isNaN(parsed) || parsed <= 0 ? this.defaultMaxUploadSizeBytes : parsed;

    if (bytes.length > effectiveLimit) {
      return { success: false, error: new ValidationError('File exceeds maximum permitted size') };
    }

    const parent = await this.fileNodeRepo.findById(parentId);
    if (!parent || parent.type.value !== 'folder' || parent.projectId.value !== projectId.value) {
      return { success: false, error: new FileNodeNotFoundError(parentId.value) };
    }

    const parentPath = parent.path.value === '/' ? '/' : `${parent.path.value}/`;
    const storagePath = `${parentPath}${filename}`;
    const filePath = FilePath.create(storagePath);

    const storeResult = await this.fileStore.createExclusive(projectId, filePath, bytes);
    if (!storeResult.success) {
      return { success: false, error: storeResult.error };
    }

    try {
      const fileNodeId = FileNodeId.create(randomUUID());
      const fileNode = new FileNode(fileNodeId, projectId, parentId, filename, FileNodeType.create('file'), filePath);
      await this.fileNodeRepo.save(fileNode);

      const assetId = AssetId.create(randomUUID());
      const asset = new Asset(assetId, projectId, filename, storagePath, mimeType, BigInt(bytes.length), null);
      await this.assetRepo.save(asset);

      return { success: true, value: { assetId, fileNodeId, storagePath } };
    } catch (error) {
      await this.fileStore.remove(projectId, filePath);
      throw error;
    }
  }
}
