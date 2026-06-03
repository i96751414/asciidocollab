import { User } from '../../entities/user';
import { UserId } from '../../value-objects/user-id';
import { UserRepository } from '../../ports/user/user.repository';
import { DomainError } from '../../errors/domain-error';
import { InvalidPasswordError } from '../../errors/invalid-password';
import { PasswordReuseError } from '../../errors/password-reuse';
import { ValidationError } from '../../errors/validation-error';
import { PasswordPolicy, validatePassword } from '../../value-objects/password-policy';
import { Result } from '../../types/result';
import { PasswordHasher } from '../../services/password-hasher';
import { BreachChecker } from '../../services/breach-checker';

/** Result returned on successful password change. */
export interface ChangePasswordResult {
  /** The user whose password was changed. */
  userId: UserId;
}

/**
 * Changes a user's password after verifying the current password.
 *
 * Validates current password, validates new password against policy,
 * checks password history, checks for breached passwords, updates the hash,
 * and rotates history.
 */
export class ChangePasswordUseCase {
  /**
   * @param userRepo - Repository for user persistence.
   * @param passwordHasher - Service for password hashing and verification.
   * @param passwordPolicy - Password policy to validate the new password against.
   * @param breachChecker - Service to check if a password appears in breach databases.
   */
  constructor(
    private readonly userRepo: UserRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly passwordPolicy: PasswordPolicy,
    private readonly breachChecker: BreachChecker,
  ) {}

  /**
   * Changes the user's password.
   *
   * @param userId - The ID of the user changing their password.
   * @param currentPassword - The user's current plaintext password.
   * @param newPassword - The new plaintext password to set.
   * @param historyDepth - Maximum number of previous passwords to retain.
   * @returns Success with userId, or a DomainError for validation failure, invalid password, or reuse.
   */
  async execute(
    userId: UserId,
    currentPassword: string,
    newPassword: string,
    historyDepth: number,
  ): Promise<Result<ChangePasswordResult, DomainError>> {
    const validationError = validatePassword(newPassword, this.passwordPolicy);
    if (validationError) {
      return { success: false, error: new ValidationError(validationError) };
    }

    const user = await this.userRepo.findById(userId);

    if (!user || !user.passwordHash) {
      return {
        success: false,
        error: new InvalidPasswordError('Current password is incorrect'),
      };
    }

    const currentPasswordValid = await this.passwordHasher.verify(user.passwordHash, currentPassword);
    if (!currentPasswordValid) {
      return {
        success: false,
        error: new InvalidPasswordError('Current password is incorrect'),
      };
    }

    const isReused = await Promise.all(
      user.passwordHistory.map((hash) => this.passwordHasher.verify(hash, newPassword)),
    );
    if (isReused.some(Boolean)) {
      return {
        success: false,
        error: new PasswordReuseError('Cannot reuse recent passwords'),
      };
    }

    let breached = false;
    try {
      breached = await this.breachChecker.isBreached(newPassword);
    } catch {
      // Breach check failure is non-blocking - allow password change to proceed
    }

    if (breached) {
      return {
        success: false,
        error: new ValidationError('New password has been found in a data breach'),
      };
    }

    const newPasswordHash = await this.passwordHasher.hash(newPassword);
    const updatedHistory = [...user.passwordHistory, user.passwordHash].slice(-historyDepth);

    const updatedUser = new User(
      user.id,
      user.email,
      user.displayName,
      newPasswordHash,
      updatedHistory,
      user.samlSubject,
      user.mfaSecret,
      user.isAdmin,
      user.timestamps,
      user.emailVerified,
      user.registrationMethod,
    );
    await this.userRepo.save(updatedUser);

    return {
      success: true,
      value: { userId: user.id },
    };
  }
}
