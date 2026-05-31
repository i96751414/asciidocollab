import { PrismaClient } from '@prisma/client';
import { Image, ImageId, ProjectId, MimeType, ImageRepository } from '@asciidocollab/domain';

/**
 * Prisma-backed implementation of the `ImageRepository` interface.
 * Maps between domain `Image` entities and the `Image` database table.
 * Supports version chains via `parentId` and tracks file size in bytes.
 */
export class PrismaImageRepository implements ImageRepository {
  /** Creates a new PrismaImageRepository. */
  constructor(
    /** The Prisma client used for database operations. */
    private readonly prisma: PrismaClient,
  ) {}

  /**
   * @param id - The unique identifier of the image.
   * @returns The image if found, null otherwise.
   */
  async findById(id: ImageId): Promise<Image | null> {
    const record = await this.prisma.image.findUnique({ where: { id: id.value } });
    return record ? toDomainImage(record) : null;
  }

  /**
   * @param projectId - The project ID to filter by.
   * @returns All images belonging to the given project.
   */
  async findByProjectId(projectId: ProjectId): Promise<Image[]> {
    const records = await this.prisma.image.findMany({ where: { projectId: projectId.value } });
    return records.map(toDomainImage);
  }

  /**
   * Creates or updates an image. Uses upsert so the same method
   * handles both insert and update.
   * 
   * @param image - The image entity to persist.
   */
  async save(image: Image): Promise<void> {
    await this.prisma.image.upsert({
      where: { id: image.id.value },
      create: toPersistenceImage(image),
      update: toPersistenceImage(image),
    });
  }

  /**
   * @param id - The unique identifier of the image to delete.
   */
  async delete(id: ImageId): Promise<void> {
    await this.prisma.image.deleteMany({ where: { id: id.value } });
  }
}

type ImageRecord = {
  id: string; projectId: string; filename: string; storagePath: string;
  mimeType: string; sizeBytes: number; parentId: string | null;
  uploadedAt: Date; updatedAt: Date | null;
};

function toDomainImage(record: ImageRecord): Image {
  return new Image(
    ImageId.create(record.id),
    ProjectId.create(record.projectId),
    record.filename,
    record.storagePath,
    MimeType.create(record.mimeType),
    record.sizeBytes,
    record.parentId ? ImageId.create(record.parentId) : null,
    record.uploadedAt,
    record.updatedAt,
  );
}

function toPersistenceImage(image: Image): ImageRecord {
  return {
    id: image.id.value,
    projectId: image.projectId.value,
    filename: image.filename,
    storagePath: image.storagePath,
    mimeType: image.mimeType.value,
    sizeBytes: image.sizeBytes,
    parentId: image.parentId?.value ?? null,
    uploadedAt: image.uploadedAt,
    updatedAt: image.updatedAt,
  };
}
