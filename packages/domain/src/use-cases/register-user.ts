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
import { PasswordHasher } from '../services/password-hasher';
import { BreachChecker } from '../services/breach-checker';
import { CommonPasswordChecker } from '../services/common-password-checker';

/** Result returned on successful registration. */
export interface RegisterUserResult {
  /** The newly created user's ID. */
  userId: UserId;
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
   * @param commonPasswordChecker - Service to check if a password is common.
   * @param breachChecker - Service to check if a password appears in breach databases.
   * @param passwordHasher - Service to hash passwords.
   */
  constructor(
    private readonly userRepo: UserRepository,
    private readonly passwordPolicy: PasswordPolicy,
    private readonly commonPasswordChecker: CommonPasswordChecker,
    private readonly breachChecker: BreachChecker,
    private readonly passwordHasher: PasswordHasher,
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

    if (this.commonPasswordChecker.isCommon(password)) {
      return { success: false, error: new ValidationError('Password is too common') };
    }

    const existingUser = await this.userRepo.findByEmail(email);

    if (existingUser) {
      return {
        success: true,
        value: { userId: existingUser.id, existing: true },
      };
    }

    let breached = false;
    try {
      breached = await this.breachChecker.isBreached(password);
    } catch {
      // Breach check failure is non-blocking - allow registration to proceed
    }

    if (breached) {
      return {
        success: false,
        error: new ValidationError('Password has been found in a data breach'),
      };
    }

    const passwordHash = await this.passwordHasher.hash(password);

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
      value: { userId, existing: false },
    };
  }
}
