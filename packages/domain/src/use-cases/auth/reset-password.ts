import { User } from '../../entities/user';
import { UserId } from '../../value-objects/ids/user-id';
import { UserRepository } from '../../ports/user/user.repository';
import { PasswordResetTokenRepository } from '../../ports/auth-tokens/password-reset-token.repository';
import { DomainError } from '../../errors/domain-error';
import { InvalidTokenError } from '../../errors/auth/invalid-token';
import { PasswordReuseError } from '../../errors/auth/password-reuse';
import { ValidationError } from '../../errors/common/validation-error';
import { PasswordPolicy, validatePassword } from '../../value-objects/identity/password-policy';
import { Result } from '../../types/result';
import { PasswordHasher } from '../../services/password-hasher';
import { TokenGenerator } from '../../services/token-generator';
import { AuditLogRepository } from '../../ports/admin/audit-log.repository';
import { RequestContext } from '../../types/request-context';
import { Logger } from '../../ports/observability/logger';
import { recordAuditSuccess } from '../audit-recording';
import { AUDIT_AUTH_PASSWORD_RESET } from '../../audit-actions';

/** Result returned on successful password reset. */
export interface ResetPasswordResult {
  /** The user whose password was reset. */
  userId: UserId;
}

/**
 * Resets a user's password using a valid reset token.
 *
 * Validates the token, validates the new password against policy,
 * checks password history, updates the password, and marks the token as used.
 */
export class ResetPasswordUseCase {
  /**
   * @param userRepo - Repository for user persistence.
   * @param tokenRepo - Repository for password reset token persistence.
   * @param passwordHasher - Service for password hashing and verification.
   * @param tokenGenerator - Service for token generation and hashing.
   * @param passwordPolicy - Password policy to validate the new password against.
   */
  constructor(
    private readonly userRepo: UserRepository,
    private readonly tokenRepo: PasswordResetTokenRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly tokenGenerator: TokenGenerator,
    private readonly passwordPolicy: PasswordPolicy,
    private readonly auditLogRepo: AuditLogRepository,
    private readonly logger?: Logger,
  ) {}

  /**
   * Resets the user's password using the provided token.
   *
   * @param rawToken - The raw reset token from the user.
   * @param newPassword - The new plaintext password to set.
   * @param historyDepth - Maximum number of previous passwords to retain.
   * @returns Success with userId, or a DomainError for validation failure or invalid/expired tokens.
   */
  async execute(
    rawToken: string,
    newPassword: string,
    historyDepth: number,
    context?: RequestContext,
  ): Promise<Result<ResetPasswordResult, DomainError>> {
    const validationError = validatePassword(newPassword, this.passwordPolicy);
    if (validationError) {
      return { success: false, error: new ValidationError(validationError) };
    }

    const tokenHash = this.tokenGenerator.hashToken(rawToken);
    const resetToken = await this.tokenRepo.findByTokenHash(tokenHash);

    if (!resetToken) {
      return {
        success: false,
        error: new InvalidTokenError('Invalid or expired reset token'),
      };
    }

    const user = await this.userRepo.findById(UserId.create(resetToken.userId.value));

    if (!user || !user.passwordHash) {
      return {
        success: false,
        error: new InvalidTokenError('Invalid or expired reset token'),
      };
    }

    const newPasswordHash = await this.passwordHasher.hash(newPassword);

    const isReused = await Promise.all(
      user.passwordHistory.map((hash) => this.passwordHasher.verify(hash, newPassword)),
    );
    if (isReused.some(Boolean)) {
      return {
        success: false,
        error: new PasswordReuseError('Cannot reuse recent passwords'),
      };
    }

    const updatedHistory = [...user.passwordHistory, user.passwordHash].slice(-historyDepth);

    const updatedUser = new User(
      user.id,
      user.email,
      user.displayName,
      newPasswordHash,
      updatedHistory,
      user.samlSubject,
      user.mfaSecret,
      user.isAdmin,
      user.timestamps,
      user.emailVerified,
      user.registrationMethod,
    );
    await this.userRepo.save(updatedUser);

    await this.tokenRepo.markAsUsed(resetToken.id.value, new Date());

    // Best-effort: the reset already committed and the token is single-use, so an
    // audit-store failure must NOT surface as the result (the failure reason must
    // stay business-only). Swallowed but kept observable via the logger.
    await recordAuditSuccess(this.auditLogRepo, {
      actorId: user.id,
      projectId: null,
      action: AUDIT_AUTH_PASSWORD_RESET,
      resourceType: 'User',
      resourceId: user.id.value,
      context,
    }, this.logger);

    return {
      success: true,
      value: { userId: user.id },
    };
  }
}
