import { DocumentId } from '../value-objects/ids/document-id';
import { FileNodeId } from '../value-objects/ids/file-node-id';
import { ContentId } from '../value-objects/ids/content-id';
import { YjsStateId } from '../value-objects/ids/yjs-state-id';
import { MimeType } from '../value-objects/files/mime-type';
import { Timestamps } from '../value-objects/common/timestamps';

/**
 * Represents a single AsciiDoc document within a project.
 *
 * A Document pairs an immutable content snapshot (contentId) with a mutable
 * Yjs collaborative-editing state (yjsStateId). These two identifiers must
 * always point to distinct resources.
 *
 * @invariant `contentId` and `yjsStateId` must not point to the same UUID.
 */
export class Document {
  /**
   * @throws {Error} If `contentId` and `yjsStateId` point to the same UUID.
   */
  constructor(
    /** Unique identifier for this document. */
    public readonly id: DocumentId,
    /** The file-tree node that this document is attached to. */
    public readonly fileNodeId: FileNodeId,
    /**
     * Identifier of the immutable content resource. Must differ from
     *  `yjsStateId`.
     */
    public readonly contentId: ContentId,
    /**
     * Identifier of the mutable Yjs collaborative-editing state. Must differ
     *  from `contentId`.
     */
    public readonly yjsStateId: YjsStateId,
    /**
     * The MIME type of the document content (e.g.
     *  `text/asciidoc`).
     */
    public readonly mimeType: MimeType,
    /** Creation and last-update timestamps. Defaults to the current time. */
    public readonly timestamps: Timestamps = new Timestamps(),
  ) {
    if (this.contentId.value === this.yjsStateId.value) {
      throw new Error('contentId and yjsStateId must be distinct');
    }
  }

  /** @returns A defensive copy of the creation date. */
  get createdAt(): Date {
    return this.timestamps.createdAt;
  }

  /** @returns A defensive copy of the last-update date. */
  get updatedAt(): Date {
    return this.timestamps.updatedAt;
  }
}
