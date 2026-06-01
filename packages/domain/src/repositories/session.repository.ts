import { UserId } from '../value-objects/user-id';

/** Repository interface for managing user session records. */
export interface SessionRepository {
  /**
   * Deletes all sessions belonging to the given user.
   *
   * @param userId - The user whose sessions should be invalidated.
   * @returns A promise that resolves when all sessions are deleted.
   */
  deleteByUserId(userId: UserId): Promise<void>;
}
