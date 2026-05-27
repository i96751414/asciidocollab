import { Image } from '../../src/entities/image';
import { ImageId } from '../../src/value-objects/image-id';
import { ProjectId } from '../../src/value-objects/project-id';
import { ImageRepository } from '../../src/repositories/image.repository';

/**
 *
 */
export class InMemoryImageRepository implements ImageRepository {
  private readonly storage = new Map<string, Image>();

  /**
   *
   */
  async findById(id: ImageId): Promise<Image | null> {
    return this.storage.get(id.value) ?? null;
  }

  /**
   *
   */
  async findByProjectId(projectId: ProjectId): Promise<Image[]> {
    return Array.from(this.storage.values()).filter(
      (img) => img.projectId.value === projectId.value,
    );
  }

  /**
   *
   */
  async save(image: Image): Promise<void> {
    this.storage.set(image.id.value, image);
  }

  /**
   *
   */
  async delete(id: ImageId): Promise<void> {
    this.storage.delete(id.value);
  }
}
