import { PasswordResetToken } from '../entities/password-reset-token';
import { PasswordResetTokenId } from '../value-objects/password-reset-token-id';
import { Email } from '../value-objects/email';
import { UserRepository } from '../repositories/user.repository';
import { PasswordResetTokenRepository } from '../repositories/password-reset-token.repository';
import { Result } from '@asciidocollab/shared';
import { randomUUID } from 'crypto';
import { TokenGenerator } from '../services/token-generator';
import { PASSWORD_RESET_DELAY_MS } from '../constants';

/** Result returned on successful password reset request. */
export interface RequestPasswordResetResult {
  /** The raw token to include in the reset email (not stored). */
  rawToken: string;
  /** The email address the reset was sent to. */
  email: string;
}

/**
 * Initiates a password reset by generating a token and persisting it.
 *
 * If the email does not exist, returns success with a dummy token to prevent
 * enumeration. The caller is responsible for sending the email.
 */
export class RequestPasswordResetUseCase {
  /**
   * @param userRepo - Repository for user persistence.
   * @param tokenRepo - Repository for password reset token persistence.
   * @param tokenGenerator - Service for token generation.
   */
  constructor(
    private readonly userRepo: UserRepository,
    private readonly tokenRepo: PasswordResetTokenRepository,
    private readonly tokenGenerator: TokenGenerator,
  ) {}

  /**
   * Creates a password reset token for the given email.
   *
   * Always returns success to prevent email enumeration.
   * Applies constant-time delay to prevent timing attacks.
   *
   * @param email - The email address to reset.
   * @returns Always returns success with a token.
   */
  async execute(email: Email): Promise<Result<RequestPasswordResetResult, Error>> {
    const startTime = Date.now();

    const user = await this.userRepo.findByEmail(email);

    // Always generate a token to ensure constant-time behavior
    const resetToken = this.tokenGenerator.generatePasswordResetToken();

    if (user) {
      // Only save token if user exists (database write is the timing differentiator)
      const tokenEntity = new PasswordResetToken(
        PasswordResetTokenId.create(randomUUID()),
        user.id,
        resetToken.hashedToken,
        resetToken.expiresAt,
        null,
      );
      await this.tokenRepo.save(tokenEntity);
    }

    // Ensure constant-time response by waiting at least PASSWORD_RESET_DELAY_MS
    const elapsed = Date.now() - startTime;
    const remaining = PASSWORD_RESET_DELAY_MS - elapsed;
    if (remaining > 0) {
      await new Promise((resolve) => setTimeout(resolve, remaining));
    }

    // Always return success with a token
    // If user doesn't exist, the token won't match any stored token
    return {
      success: true,
      value: { rawToken: resetToken.token, email: email.value },
    };
  }
}
