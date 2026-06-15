import { FileNodeId } from '../value-objects/ids/file-node-id';
import { MimeType } from '../value-objects/files/mime-type';

/**
 * Represents a binary file asset linked to a FileNode.
 *
 * Asset.id is a foreign key to FileNode.id — there is exactly one Asset
 * per FileNode of type 'file'. ProjectId, name, and path are on the
 * associated FileNode and must not be duplicated here..
 *
 * @invariant `sizeBytes` must be >= 0 (zero-byte files are permitted).
 */
export class Asset {
  /**
   * @throws {Error} If `sizeBytes` is negative.
   */
  constructor(
    /** FileNode id that owns this asset (FK + PK). */
    public readonly id: FileNodeId,
    /** MIME type of the asset. */
    public readonly mimeType: MimeType,
    /** File size in bytes. Must be >= 0. */
    public readonly sizeBytes: bigint,
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
