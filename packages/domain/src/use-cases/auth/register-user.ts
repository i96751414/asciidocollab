import { User } from '../../entities/user';
import { UserId } from '../../value-objects/user-id';
import { Email } from '../../value-objects/email';
import { Timestamps } from '../../value-objects/timestamps';
import { EmailVerificationToken } from '../../entities/email-verification-token';
import { EmailVerificationTokenId } from '../../value-objects/email-verification-token-id';
import { UserRepository } from '../../ports/user/user.repository';
import { SystemSettingRepository } from '../../ports/admin/system-setting.repository';
import { EmailVerificationTokenRepository } from '../../ports/auth-tokens/email-verification-token.repository';
import { AuditLogRepository } from '../../ports/admin/audit-log.repository';
import { Logger } from '../../ports/observability/logger';
import { RequestContext } from '../../types/request-context';
import { recordAuditSuccess } from '../audit-recording';
import { AUDIT_AUTH_REGISTERED } from '../../audit-actions';
import { DomainError } from '../../errors/domain-error';
import { ValidationError } from '../../errors/validation-error';
import { RegistrationClosedError } from '../../errors/registration-closed';
import { PasswordPolicy, validatePassword } from '../../value-objects/password-policy';
import { Result } from '../../types/result';
import { randomUUID } from 'crypto';
import { PasswordHasher } from '../../services/password-hasher';
import { BreachChecker } from '../../services/breach-checker';
import { CommonPasswordChecker } from '../../services/common-password-checker';
import { TokenGenerator } from '../../services/token-generator';
import { EmailVerificationNotifier } from '../../services/email-verification-notifier';

/** Result returned on successful user registration. */
export interface RegisterUserResult {
  /** The newly created user's identifier. */
  userId: UserId;
  /** True for first-user (auto-verified admin); false for self-registration or duplicate-email path. */
  isFirstUser: boolean;
  /**
   * True only when a verification email was actually dispatched during this call.
   * False for the first-user path (auto-verified) and for the anti-enumeration
   * silent-success path (duplicate email — no email sent).
   * Routes must use this flag to decide whether to tell the frontend to "check your email".
   */
  emailSent: boolean;
}

/**
 * Handles both initial admin setup (first user) and open self-registration.
 * Renamed from RegisterUserUseCase for clarity.
 */
export class RegisterUseCase {
  /** Injects the repositories and services required to register a user. */
  constructor(
    private readonly userRepo: UserRepository,
    private readonly systemSettingRepo: SystemSettingRepository,
    private readonly emailVerificationTokenRepo: EmailVerificationTokenRepository,
    private readonly passwordPolicy: PasswordPolicy,
    private readonly commonPasswordChecker: CommonPasswordChecker,
    private readonly breachChecker: BreachChecker,
    private readonly passwordHasher: PasswordHasher,
    private readonly tokenGenerator: TokenGenerator,
    private readonly emailVerificationNotifier: EmailVerificationNotifier,
    private readonly auditLogRepo: AuditLogRepository,
    private readonly logger?: Logger,
  ) {}

  /**
   * Registers a new user, handling both first-user admin setup and open self-registration.
   *
   * @param email - The user's email address.
   * @param displayName - The display name chosen by the user.
   * @param password - The plaintext password to hash and store.
   * @returns Success with the new user id and first-user flag, or a domain error.
   */
  async execute(
    email: Email,
    displayName: string,
    password: string,
    context?: RequestContext,
  ): Promise<Result<RegisterUserResult, DomainError>> {
    const hasAny = await this.userRepo.hasAny();

    if (!hasAny) {
      // First-user path: create admin, auto-verified, auto-logged-in
      return this.registerFirstUser(email, displayName, password, context);
    }

    // Check open registration setting
    const openRegistration = await this.systemSettingRepo.get('openRegistration');
    if (openRegistration !== 'true') {
      return { success: false, error: new RegistrationClosedError() };
    }

    // Check if email already registered (anti-enumeration: return success silently, no email sent)
    const existing = await this.userRepo.findByEmail(email);
    if (existing) {
      return { success: true, value: { userId: existing.id, isFirstUser: false, emailSent: false } };
    }

    return this.registerSelfUser(email, displayName, password, context);
  }

  private async registerFirstUser(
    email: Email,
    displayName: string,
    password: string,
    context?: RequestContext,
  ): Promise<Result<RegisterUserResult, DomainError>> {
    const validationError = validatePassword(password, this.passwordPolicy);
    if (validationError) return { success: false, error: new ValidationError(validationError) };

    if (this.commonPasswordChecker.isCommon(password)) {
      return { success: false, error: new ValidationError('Password is too common') };
    }

    let breached = false;
    try { breached = await this.breachChecker.isBreached(password); } catch { /* non-blocking */ }
    if (breached) return { success: false, error: new ValidationError('Password has been found in a data breach') };

    const passwordHash = await this.passwordHasher.hash(password);
    const userId = UserId.create(randomUUID());
    const user = new User(
      userId,
      email,
      displayName,
      passwordHash,
      [],
      null,
      null,
      true,
      new Timestamps(),
      true,
      'SELF_REGISTERED',
    );

    try {
      await this.userRepo.save(user);
    } catch (saveError) {
      try {
        if (await this.userRepo.hasAny()) {
          return { success: false, error: new RegistrationClosedError() };
        }
      } catch { /* propagate original */ }
      throw saveError;
    }

    await this.recordRegistered(userId, context);

    return { success: true, value: { userId, isFirstUser: true, emailSent: false } };
  }

  private async registerSelfUser(
    email: Email,
    displayName: string,
    password: string,
    context?: RequestContext,
  ): Promise<Result<RegisterUserResult, DomainError>> {
    const validationError = validatePassword(password, this.passwordPolicy);
    if (validationError) return { success: false, error: new ValidationError(validationError) };

    if (this.commonPasswordChecker.isCommon(password)) {
      return { success: false, error: new ValidationError('Password is too common') };
    }

    let breached = false;
    try { breached = await this.breachChecker.isBreached(password); } catch { /* non-blocking */ }
    if (breached) return { success: false, error: new ValidationError('Password has been found in a data breach') };

    const passwordHash = await this.passwordHasher.hash(password);
    const userId = UserId.create(randomUUID());
    const user = new User(
      userId,
      email,
      displayName,
      passwordHash,
      [],
      null,
      null,
      false,
      new Timestamps(),
      false,
      'SELF_REGISTERED',
    );

    // Generate verification token
    const tokenData = this.tokenGenerator.generateEmailVerificationToken();
    const tokenEntity = new EmailVerificationToken(
      EmailVerificationTokenId.create(randomUUID()),
      userId,
      tokenData.hashedToken,
      tokenData.expiresAt,
      null,
      new Date(),
    );

    // Persist user and token BEFORE sending the email.
    // If the DB save fails, no orphaned email link is delivered.
    // If the email send fails after a successful save, the user is in DB
    // (unverified) and can request a resend via /auth/resend-verification.
    await this.userRepo.save(user);
    await this.emailVerificationTokenRepo.save(tokenEntity);

    try {
      await this.emailVerificationNotifier.sendVerificationEmail(email, tokenData.token);
    } catch {
      // Non-fatal: user is persisted and can trigger a resend from /verify-email-required.
    }

    await this.recordRegistered(userId, context);

    return { success: true, value: { userId, isFirstUser: false, emailSent: true } };
  }

  /**
   * Records the account-creation audit event. Only called when a user is actually
   * persisted, so the write is best-effort (FR-021): the account already exists and
   * cannot be un-created, so an audit-store failure must never turn a successful
   * registration into an error the caller cannot retry.
   */
  private async recordRegistered(userId: UserId, context?: RequestContext): Promise<void> {
    await recordAuditSuccess(
      this.auditLogRepo,
      {
        actorId: userId,
        projectId: null,
        action: AUDIT_AUTH_REGISTERED,
        resourceType: 'User',
        resourceId: userId.value,
        context,
      },
      this.logger,
    );
  }
}

// Backward-compatible alias for existing callers
export { RegisterUseCase as RegisterUserUseCase };
