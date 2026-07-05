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
 * The discriminated union of every event carried by the per-project SSE stream
 * (`GET /projects/:projectId/events`). Consumers discriminate on `type`: existing
 * structural changes ({@link FileTreeEventDto}), content changes
 * ({@link ContentChangedEventDto}), and main-file-setting changes
 * ({@link MainFileChangedEventDto}) share one transport.
 */
export type ProjectEventDto = FileTreeEventDto | ContentChangedEventDto | MainFileChangedEventDto;
