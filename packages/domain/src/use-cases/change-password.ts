import { User } from '../entities/user';
import { UserId } from '../value-objects/user-id';
import { UserRepository } from '../repositories/user.repository';
import { InvalidPasswordError } from '../errors/invalid-password';
import { PasswordReuseError } from '../errors/password-reuse';
import { Result } from '@asciidocollab/shared';

/** Result returned on successful password change. */
export interface ChangePasswordResult {
  /** The user whose password was changed. */
  userId: UserId;
}

/**
 * Changes a user's password after verifying the current password.
 *
 * Validates current password, checks password history, updates the hash,
 * and rotates history. The caller is responsible for new password validation
 * before calling this use case.
 */
export class ChangePasswordUseCase {
  /**
   * @param userRepo - Repository for user persistence.
   * @param verifyPassword - Function to verify a password against a hash.
   * @param hashPassword - Function to hash a plaintext password.
   */
  constructor(
    private readonly userRepo: UserRepository,
    private readonly verifyPassword: (hash: string, plain: string) => Promise<boolean>,
    private readonly hashPassword: (plain: string) => Promise<string>,
  ) {}

  /**
   * Changes the user's password.
   *
   * @param userId - The ID of the user changing their password.
   * @param currentPassword - The user's current plaintext password.
   * @param newPasswordHash - The argon2id hash of the new password.
   * @param historyDepth - Maximum number of previous passwords to retain.
   * @returns Success with userId, or a DomainError for invalid current password or reuse.
   */
  async execute(
    userId: UserId,
    currentPassword: string,
    newPasswordHash: string,
    historyDepth: number,
  ): Promise<Result<ChangePasswordResult, InvalidPasswordError | PasswordReuseError>> {
    const user = await this.userRepo.findById(userId);

    if (!user || !user.passwordHash) {
      return {
        success: false,
        error: new InvalidPasswordError('Current password is incorrect'),
      };
    }

    const currentPasswordValid = await this.verifyPassword(user.passwordHash, currentPassword);
    if (!currentPasswordValid) {
      return {
        success: false,
        error: new InvalidPasswordError('Current password is incorrect'),
      };
    }

    const isReused = await Promise.all(
      user.passwordHistory.map((hash) => this.verifyPassword(hash, newPasswordHash)),
    );
    if (isReused.some(Boolean)) {
      return {
        success: false,
        error: new PasswordReuseError('Cannot reuse recent passwords'),
      };
    }

    const updatedHistory = [...user.passwordHistory, user.passwordHash].slice(-historyDepth);

    const updatedUser = new User(
      user.id,
      user.email,
      user.displayName,
      newPasswordHash,
      updatedHistory,
      user.samlSubject,
      user.mfaSecret,
      user.timestamps,
    );
    await this.userRepo.save(updatedUser);

    return {
      success: true,
      value: { userId: user.id },
    };
  }
}
