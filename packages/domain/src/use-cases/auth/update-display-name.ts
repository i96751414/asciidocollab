import { User } from '../../entities/user';
import { UserId } from '../../value-objects/ids/user-id';
import { UserRepository } from '../../ports/user/user.repository';
import { DomainError } from '../../errors/domain-error';
import { ValidationError } from '../../errors/common/validation-error';
import { UserNotFoundError } from '../../errors/auth/user-not-found';
import { Result } from '../../types/result';

/** The value returned on successful display name update. */
export interface UpdateDisplayNameResult {
  /** The ID of the user whose display name was updated. */
  userId: UserId;
}

/** Updates a user's display name after validating the new value. */
export class UpdateDisplayNameUseCase {
  /** Creates the use case with its required user repository. */
  constructor(private readonly userRepo: UserRepository) {}

  /** Validates the display name and persists the update. */
  async execute(
    userId: UserId,
    displayName: string,
  ): Promise<Result<UpdateDisplayNameResult, DomainError>> {
    if (!displayName || displayName.trim().length === 0) {
      return { success: false, error: new ValidationError('Display name cannot be empty') };
    }
    if (displayName.length > 100) {
      return { success: false, error: new ValidationError('Display name must be at most 100 characters') };
    }

    const user = await this.userRepo.findById(userId);
    if (!user) {
      return { success: false, error: new UserNotFoundError(userId.value) };
    }

    const updatedUser = new User(
      user.id,
      user.email,
      displayName,
      user.passwordHash,
      user.passwordHistory,
      user.samlSubject,
      user.mfaSecret,
      user.isAdmin,
      user.timestamps,
      user.emailVerified,
      user.registrationMethod,
    );
    await this.userRepo.save(updatedUser);

    return { success: true, value: { userId: user.id } };
  }
}
