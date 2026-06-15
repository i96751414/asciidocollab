import { ProjectId } from '../../value-objects/ids/project-id';
import { DocumentId } from '../../value-objects/ids/document-id';

/** Repository interface for tracking active collaboration document rooms. */
export interface CollaborationSessionRepository {
  /**
   * Returns true if a collaboration room is currently active for the given document.
   *
   * @param projectId - The project that owns the document.
   * @param documentId - The document to check.
   * @returns True when a room record exists; false otherwise.
   */
  isActive(projectId: ProjectId, documentId: DocumentId): Promise<boolean>;

  /**
   * Records that a room has opened (upserts by projectId + documentId).
   *
   * @param projectId - The project that owns the document.
   * @param documentId - The document whose room is opening.
   * @returns Resolves when the record has been persisted.
   */
  open(projectId: ProjectId, documentId: DocumentId): Promise<void>;

  /**
   * Removes the session record when the last client leaves.
   *
   * @param projectId - The project that owns the document.
   * @param documentId - The document whose room is closing.
   * @returns Resolves when the record has been removed.
   */
  close(projectId: ProjectId, documentId: DocumentId): Promise<void>;

  /**
   * Removes all session records for a project (called on project deletion).
   *
   * @param projectId - The project whose sessions should be removed.
   * @returns Resolves when all records for the project have been removed.
   */
  closeAllForProject(projectId: ProjectId): Promise<void>;

  /**
   * Removes all session records globally (called on collab server startup).
   *
   * @returns Resolves when all records have been removed.
   */
  closeAll(): Promise<void>;
}
