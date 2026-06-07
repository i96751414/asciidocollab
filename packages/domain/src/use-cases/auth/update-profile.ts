import { User } from '../../entities/user';
import { UserId } from '../../value-objects/user-id';
import { UserRepository } from '../../ports/user/user.repository';
import { DomainError } from '../../errors/domain-error';
import { ValidationError } from '../../errors/validation-error';
import { UserNotFoundError } from '../../errors/user-not-found';
import { Result } from '../../types/result';

const VALID_THEMES = ['light', 'dark', 'system'] as const;

/** Input for UpdateProfileUseCase — all fields are optional; only non-undefined fields are written. */
export interface UpdateProfileInput {
  /** ID of the user whose profile is being updated. */
  userId: UserId;
  /** New display name, or undefined to leave unchanged. */
  displayName?: string;
  /** New avatar style key, null to clear, or undefined to leave unchanged. */
  avatarKey?: string | null;
  /** New theme preference ('light' | 'dark' | 'system'), or undefined to leave unchanged. */
  appTheme?: string;
}

/** Result returned on success. */
export interface UpdateProfileResult {
  /** ID of the updated user. */
  userId: UserId;
}

/** Updates one or more profile fields (displayName, avatarKey, appTheme) in a single call. */
export class UpdateProfileUseCase {
  /** @param userRepo - Provides user lookup and persistence. */
  constructor(private readonly userRepo: UserRepository) {}

  /**
   * Validates and applies the requested profile field updates.
   *
   * @param input - Partial profile update with userId and optional fields.
   * @returns Success with the userId or a validation/not-found error.
   */
  async execute(input: UpdateProfileInput): Promise<Result<UpdateProfileResult, DomainError>> {
    const validThemes: readonly string[] = VALID_THEMES;
    if (input.appTheme !== undefined && !validThemes.includes(input.appTheme)) {
      return { success: false, error: new ValidationError(`appTheme must be one of: ${VALID_THEMES.join(', ')}`) };
    }

    const user = await this.userRepo.findById(input.userId);
    if (!user) {
      return { success: false, error: new UserNotFoundError(input.userId.value) };
    }

    const updatedUser = new User(
      user.id,
      user.email,
      input.displayName === undefined ? user.displayName : input.displayName,
      user.passwordHash,
      user.passwordHistory,
      user.samlSubject,
      user.mfaSecret,
      user.isAdmin,
      user.timestamps,
      user.emailVerified,
      user.registrationMethod,
      input.avatarKey === undefined ? user.avatarKey : input.avatarKey,
      input.appTheme === undefined ? user.appTheme : input.appTheme,
    );
    await this.userRepo.save(updatedUser);

    return { success: true, value: { userId: user.id } };
  }
}
