import { ProjectId } from '../../value-objects/project-id';
import { DocumentId } from '../../value-objects/document-id';
import { CollaborationSessionRepository } from '../../ports/project/collaboration-session.repository';
import { Result } from '../../types/result';

/** Closes a collaboration session record when the last client disconnects from a room. */
export class CloseCollaborationSessionUseCase {
  /**
   * @param projectId - The project that owns the document.
   * @param documentId - The document whose room is being closed.
   * @param collaborationSessionRepo - Repository for storing session state.
   * @returns `{ success: true }` on success; `{ success: false, error }` if the repository throws.
   */
  async execute(
    projectId: ProjectId,
    documentId: DocumentId,
    collaborationSessionRepo: CollaborationSessionRepository,
  ): Promise<Result<void, Error>> {
    try {
      await collaborationSessionRepo.close(projectId, documentId);
      return { success: true, value: undefined };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error : new Error(String(error)) };
    }
  }
}
