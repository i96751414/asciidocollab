import { User } from '../../entities/user';
import { UserId } from '../../value-objects/ids/user-id';
import { EmailVerificationToken } from '../../entities/email-verification-token';
import { AuditLog } from '../../entities/audit-log';
import { AuditLogId } from '../../value-objects/ids/audit-log-id';
import { UserRepository } from '../../ports/user/user.repository';
import { EmailVerificationTokenRepository } from '../../ports/auth-tokens/email-verification-token.repository';
import { AuditLogRepository } from '../../ports/admin/audit-log.repository';
import { TokenGenerator } from '../../services/token-generator';
import { InvalidTokenError } from '../../errors/auth/invalid-token';
import { DomainError } from '../../errors/domain-error';
import { Result } from '../../types/result';
import { randomUUID } from 'crypto';

/** Result returned on successful email verification. */
export interface VerifyEmailResult {
  /** The verified user's identifier. */
  userId: UserId;
  /** Whether the verified user has administrator privileges. */
  isAdmin: boolean;
}

/** Use case for verifying a user's email address via a one-time token. */
export class VerifyEmailUseCase {
  /** Injects the repositories and token generator required to verify an email. */
  constructor(
    private readonly userRepo: UserRepository,
    private readonly tokenRepo: EmailVerificationTokenRepository,
    private readonly auditLogRepo: AuditLogRepository,
    private readonly tokenGenerator: TokenGenerator,
  ) {}

  /**
   * Verifies the user's email address using the token from the verification link.
   *
   * @param rawToken - The raw (unhashed) verification token from the email link.
   * @returns Success with the user id and admin flag, or an error for invalid tokens.
   */
  async execute(rawToken: string): Promise<Result<VerifyEmailResult, DomainError>> {
    const tokenHash = this.tokenGenerator.hashToken(rawToken);
    const token = await this.tokenRepo.findByTokenHash(tokenHash);

    if (!token || !token.isValid) {
      return { success: false, error: new InvalidTokenError('Invalid or expired verification token') };
    }

    const user = await this.userRepo.findById(token.userId);
    if (!user) {
      return { success: false, error: new InvalidTokenError('Invalid or expired verification token') };
    }

    // Mark token used
    const usedToken = new EmailVerificationToken(
      token.id,
      token.userId,
      token.tokenHash,
      token.expiresAt,
      new Date(),
      token.createdAt,
    );
    await this.tokenRepo.save(usedToken);

    // Mark user verified
    const verifiedUser = new User(
      user.id,
      user.email,
      user.displayName,
      user.passwordHash,
      user.passwordHistory,
      user.samlSubject,
      user.mfaSecret,
      user.isAdmin,
      user.timestamps,
      true,
      user.registrationMethod,
    );
    await this.userRepo.save(verifiedUser);

    await this.auditLogRepo.save(new AuditLog(
      AuditLogId.create(randomUUID()),
      user.id,
      null,
      'auth.email_verified',
      'User',
      user.id.value,
    ));

    return { success: true, value: { userId: user.id, isAdmin: user.isAdmin } };
  }
}
