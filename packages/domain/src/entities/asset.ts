import { AssetId } from '../value-objects/asset-id';
import { ProjectId } from '../value-objects/project-id';
import { MimeType } from '../value-objects/mime-type';

/**
 * Represents a file asset uploaded to a project.
 *
 * Assets are stored at a configurable storage path. An asset must always have
 * a positive size and a permitted MIME type.
 *
 * @invariant `sizeBytes` must be >= 0 (zero-byte files are permitted).
 */
export class Asset {
  /**
   * @throws {Error} If `sizeBytes` is negative.
   */
  constructor(
    /** Unique identifier for this asset. */
    public readonly id: AssetId,
    /** The project this asset belongs to. */
    public readonly projectId: ProjectId,
    /** Original uploaded file name. */
    public readonly filename: string,
    /** Storage path within the blob store. */
    public readonly storagePath: string,
    /** MIME type of the asset. */
    public readonly mimeType: MimeType,
    /** File size in bytes. Must be >= 0. */
    public readonly sizeBytes: bigint,
    /**
     * Identifier of a parent asset in a hierarchy, or null if top-level.
     */
    public readonly parentId: AssetId | null,
    /** Timestamp of upload. Defaults to the current time. */
    public readonly uploadedAt: Date = new Date(),
    /** Timestamp of the last metadata update, or null if never updated. */
    public readonly updatedAt: Date | null = null,
  ) {
    if (this.sizeBytes < 0n) {
      throw new Error('Asset sizeBytes must be >= 0');
    }
  }
}
