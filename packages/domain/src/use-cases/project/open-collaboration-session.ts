import { ProjectId } from '../../value-objects/ids/project-id';
import { DocumentId } from '../../value-objects/ids/document-id';
import { CollaborationSessionRepository } from '../../ports/project/collaboration-session.repository';
import { Result } from '../../types/result';

/** Opens a collaboration session record when the first client connects to a room. */
export class OpenCollaborationSessionUseCase {
  /**
   * @param projectId - The project that owns the document.
   * @param documentId - The document whose room is being opened.
   * @param collaborationSessionRepo - Repository for storing session state.
   * @returns `{ success: true }` on success; `{ success: false, error }` if the repository throws.
   */
  async execute(
    projectId: ProjectId,
    documentId: DocumentId,
    collaborationSessionRepo: CollaborationSessionRepository,
  ): Promise<Result<void, Error>> {
    try {
      await collaborationSessionRepo.open(projectId, documentId);
      return { success: true, value: undefined };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error : new Error(String(error)) };
    }
  }
}
