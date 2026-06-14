import { Email } from '../../value-objects/identity/email';
import { UserRepository } from '../../ports/user/user.repository';
import { AuditLogRepository } from '../../ports/admin/audit-log.repository';
import { AuthAttemptTelemetryRepository } from '../../ports/admin/auth-attempt-telemetry.repository';
import { Result } from '../../types/result';
import { PasswordHasher } from '../../services/password-hasher';
import { RequestContext } from '../../types/request-context';
import { Logger } from '../../ports/observability/logger';
import { LOGIN_DELAY_MS } from '../../constants';
import { AUDIT_AUTH_SIGNED_IN } from '../../audit-actions';
import { RecordAuditEventUseCase } from './record-audit-event';
import { RecordFailedSignInUseCase } from './record-failed-sign-in';

/** Result returned on successful login. */
export interface LoginResult {
  /** The authenticated user's identifier. */
  userId: string;
  /** Whether the user has verified their email address. */
  emailVerified: boolean;
  /** Whether the user has administrator privileges. */
  isAdmin: boolean;
}

/**
 * Authenticates a user with email and password.
 *
 * Records the audit/telemetry of the attempt itself — `auth.signed_in` on
 * success, coalesced failed-sign-in telemetry on failure — and applies a
 * constant-time delay so the response time cannot reveal whether the account
 * exists. The recording happens **inside** that window (before the padding), so
 * the variable write time is absorbed by the remaining delay rather than added
 * on top of it, and the failure path is identical whether or not the account
 * exists. Recording is best-effort: a telemetry failure never breaks (or leaks
 * the timing of) authentication. The caller is responsible for session creation.
 */
export class LoginUseCase {
  private readonly recordAuditEvent: RecordAuditEventUseCase;
  private readonly recordFailedSignIn: RecordFailedSignInUseCase;

  /**
   * @param userRepo - Repository for user persistence.
   * @param passwordHasher - Service for password verification.
   * @param auditLogRepo - Repository for the `auth.signed_in` governance record.
   * @param failedSignInRepo - Repository for failed-sign-in telemetry.
   */
  constructor(
    private readonly userRepo: UserRepository,
    private readonly passwordHasher: PasswordHasher,
    auditLogRepo: AuditLogRepository,
    failedSignInRepo: AuthAttemptTelemetryRepository,
    private readonly logger?: Logger,
  ) {
    this.recordAuditEvent = new RecordAuditEventUseCase(auditLogRepo);
    this.recordFailedSignIn = new RecordFailedSignInUseCase(failedSignInRepo);
  }

  /**
   * Authenticates the user and records the attempt.
   *
   * @param email - The email address to authenticate.
   * @param password - The plaintext password to verify.
   * @param context - Request origin, captured into the audit metadata.
   * @param windowSizeMs - Coalescing window for failed-sign-in telemetry.
   * @returns Success with userId, or error for invalid credentials.
   */
  async execute(
    email: Email,
    password: string,
    context: RequestContext,
    windowSizeMs: number,
  ): Promise<Result<LoginResult, Error>> {
    // One clock read serves both roles: `now` is the domain event timestamp passed to the
    // audit/telemetry write, and `startTime` is the monotonic-ish baseline the constant-time
    // padding measures elapsed against. The closing `Date.now()` below is a genuinely later read.
    const now = new Date();
    const startTime = now.getTime();

    const user = await this.userRepo.findByEmail(email);

    let passwordValid = false;
    if (user && user.passwordHash) {
      passwordValid = await this.passwordHasher.verify(user.passwordHash, password);
    }

    const success = Boolean(user && user.passwordHash && passwordValid);

    // Record inside the constant-time window (before the padding below). Best-effort:
    // never fail authentication on a telemetry error, and the failure branch runs the
    // same work regardless of account existence, so it carries no enumeration signal.
    // Swallowed but kept observable via the logger (FR-021).
    try {
      await (success && user ? this.recordAuditEvent.execute({
          action: AUDIT_AUTH_SIGNED_IN,
          actorId: user.id,
          resourceType: 'User',
          resourceId: user.id.value,
          context,
          now,
        }) : this.recordFailedSignIn.execute({ identifier: email, context, now, windowSizeMs }));
    } catch (error) {
      this.logger?.warn('failed to record sign-in audit/telemetry', { error });
    }

    // Constant-time padding AFTER recording, so the write time is absorbed.
    const remaining = LOGIN_DELAY_MS - (Date.now() - startTime);
    if (remaining > 0) {
      await new Promise((resolve) => setTimeout(resolve, remaining));
    }

    if (!success || !user) {
      return { success: false, error: new Error('Invalid email or password') };
    }

    return {
      success: true,
      value: { userId: user.id.value, emailVerified: user.emailVerified, isAdmin: user.isAdmin },
    };
  }
}
