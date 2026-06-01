import { EmailVerificationToken } from '../entities/email-verification-token';
import { EmailVerificationTokenId } from '../value-objects/email-verification-token-id';
import { UserId } from '../value-objects/user-id';
import { UserRepository } from '../repositories/user.repository';
import { EmailVerificationTokenRepository } from '../repositories/email-verification-token.repository';
import { TokenGenerator } from '../services/token-generator';
import { EmailVerificationNotifier } from '../services/email-verification-notifier';
import { Result } from '../types/result';
import { randomUUID } from 'crypto';

/** Use case for resending a verification email to a user with an unverified address. */
export class ResendVerificationEmailUseCase {
  /** Injects the repositories and services required to resend a verification email. */
  constructor(
    private readonly userRepo: UserRepository,
    private readonly tokenRepo: EmailVerificationTokenRepository,
    private readonly tokenGenerator: TokenGenerator,
    private readonly notifier: EmailVerificationNotifier,
  ) {}

  /**
   * Generates a fresh verification token and sends the resend email.
   *
   * @param userId - ID of the user requesting a new verification email.
   * @returns Always succeeds (SMTP failures are non-fatal).
   */
  async execute(userId: UserId): Promise<Result<undefined, Error>> {
    const user = await this.userRepo.findById(userId);
    if (!user) {
      return { success: true, value: undefined };
    }

    if (user.emailVerified) {
      return { success: true, value: undefined };
    }

    const tokenData = this.tokenGenerator.generateEmailVerificationToken();
    const token = new EmailVerificationToken(
      EmailVerificationTokenId.create(randomUUID()),
      userId,
      tokenData.hashedToken,
      tokenData.expiresAt,
      null,
      new Date(),
    );

    try {
      await this.notifier.sendResendVerificationEmail(user.email, tokenData.token);
    } catch {
      // SMTP failure is non-fatal per FR-010 — old tokens remain valid, user can retry
      return { success: true, value: undefined };
    }

    await this.tokenRepo.deleteByUserId(userId);
    await this.tokenRepo.save(token);

    return { success: true, value: undefined };
  }
}
