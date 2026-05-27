import { Image } from '../entities/image';
import { ImageId } from '../value-objects/image-id';
import { ProjectId } from '../value-objects/project-id';

/**
 * Repository interface for managing Image persistence.
 * Handles storage and retrieval of image metadata within projects.
 */
export interface ImageRepository {
  /**
   * Finds an image by its unique identifier.
   * 
   * @param id - The unique identifier of the image.
   * @returns The image if found, null otherwise.
   */
  findById(id: ImageId): Promise<Image | null>;

  /**
   * Finds all images belonging to a given project.
   * 
   * @param projectId - The unique identifier of the project.
   * @returns An array of images in the project.
   */
  findByProjectId(projectId: ProjectId): Promise<Image[]>;

  /**
   * Persists an image entity (create or update).
   * 
   * @param image - The image entity to save.
   * @returns A promise that resolves when the operation completes.
   */
  save(image: Image): Promise<void>;

  /**
   * Removes an image by its unique identifier.
   * 
   * @param id - The unique identifier of the image to delete.
   * @returns A promise that resolves when the operation completes.
   */
  delete(id: ImageId): Promise<void>;
}
