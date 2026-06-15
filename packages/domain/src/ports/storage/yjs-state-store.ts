import { ProjectId } from '../../value-objects/ids/project-id';
import { YjsStateId } from '../../value-objects/ids/yjs-state-id';

/** Port for persisting Yjs CRDT binary states per project document. */
export interface YjsStateStore {
  /**
   * Returns the current Yjs state bytes, or null if none persisted yet.
   *
   * @param projectId - The project that owns the document.
   * @param yjsStateId - The unique identifier for the Yjs state file.
   * @returns The serialized Yjs state, or null if not yet persisted.
   */
  load(projectId: ProjectId, yjsStateId: YjsStateId): Promise<Buffer | null>;

  /**
   * Overwrites the stored Yjs state. Creates the storage directory on first use.
   *
   * @param projectId - The project that owns the document.
   * @param yjsStateId - The unique identifier for the Yjs state file.
   * @param state - The serialized Yjs state bytes to persist.
   * @returns A promise that resolves when the state has been saved.
   */
  save(projectId: ProjectId, yjsStateId: YjsStateId, state: Buffer): Promise<void>;

  /**
   * Removes the state file for a single document.
   *
   * @param projectId - The project that owns the document.
   * @param yjsStateId - The unique identifier for the Yjs state file to remove.
   * @returns A promise that resolves when the state file has been removed.
   */
  delete(projectId: ProjectId, yjsStateId: YjsStateId): Promise<void>;

  /**
   * Removes all Yjs states for the project (called on project deletion).
   *
   * @param projectId - The project whose Yjs state directory should be deleted.
   * @returns A promise that resolves when all project states have been removed.
   */
  deleteAllForProject(projectId: ProjectId): Promise<void>;
}
