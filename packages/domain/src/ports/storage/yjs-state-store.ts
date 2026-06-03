import { ProjectId } from '../../value-objects/project-id';
import { YjsStateId } from '../../value-objects/yjs-state-id';

/** Port for persisting Yjs CRDT binary states per project document. */
export interface YjsStateStore {
  /**
   * Returns the current Yjs state bytes, or null if none persisted yet.
   *
   * @param projectId - The project that owns the document.
   * @param yjsStateId - The unique identifier for the Yjs state file.
   */
  load(projectId: ProjectId, yjsStateId: YjsStateId): Promise<Buffer | null>;

  /**
   * Overwrites the stored Yjs state. Creates the storage directory on first use.
   *
   * @param projectId - The project that owns the document.
   * @param yjsStateId - The unique identifier for the Yjs state file.
   * @param state - The serialized Yjs state bytes to persist.
   */
  save(projectId: ProjectId, yjsStateId: YjsStateId, state: Buffer): Promise<void>;

  /**
   * Removes the state file for a single document.
   *
   * @param projectId - The project that owns the document.
   * @param yjsStateId - The unique identifier for the Yjs state file to remove.
   */
  delete(projectId: ProjectId, yjsStateId: YjsStateId): Promise<void>;

  /**
   * Removes all Yjs states for the project (called on project deletion).
   *
   * @param projectId - The project whose Yjs state directory should be deleted.
   */
  deleteAllForProject(projectId: ProjectId): Promise<void>;
}
