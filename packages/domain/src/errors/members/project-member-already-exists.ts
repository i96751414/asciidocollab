import { DomainError } from '../domain-error';

/**
 * Thrown when attempting to add a user who is already a member of the project.
 */
export class ProjectMemberAlreadyExistsError extends DomainError {
  readonly name = 'ProjectMemberAlreadyExistsError';

  /**
   * @param projectId - The project the user is already a member of.
   * @param userId - The user who is already a member.
   */
  constructor(projectId: string, userId: string) {
    super(`User ${userId} is already a member of project ${projectId}`);
  }
}
