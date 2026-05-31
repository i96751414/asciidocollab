import { Image } from '../../src/entities/image';
import { ImageId } from '../../src/value-objects/image-id';
import { ProjectId } from '../../src/value-objects/project-id';
import { ImageRepository } from '../../src/repositories/image.repository';

/** In-memory implementation of ImageRepository for use in tests. */
export class InMemoryImageRepository implements ImageRepository {
  private readonly storage = new Map<string, Image>();

  /** Returns the image with the given ID, or null if not found. */
  async findById(id: ImageId): Promise<Image | null> {
    return this.storage.get(id.value) ?? null;
  }

  /** Returns all images belonging to the given project. */
  async findByProjectId(projectId: ProjectId): Promise<Image[]> {
    return [...this.storage.values()].filter(
      (img) => img.projectId.value === projectId.value,
    );
  }

  /** Stores an image in memory, overwriting any existing entry with the same ID. */
  async save(image: Image): Promise<void> {
    this.storage.set(image.id.value, image);
  }

  /** Removes the image with the given ID from memory. */
  async delete(id: ImageId): Promise<void> {
    this.storage.delete(id.value);
  }
}
