import { ImageId } from '../value-objects/image-id';
import { ProjectId } from '../value-objects/project-id';
import { MimeType } from '../value-objects/mime-type';

/**
 * Represents an image asset uploaded to a project.
 *
 * Images are stored at a configurable storage path and may be organised in a
 * hierarchy via `parentId`. An image must always have a positive size.
 *
 * @invariant `sizeBytes` must be greater than 0.
 */
export class Image {
  /**
   * @throws {Error} If `sizeBytes` is not greater than 0.
   */
  constructor(
    /** Unique identifier for this image. */
    public readonly id: ImageId,
    /** The project this image belongs to. */
    public readonly projectId: ProjectId,
    /** Original uploaded file name. */
    public readonly filename: string,
    /** Storage path within the blob store. */
    public readonly storagePath: string,
    /** MIME type of the image (e.g. `image/png`). */
    public readonly mimeType: MimeType,
    /** File size in bytes. Must be > 0. */
    public readonly sizeBytes: number,
    /**
     * Identifier of the parent image in a hierarchy, or null if this is a
     *  top-level image.
     */
    public readonly parentId: ImageId | null,
    /** Timestamp of upload. Defaults to the current time. */
    public readonly uploadedAt: Date = new Date(),
    /** Timestamp of the last metadata update, or null if never updated. */
    public readonly updatedAt: Date | null = null,
  ) {
    if (this.sizeBytes <= 0) {
      throw new Error('Image sizeBytes must be > 0');
    }
  }
}
