import { Email } from '../value-objects/email';
import { UserRepository } from '../repositories/user.repository';
import { Result } from '../types/result';
import { PasswordHasher } from '../services/password-hasher';
import { LOGIN_DELAY_MS } from '../constants';

/** Result returned on successful login. */
export interface LoginResult {
  /** The authenticated user's ID. */
  userId: string;
}

/**
 * Authenticates a user with email and password.
 *
 * Handles user lookup, password verification, and returns the user ID
 * on success. Applies a constant-time delay on failure to prevent timing attacks.
 * The caller is responsible for session creation.
 */
export class LoginUseCase {
  /**
   * @param userRepo - Repository for user persistence.
   * @param passwordHasher - Service for password verification.
   */
  constructor(
    private readonly userRepo: UserRepository,
    private readonly passwordHasher: PasswordHasher,
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
    const startTime = Date.now();

    const user = await this.userRepo.findByEmail(email);

    let passwordValid = false;
    if (user && user.passwordHash) {
      passwordValid = await this.passwordHasher.verify(user.passwordHash, password);
    }

    // Ensure constant-time response by waiting at least LOGIN_DELAY_MS
    const elapsed = Date.now() - startTime;
    const remaining = LOGIN_DELAY_MS - elapsed;
    if (remaining > 0) {
      await new Promise((resolve) => setTimeout(resolve, remaining));
    }

    if (!user || !user.passwordHash || !passwordValid) {
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
