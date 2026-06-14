import { ProjectId } from '../../value-objects/ids/project-id';
import { YjsStateId } from '../../value-objects/ids/yjs-state-id';
import { Result } from '../../types/result';

/** A single literal text replacement to apply to a collaborative document's content. */
export interface ContentReplacement {
  /** The exact text to find (e.g., an `include::old.adoc[]` reference macro). */
  readonly find: string;
  /** The text every occurrence of `find` is replaced with. */
  readonly replace: string;
}

/**
 * Port for mutating a document whose authoritative content is the collaborative
 * Yjs document owned by the collaboration server.
 *
 * A server-side operation (e.g., the cross-file reference rewrite after a file
 * move/rename) must NOT edit such a document by writing the plain-text file
 * store directly: the file store is only a projection of the Yjs state, so a
 * direct write is invisible to anyone editing the document live AND is
 * overwritten by the next Yjs writeback, silently reverting the change. Applying
 * the edit through this port routes it into the Yjs source of truth instead — it
 * appears live for connected editors and is persisted by the normal writeback.
 *
 * Implementations apply the replacements as a single Yjs transaction so they
 * merge with any concurrent edits; a replacement whose `find` is no longer
 * present is skipped rather than failing the whole operation.
 */
export interface CollaborativeContentEditor {
  /**
   * Applies literal text replacements to the document identified by `yjsStateId`.
   *
   * @param projectId - The project that owns the document.
   * @param yjsStateId - The Yjs state identifier of the document's collaborative room.
   * @param replacements - The replacements to apply, in no particular order.
   * @returns On success, the number of individual occurrences actually replaced in the live
   *   document (0 when every `find` was absent — that is, the live content diverged from what the
   *   caller scanned, so the caller must NOT treat the edit as having taken effect); or an error
   *   when the edit could not be delivered.
   */
  applyReplacements(
    projectId: ProjectId,
    yjsStateId: YjsStateId,
    replacements: ReadonlyArray<ContentReplacement>,
  ): Promise<Result<number, Error>>;
}
