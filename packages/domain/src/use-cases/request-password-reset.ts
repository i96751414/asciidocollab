import { PasswordResetToken } from '../entities/password-reset-token';
import { PasswordResetTokenId } from '../value-objects/password-reset-token-id';
import { Email } from '../value-objects/email';
import { UserRepository } from '../repositories/user.repository';
import { PasswordResetTokenRepository } from '../repositories/password-reset-token.repository';
import { Result } from '@asciidocollab/shared';
import { randomUUID } from 'crypto';

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
   * @param generateToken - Function to generate a raw + hashed token pair.
   */
  constructor(
    private readonly userRepo: UserRepository,
    private readonly tokenRepo: PasswordResetTokenRepository,
    private readonly generateToken: () => { token: string; hashedToken: string; expiresAt: Date },
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
      const dummy = this.generateToken();
      return {
        success: true,
        value: { rawToken: dummy.token, email: email.value },
      };
    }

    const resetToken = this.generateToken();
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
