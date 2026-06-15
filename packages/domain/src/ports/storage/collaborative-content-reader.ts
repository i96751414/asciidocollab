import { ProjectId } from '../../value-objects/ids/project-id';
import { YjsStateId } from '../../value-objects/ids/yjs-state-id';
import { Result } from '../../types/result';

/**
 * Port for reading the *live* content of a document whose authoritative source of truth is the
 * collaborative Yjs document owned by the collaboration server.
 *
 * A server-side scan (e.g., find-usages or the symbol rename's first pass) must NOT assume the
 * plain-text file store is current for a file that is open for collaborative editing: the file
 * store is only a projection of the Yjs state, written back on a debounce / on disconnect, so it
 * lags unsaved edits and can stay stale after a restart (the room reloads from persisted Yjs state,
 * but the projection is only refreshed on the next write-back). Reading through this port returns
 * exactly what the editor currently shows, so a symbol the user just typed is visible to the scan.
 *
 * Implementations open a server-side direct connection to the room (loading a dormant one from its
 * authoritative Yjs state, never the possibly-stale file) and return the current document text.
 */
export interface CollaborativeContentReader {
  /**
   * Reads the current text of the document identified by `yjsStateId`.
   *
   * @param projectId - The project that owns the document.
   * @param yjsStateId - The Yjs state identifier of the document's collaborative room.
   * @returns The live document text; `null` when there is no live source for it (a dormant room
   *   with no persisted state — not an error, the caller uses the file store); or an error when the
   *   read could not be delivered (for instance, the collaboration server is unreachable).
   */
  readContent(projectId: ProjectId, yjsStateId: YjsStateId): Promise<Result<string | null, Error>>;
}
