import { Email } from '../value-objects/email';
import { UserRepository } from '../repositories/user.repository';
import { Result } from '@asciidocollab/shared';

/** Result returned on successful login. */
export interface LoginResult {
  /** The authenticated user's ID. */
  userId: string;
}

/**
 * Authenticates a user with email and password.
 *
 * Handles user lookup, password verification, and returns the user ID
 * on success. The caller is responsible for session creation.
 */
export class LoginUseCase {
  /**
   * @param userRepo - Repository for user persistence.
   * @param verifyPassword - Function to verify a password against a hash.
   */
  constructor(
    private readonly userRepo: UserRepository,
    private readonly verifyPassword: (hash: string, plain: string) => Promise<boolean>,
  ) {}

  /**
   * Authenticates the user.
   *
   * @param email - The email address to authenticate.
   * @param password - The plaintext password to verify.
   * @returns Success with userId, or error for invalid credentials.
   */
  async execute(
    email: Email,
    password: string,
  ): Promise<Result<LoginResult, Error>> {
    const user = await this.userRepo.findByEmail(email);

    if (!user || !user.passwordHash) {
      return {
        success: false,
        error: new Error('Invalid email or password'),
      };
    }

    const passwordValid = await this.verifyPassword(user.passwordHash, password);
    if (!passwordValid) {
      return {
        success: false,
        error: new Error('Invalid email or password'),
      };
    }

    return {
      success: true,
      value: { userId: user.id.value },
    };
  }
}
