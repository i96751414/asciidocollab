import { UserId } from '../../value-objects/user-id';
import { ProjectId } from '../../value-objects/project-id';
import { ProjectMemberRepository } from '../../ports/project/project-member.repository';
import { CollabConnectionDeniedError } from '../../errors/collab-connection-denied';
import { Result } from '../../types/result';

/**
 * Authorizes a connection to a project's presence room (read-only awareness used to show which
 * files collaborators have open). Unlike {@link AuthorizeCollabConnectionUseCase}, this gate is
 * NOT tied to a document/`yjsStateId` — presence is project-scoped, and because file access in this
 * product is project-scoped (a member can access every file), project membership fully bounds what
 * presence a viewer may receive. There is no collaboration role: presence is read-only.
 */
export class AuthorizeProjectPresenceUseCase {
  /** Initializes the use case with the repository needed to resolve project membership. */
  constructor(private readonly projectMemberRepo: ProjectMemberRepository) {}

  /**
   * Authorizes the actor to join the project's presence room iff they are a member of the project.
   *
   * @param actorId - The authenticated user requesting the presence connection.
   * @param projectId - The project whose presence room is being joined.
   * @returns Success when the actor is a project member, or a `CollabConnectionDeniedError`.
   */
  async execute(
    actorId: UserId,
    projectId: ProjectId,
  ): Promise<Result<void, CollabConnectionDeniedError>> {
    const member = await this.projectMemberRepo.findByCompositeKey(projectId, actorId);
    if (!member) {
      return { success: false, error: new CollabConnectionDeniedError('not_a_member') };
    }
    return { success: true, value: undefined };
  }
}
