import { User } from '../entities/user';
import { UserId } from '../value-objects/user-id';
import { Email } from '../value-objects/email';
import { EmailChangeTokenRepository } from '../ports/auth-tokens/email-change-token.repository';
import { UserRepository } from '../ports/user/user.repository';
import { TokenGenerator } from '../services/token-generator';
import { DomainError } from '../errors/domain-error';
import { InvalidTokenError } from '../errors/invalid-token';
import { Result } from '../types/result';

/** The value returned on successful email confirmation. */
export interface ConfirmEmailChangeResult {
  /** The ID of the user whose email was updated. */
  userId: UserId;
  /** The new email address that was confirmed. */
  newEmail: string;
}

/** Confirms an email address change using the token sent to the user. */
export class ConfirmEmailChangeUseCase {
  /** Creates the use case with its required repositories and services. */
  constructor(
    private readonly tokenRepo: EmailChangeTokenRepository,
    private readonly userRepo: UserRepository,
    private readonly tokenGenerator: TokenGenerator,
  ) {}

  /** Validates the token, updates the user's email, and marks the token as used. */
  async execute(rawToken: string): Promise<Result<ConfirmEmailChangeResult, DomainError>> {
    const tokenHash = this.tokenGenerator.hashToken(rawToken);
    const token = await this.tokenRepo.findByTokenHash(tokenHash);

    if (!token || !token.isValid) {
      return {
        success: false,
        error: new InvalidTokenError('This confirmation link is invalid or has expired'),
      };
    }

    const user = await this.userRepo.findById(token.userId);
    if (!user) {
      return {
        success: false,
        error: new InvalidTokenError('This confirmation link is invalid or has expired'),
      };
    }

    const updatedUser = new User(
      user.id,
      Email.create(token.pendingEmail),
      user.displayName,
      user.passwordHash,
      user.passwordHistory,
      user.samlSubject,
      user.mfaSecret,
      user.isAdmin,
      user.timestamps,
      user.emailVerified,
      user.registrationMethod,
    );
    await this.userRepo.save(updatedUser);
    await this.tokenRepo.markAsUsed(token.id.value, new Date());

    return {
      success: true,
      value: { userId: user.id, newEmail: token.pendingEmail },
    };
  }
}
