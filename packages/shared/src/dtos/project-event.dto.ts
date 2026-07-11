import type { FileTreeEventDto } from './file-tree-event.dto';

/**
 * Emitted via SSE when a file's content changes (a live collaborative edit or a
 * persisted save). A bare identifier only — it carries no document content; the
 * client re-fetches through the existing live-aware content endpoint on receipt.
 */
export interface ContentChangedEventDto {
  /** Discriminator identifying this as a content-change signal. */
  type: 'content-changed';
  /** Unique identifier of the file node whose content changed. */
  fileNodeId: string;
}

/**
 * Emitted via SSE when the project's designated main file setting changes. A
 * project-setting change (not a file-content edit), so every open document must
 * re-resolve its inherited context against the new anchor.
 */
export interface MainFileChangedEventDto {
  /** Discriminator identifying this as a main-file-setting change. */
  type: 'main-file-changed';
  /** Unique identifier of the new main file node, or null when the main file is cleared. */
  mainFileNodeId: string | null;
}

/**
 * Emitted via SSE when a document's review items (comments/tasks) change — an
 * item was created, replied to, resolved, reacted to, edited, or deleted. A bare
 * identifier only; the client re-fetches the affected document's items and
 * re-resolves their anchors against the live Y.Text on receipt.
 */
export interface ReviewItemsChangedEventDto {
  /** Discriminator identifying this as a review-items change signal. */
  type: 'review-items-changed';
  /**
   * The document whose review items changed, or `null` for a project-wide change that touches every
   * document at once (the owner clearing all review items across the project). A consumer scoped to one
   * document refetches when the id matches or is null, and the cross-document panel refetches on either.
   */
  documentId: string | null;
}

/**
 * The discriminated union of every event carried by the per-project SSE stream
 * (`GET /projects/:projectId/events`). Consumers discriminate on `type`: existing
 * structural changes ({@link FileTreeEventDto}), content changes
 * ({@link ContentChangedEventDto}), main-file-setting changes
 * ({@link MainFileChangedEventDto}), and review-item changes
 * ({@link ReviewItemsChangedEventDto}) share one transport.
 */
export type ProjectEventDto =
  | FileTreeEventDto
  | ContentChangedEventDto
  | MainFileChangedEventDto
  | ReviewItemsChangedEventDto;
