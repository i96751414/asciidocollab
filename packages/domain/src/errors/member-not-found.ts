import { DomainError } from './domain-error';

/**
 * Thrown when a specific project member is not found.
 */
export class MemberNotFoundError extends DomainError {
  readonly name = 'MemberNotFoundError';

  /**
   * @param projectId - The project the member was expected in.
   * @param userId - The user who was expected to be a member.
   */
  constructor(projectId: string, userId: string) {
    super(`Member not found in project ${projectId} for user ${userId}`);
  }
}
