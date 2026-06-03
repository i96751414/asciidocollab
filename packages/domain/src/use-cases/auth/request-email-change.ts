import { EmailChangeToken } from '../../entities/email-change-token';
import { EmailChangeTokenId } from '../../value-objects/email-change-token-id';
import { UserId } from '../../value-objects/user-id';
import { Email } from '../../value-objects/email';
import { UserRepository } from '../../ports/user/user.repository';
import { EmailChangeTokenRepository } from '../../ports/auth-tokens/email-change-token.repository';
import { TokenGenerator } from '../../services/token-generator';
import { EmailChangeNotifier } from '../../services/email-change-notifier';
import { Result } from '../../types/result';
import { NotificationDeliveryError } from '../../errors/notification-delivery';
import { randomUUID } from 'crypto';

/** Initiates an email address change by issuing a confirmation token and notifying the user. */
export class RequestEmailChangeUseCase {
  /**
   * @param userRepo - Repository for user lookups.
   * @param tokenRepo - Repository for email change token persistence.
   * @param tokenGenerator - Service for token generation.
   * @param notifier - Notifier responsible for sending the confirmation message.
   */
  constructor(
    private readonly userRepo: UserRepository,
    private readonly tokenRepo: EmailChangeTokenRepository,
    private readonly tokenGenerator: TokenGenerator,
    private readonly notifier: EmailChangeNotifier,
  ) {}

  /**
   * Validates the new email and creates a confirmation token if available.
   *
   * @param userId - The authenticated user requesting the change.
   * @param newEmail - The desired new email address.
   * @returns Always returns success to prevent enumeration.
   */
  async execute(userId: UserId, newEmail: string): Promise<Result<undefined, Error>> {
    const currentUser = await this.userRepo.findById(userId);

    if (!currentUser) return { success: true, value: undefined };

    if (currentUser.email.value === newEmail) {
      return { success: true, value: undefined };
    }

    // Enumeration prevention — always return success if email is taken
    const existingUser = await this.userRepo.findByEmail(Email.create(newEmail));
    if (existingUser) {
      return { success: true, value: undefined };
    }

    // Supersede any existing active token
    await this.tokenRepo.deleteByUserId(userId);

    const tokenData = this.tokenGenerator.generatePasswordResetToken();
    const token = new EmailChangeToken(
      EmailChangeTokenId.create(randomUUID()),
      userId,
      tokenData.hashedToken,
      newEmail,
      tokenData.expiresAt,
      null,
    );
    await this.tokenRepo.save(token);

    try {
      await this.notifier.sendConfirmationEmail(newEmail, tokenData.token);
    } catch (error) {
      throw new NotificationDeliveryError(error instanceof Error ? error : undefined);
    }

    return { success: true, value: undefined };
  }
}
