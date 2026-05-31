import { EmailChangeToken } from '../entities/email-change-token';
import { EmailChangeTokenId } from '../value-objects/email-change-token-id';
import { UserId } from '../value-objects/user-id';
import { Email } from '../value-objects/email';
import { UserRepository } from '../repositories/user.repository';
import { EmailChangeTokenRepository } from '../repositories/email-change-token.repository';
import { TokenGenerator } from '../services/token-generator';
import { Result } from '../types/result';
import { randomUUID } from 'crypto';

/** The value returned on successful email change request. */
export interface RequestEmailChangeResult {
  /** The raw (unhashed) token to send to the user. Empty string when no email is sent. */
  rawToken: string;
  /** The new email address that is pending confirmation. */
  pendingEmail: string;
}

/** Initiates an email address change by issuing a confirmation token. */
export class RequestEmailChangeUseCase {
  /** Creates the use case with its required repositories and services. */
  constructor(
    private readonly userRepo: UserRepository,
    private readonly tokenRepo: EmailChangeTokenRepository,
    private readonly tokenGenerator: TokenGenerator,
  ) {}

  /** Validates the new email and creates a confirmation token if available. */
  async execute(
    userId: UserId,
    newEmail: string,
  ): Promise<Result<RequestEmailChangeResult, Error>> {
    const currentUser = await this.userRepo.findById(userId);

    // Noop if newEmail equals current email
    if (currentUser && currentUser.email.value === newEmail) {
      return { success: true, value: { rawToken: '', pendingEmail: newEmail } };
    }

    // Enumeration prevention — always return success if email is taken
    const existingUser = await this.userRepo.findByEmail(Email.create(newEmail));
    if (existingUser) {
      return { success: true, value: { rawToken: '', pendingEmail: newEmail } };
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

    return { success: true, value: { rawToken: tokenData.token, pendingEmail: newEmail } };
  }
}
