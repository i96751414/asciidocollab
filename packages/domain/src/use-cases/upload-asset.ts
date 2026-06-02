import { UserId } from '../value-objects/user-id';
import { ProjectId } from '../value-objects/project-id';
import { FileNodeId } from '../value-objects/file-node-id';
import { FilePath } from '../value-objects/file-path';
import { MimeType } from '../value-objects/mime-type';
import { FileNodeType } from '../value-objects/file-node-type';
import { ImageId } from '../value-objects/image-id';
import { ProjectMemberRepository } from '../repositories/project-member.repository';
import { FileNodeRepository } from '../repositories/file-node.repository';
import { ImageRepository } from '../repositories/image.repository';
import { SystemSettingRepository } from '../repositories/system-setting.repository';
import { ProjectFileStore } from '../storage/project-file-store';
import { PermissionDeniedError } from '../errors/permission-denied';
import { FileNodeNotFoundError } from '../errors/file-node-not-found';
import { ValidationError } from '../errors/validation-error';
import { DomainError } from '../errors/domain-error';
import { Result } from '../types/result';
import { FileNode } from '../entities/file-node';
import { Image } from '../entities/image';
import { SETTING_MAX_UPLOAD_SIZE_BYTES } from '../constants';
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
    private readonly imageRepo: ImageRepository,
    private readonly fileStore: ProjectFileStore,
    private readonly systemSettingRepo: SystemSettingRepository,
    private readonly defaultMaxUploadSizeBytes: number,
  ) {}

  /** Validates membership and file size, stores the bytes on disk, and creates the file node and image metadata records. */
  async execute(
    actorId: UserId,
    projectId: ProjectId,
    parentId: FileNodeId,
    filename: string,
    mimeType: MimeType,
    bytes: Buffer,
  ): Promise<Result<{ assetId: ImageId; storagePath: string }, DomainError>> {
    const member = await this.projectMemberRepo.findByCompositeKey(projectId, actorId);
    if (!member) {
      return { success: false, error: new PermissionDeniedError() };
    }

    if (!UploadAssetUseCase.ALLOWED_MIME_TYPES.has(mimeType.value)) {
      return { success: false, error: new ValidationError(`MIME type '${mimeType.value}' is not permitted`) };
    }

    const stored = await this.systemSettingRepo.get(SETTING_MAX_UPLOAD_SIZE_BYTES);
    const effectiveLimit = stored === null ? this.defaultMaxUploadSizeBytes : Number(stored);

    if (bytes.length === 0) {
      return { success: false, error: new ValidationError('File must not be empty') };
    }

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

    const fileNodeId = FileNodeId.create(randomUUID());
    const fileNode = new FileNode(fileNodeId, projectId, parentId, filename, FileNodeType.create('file'), filePath);
    await this.fileNodeRepo.save(fileNode);

    const assetId = ImageId.create(randomUUID());
    const image = new Image(assetId, projectId, filename, storagePath, mimeType, bytes.length, null);
    await this.imageRepo.save(image);

    return { success: true, value: { assetId, storagePath } };
  }
}
