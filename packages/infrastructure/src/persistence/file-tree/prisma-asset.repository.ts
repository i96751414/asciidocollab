import { PrismaClient } from '@prisma/client';
import { Asset, FileNodeId, MimeType, AssetRepository } from '@asciidocollab/domain';

/**
 * Prisma-backed implementation of the `AssetRepository` interface.
 * Asset.id is a FK to FileNode.id (1:1). projectId, filename, and path
 * are on the associated FileNode and are not duplicated here.
 */
export class PrismaAssetRepository implements AssetRepository {
  /** Creates a new PrismaAssetRepository. */
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: FileNodeId): Promise<Asset | null> {
    const record = await this.prisma.asset.findUnique({ where: { id: id.value } });
    return record ? toDomainAsset(record) : null;
  }

  async save(asset: Asset): Promise<void> {
    await this.prisma.asset.upsert({
      where: { id: asset.id.value },
      create: toPersistenceAsset(asset),
      update: toPersistenceAsset(asset),
    });
  }

  async delete(id: FileNodeId): Promise<void> {
    await this.prisma.asset.deleteMany({ where: { id: id.value } });
  }
}

type AssetRecord = {
  id: string;
  mimeType: string;
  sizeBytes: bigint;
  uploadedAt: Date;
  updatedAt: Date | null;
};

function toDomainAsset(record: AssetRecord): Asset {
  return new Asset(
    FileNodeId.create(record.id),
    MimeType.create(record.mimeType),
    record.sizeBytes,
    record.uploadedAt,
    record.updatedAt,
  );
}

function toPersistenceAsset(asset: Asset): AssetRecord {
  return {
    id: asset.id.value,
    mimeType: asset.mimeType.value,
    sizeBytes: asset.sizeBytes,
    uploadedAt: asset.uploadedAt,
    updatedAt: asset.updatedAt,
  };
}
