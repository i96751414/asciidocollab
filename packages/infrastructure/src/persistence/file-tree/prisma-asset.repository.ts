import { PrismaClient } from '@prisma/client';
import { Asset, AssetId, ProjectId, MimeType, AssetRepository } from '@asciidocollab/domain';

/**
 * Prisma-backed implementation of the `AssetRepository` interface.
 * Maps between domain `Asset` entities and the `assets` database table.
 * Supports version chains via `parentId` and tracks file size in bytes.
 */
export class PrismaAssetRepository implements AssetRepository {
  /** Creates a new PrismaAssetRepository. */
  constructor(
    /** The Prisma client used for database operations. */
    private readonly prisma: PrismaClient,
  ) {}

  /**
   * @param id - The unique identifier of the asset.
   * @returns The asset if found, null otherwise.
   */
  async findById(id: AssetId): Promise<Asset | null> {
    const record = await this.prisma.asset.findUnique({ where: { id: id.value } });
    return record ? toDomainAsset(record) : null;
  }

  /**
   * @param projectId - The project ID to filter by.
   * @returns All assets belonging to the given project.
   */
  async findByProjectId(projectId: ProjectId): Promise<Asset[]> {
    const records = await this.prisma.asset.findMany({ where: { projectId: projectId.value } });
    return records.map(toDomainAsset);
  }

  /**
   * Creates or updates an asset. Uses upsert so the same method
   * handles both insert and update.
   *
   * @param asset - The asset entity to persist.
   */
  async save(asset: Asset): Promise<void> {
    await this.prisma.asset.upsert({
      where: { id: asset.id.value },
      create: toPersistenceAsset(asset),
      update: toPersistenceAsset(asset),
    });
  }

  /**
   * @param id - The unique identifier of the asset to delete.
   */
  async delete(id: AssetId): Promise<void> {
    await this.prisma.asset.deleteMany({ where: { id: id.value } });
  }

  /** @inheritdoc */
  async findByStoragePath(projectId: ProjectId, storagePath: string): Promise<Asset | null> {
    const record = await this.prisma.asset.findFirst({
      where: { projectId: projectId.value, storagePath },
      orderBy: { uploadedAt: 'desc' },
    });
    return record ? toDomainAsset(record) : null;
  }
}

type AssetRecord = {
  id: string; projectId: string; filename: string; storagePath: string;
  mimeType: string; sizeBytes: bigint; parentId: string | null;
  uploadedAt: Date; updatedAt: Date | null;
};

function toDomainAsset(record: AssetRecord): Asset {
  return new Asset(
    AssetId.create(record.id),
    ProjectId.create(record.projectId),
    record.filename,
    record.storagePath,
    MimeType.create(record.mimeType),
    record.sizeBytes,
    record.parentId ? AssetId.create(record.parentId) : null,
    record.uploadedAt,
    record.updatedAt,
  );
}

function toPersistenceAsset(asset: Asset): AssetRecord {
  return {
    id: asset.id.value,
    projectId: asset.projectId.value,
    filename: asset.filename,
    storagePath: asset.storagePath,
    mimeType: asset.mimeType.value,
    sizeBytes: asset.sizeBytes,
    parentId: asset.parentId?.value ?? null,
    uploadedAt: asset.uploadedAt,
    updatedAt: asset.updatedAt,
  };
}
