import { User } from '../entities/user';
import { UserId } from '../value-objects/user-id';
import { Email } from '../value-objects/email';
import { Timestamps } from '../value-objects/timestamps';
import { UserRepository } from '../repositories/user.repository';
import { DomainError } from '../errors/domain-error';
import { Result } from '@asciidocollab/shared';
import { randomUUID } from 'crypto';

/** Result returned on successful registration. */
export interface RegisterUserResult {
  /** The newly created user's ID. */
  userId: UserId;
  /** Whether the password was found in a breach database. */
  breached: boolean;
}

/**
 * Registers a new user with email and password.
 *
 * Handles duplicate detection (returns success for existing email),
 * password hashing delegation, and breach notification flagging.
 * The caller is responsible for password validation, common-password check,
 * and breach detection before calling this use case.
 */
export class RegisterUserUseCase {
  /**
   * @param userRepo - Repository for user persistence.
   */
  constructor(
    private readonly userRepo: UserRepository,
  ) {}

  /**
   * Registers a new user or detects an existing account.
   *
   * @param email - The validated email address.
   * @param displayName - The user's chosen display name.
   * @param passwordHash - The argon2id hash of the validated password.
   * @param breached - Whether the password was found in a breach database.
   * @returns Success with userId and breach flag, or a DomainError.
   */
  async execute(
    email: Email,
    displayName: string,
    passwordHash: string,
    breached: boolean,
  ): Promise<Result<RegisterUserResult, DomainError>> {
    const existingUser = await this.userRepo.findByEmail(email);

    if (existingUser) {
      return {
        success: true,
        value: { userId: existingUser.id, breached },
      };
    }

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
      value: { userId, breached },
    };
  }
}
