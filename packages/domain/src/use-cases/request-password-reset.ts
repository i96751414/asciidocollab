import { PasswordResetToken } from '../entities/password-reset-token';
import { PasswordResetTokenId } from '../value-objects/password-reset-token-id';
import { Email } from '../value-objects/email';
import { UserRepository } from '../repositories/user.repository';
import { PasswordResetTokenRepository } from '../repositories/password-reset-token.repository';
import { Result } from '@asciidocollab/shared';
import { randomUUID } from 'crypto';
import { TokenGenerator } from '../services/token-generator';

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
   * @param email - The email address to reset.
   * @returns Success with raw token and email, or error if user not found.
   */
  async execute(email: Email): Promise<Result<RequestPasswordResetResult, Error>> {
    const user = await this.userRepo.findByEmail(email);

    if (!user) {
      const dummy = this.tokenGenerator.generatePasswordResetToken();
      return {
        success: true,
        value: { rawToken: dummy.token, email: email.value },
      };
    }

    const resetToken = this.tokenGenerator.generatePasswordResetToken();
    const tokenEntity = new PasswordResetToken(
      PasswordResetTokenId.create(randomUUID()),
      user.id,
      resetToken.hashedToken,
      resetToken.expiresAt,
      null,
    );

    await this.tokenRepo.save(tokenEntity);

    return {
      success: true,
      value: { rawToken: resetToken.token, email: email.value },
    };
  }
}
