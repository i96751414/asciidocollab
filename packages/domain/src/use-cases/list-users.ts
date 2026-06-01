import { User } from '../entities/user';
import { UserId } from '../value-objects/user-id';
import { UserRepository } from '../repositories/user.repository';
import { PermissionDeniedError } from '../errors/permission-denied';
import { DomainError } from '../errors/domain-error';
import { Result } from '../types/result';

/** Use case for retrieving the full list of users (admin only). */
export class ListUsersUseCase {
  /** Injects the user repository used to fetch all users. */
  constructor(private readonly userRepo: UserRepository) {}

  /**
   * Returns all users if the actor is an administrator.
   *
   * @param actorId - ID of the user requesting the list.
   * @returns Success with the user array, or a permission error.
   */
  async execute(actorId: UserId): Promise<Result<{ /** All registered users. */
  users: User[] }, DomainError>> {
    const actor = await this.userRepo.findById(actorId);
    if (!actor?.isAdmin) {
      return { success: false, error: new PermissionDeniedError() };
    }

    const users = await this.userRepo.findAll();
    return { success: true, value: { users } };
  }
}
