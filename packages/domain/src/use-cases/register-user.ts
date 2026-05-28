import { User } from '../entities/user';
import { UserId } from '../value-objects/user-id';
import { Email } from '../value-objects/email';
import { Timestamps } from '../value-objects/timestamps';
import { UserRepository } from '../repositories/user.repository';
import { DomainError } from '../errors/domain-error';
import { ValidationError } from '../errors/validation-error';
import { PasswordPolicy, validatePassword } from '../value-objects/password-policy';
import { Result } from '@asciidocollab/shared';
import { randomUUID } from 'crypto';

/** Result returned on successful registration. */
export interface RegisterUserResult {
  /** The newly created user's ID. */
  userId: UserId;
  /** Whether the password was found in a breach database. */
  breached: boolean;
  /** Whether the email was already registered. */
  existing: boolean;
}

/**
 * Registers a new user with email and password.
 *
 * Handles duplicate detection (returns success for existing email),
 * password validation, common-password check, breach detection,
 * and password hashing delegation.
 */
export class RegisterUserUseCase {
  /**
   * @param userRepo - Repository for user persistence.
   * @param passwordPolicy - Password policy to validate against.
   * @param isCommonPassword - Function to check if a password is common.
   * @param isPasswordBreached - Function to check if a password appears in breach databases.
   * @param hashPassword - Function to hash a plaintext password.
   */
  constructor(
    private readonly userRepo: UserRepository,
    private readonly passwordPolicy: PasswordPolicy,
    private readonly isCommonPassword: (password: string) => boolean,
    private readonly isPasswordBreached: (password: string) => Promise<boolean>,
    private readonly hashPassword: (plain: string) => Promise<string>,
  ) {}

  /**
   * Registers a new user or detects an existing account.
   *
   * @param email - The validated email address.
   * @param displayName - The user's chosen display name.
   * @param password - The plaintext password to validate, check, and hash.
   * @returns Success with userId and breach flag, or a DomainError.
   */
  async execute(
    email: Email,
    displayName: string,
    password: string,
  ): Promise<Result<RegisterUserResult, DomainError>> {
    const validationError = validatePassword(password, this.passwordPolicy);
    if (validationError) {
      return { success: false, error: new ValidationError(validationError) };
    }

    if (this.isCommonPassword(password)) {
      return { success: false, error: new ValidationError('Password is too common') };
    }

    const existingUser = await this.userRepo.findByEmail(email);

    if (existingUser) {
      return {
        success: true,
        value: { userId: existingUser.id, breached: false, existing: true },
      };
    }

    const breached = await this.isPasswordBreached(password);
    const passwordHash = await this.hashPassword(password);

    const userId = UserId.create(randomUUID());
    const user = new User(
      userId,
      email,
      displayName,
      passwordHash,
      [],
      null,
      null,
      new Timestamps(),
    );

    await this.userRepo.save(user);

    return {
      success: true,
      value: { userId, breached, existing: false },
    };
  }
}
