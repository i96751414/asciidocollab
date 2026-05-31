import { PasswordResetToken } from '../entities/password-reset-token';
import { PasswordResetTokenId } from '../value-objects/password-reset-token-id';
import { Email } from '../value-objects/email';
import { UserRepository } from '../repositories/user.repository';
import { PasswordResetTokenRepository } from '../repositories/password-reset-token.repository';
import { Result } from '../types/result';
import { randomUUID } from 'crypto';
import { TokenGenerator } from '../services/token-generator';
import { PasswordResetNotifier } from '../services/password-reset-notifier';
import { PASSWORD_RESET_DELAY_MS } from '../constants';

/**
 * Initiates a password reset by generating a token and persisting it,
 * then notifying the user via the injected notifier.
 *
 * If the email does not exist, returns success with no side-effects to
 * prevent enumeration. Applies constant-time delay to prevent timing attacks.
 */
export class RequestPasswordResetUseCase {
  /**
   * @param userRepo - Repository for user lookups.
   * @param tokenRepo - Repository for password reset token persistence.
   * @param tokenGenerator - Service for token generation.
   * @param notifier - Notifier responsible for sending the reset message.
   */
  constructor(
    private readonly userRepo: UserRepository,
    private readonly tokenRepo: PasswordResetTokenRepository,
    private readonly tokenGenerator: TokenGenerator,
    private readonly notifier: PasswordResetNotifier,
  ) {}

  /**
   * Creates a password reset token for the given email and notifies the user.
   *
   * Always returns success to prevent email enumeration.
   * Applies constant-time delay to prevent timing attacks.
   *
   * @param email - The email address to reset.
   * @returns Always returns success.
   */
  async execute(email: Email): Promise<Result<undefined, Error>> {
    const startTime = Date.now();

    const user = await this.userRepo.findByEmail(email);
    const resetToken = this.tokenGenerator.generatePasswordResetToken();

    if (user) {
      const tokenEntity = new PasswordResetToken(
        PasswordResetTokenId.create(randomUUID()),
        user.id,
        resetToken.hashedToken,
        resetToken.expiresAt,
        null,
      );
      await this.tokenRepo.save(tokenEntity);

      try {
        await this.notifier.sendResetEmail(email.value, resetToken.token);
      } catch {
        // delivery failure is non-fatal; infrastructure layer logs it
      }
    }

    const elapsed = Date.now() - startTime;
    const remaining = PASSWORD_RESET_DELAY_MS - elapsed;
    if (remaining > 0) {
      await new Promise((resolve) => setTimeout(resolve, remaining));
    }

    return { success: true, value: undefined };
  }
}
