import { User } from '../../entities/user';
import { UserId } from '../../value-objects/ids/user-id';
import { Email } from '../../value-objects/identity/email';
import { EmailChangeTokenRepository } from '../../ports/auth-tokens/email-change-token.repository';
import { UserRepository } from '../../ports/user/user.repository';
import { TokenGenerator } from '../../services/token-generator';
import { DomainError } from '../../errors/domain-error';
import { InvalidTokenError } from '../../errors/auth/invalid-token';
import { Result } from '../../types/result';
import { AuditLogRepository } from '../../ports/admin/audit-log.repository';
import { RequestContext } from '../../types/request-context';
import { Logger } from '../../ports/observability/logger';
import { recordAuditSuccess } from '../audit-recording';
import { AUDIT_AUTH_EMAIL_CHANGED } from '../../audit-actions';

/** The value returned on successful email confirmation. */
export interface ConfirmEmailChangeResult {
  /** The ID of the user whose email was updated. */
  userId: UserId;
  /** The email address the account had before the change (for audit before/after). */
  previousEmail: string;
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
    private readonly auditLogRepo: AuditLogRepository,
    private readonly logger?: Logger,
  ) {}

  /** Validates the token, updates the user's email, and marks the token as used. */
  async execute(
    rawToken: string,
    context?: RequestContext,
  ): Promise<Result<ConfirmEmailChangeResult, DomainError>> {
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

    const previousEmail = user.email.value;
    const newEmail = token.pendingEmail;

    // Best-effort: the email change already committed and the token is single-use, so an
    // audit-store failure must NOT surface as the result (the failure reason must stay
    // business-only). Swallowed but kept observable via the logger.
    await recordAuditSuccess(this.auditLogRepo, {
      actorId: user.id,
      projectId: null,
      action: AUDIT_AUTH_EMAIL_CHANGED,
      resourceType: 'User',
      resourceId: user.id.value,
      metadata: { previousEmail, newEmail },
      context,
    }, this.logger);

    return {
      success: true,
      value: { userId: user.id, previousEmail, newEmail },
    };
  }
}
