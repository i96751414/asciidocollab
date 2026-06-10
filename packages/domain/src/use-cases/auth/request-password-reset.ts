import { PasswordResetToken } from '../../entities/password-reset-token';
import { PasswordResetTokenId } from '../../value-objects/password-reset-token-id';
import { Email } from '../../value-objects/email';
import { UserRepository } from '../../ports/user/user.repository';
import { PasswordResetTokenRepository } from '../../ports/auth-tokens/password-reset-token.repository';
import { AuthAttemptTelemetryRepository } from '../../ports/admin/auth-attempt-telemetry.repository';
import { Logger } from '../../ports/observability/logger';
import { RequestContext } from '../../types/request-context';
import { Result } from '../../types/result';
import { randomUUID } from 'crypto';
import { TokenGenerator } from '../../services/token-generator';
import { PasswordResetNotifier } from '../../services/password-reset-notifier';
import { PASSWORD_RESET_DELAY_MS } from '../../constants';
import { RecordPasswordResetRequestUseCase } from './record-password-reset-request';

/**
 * Telemetry wiring for reset-request recording. Bundling the store and its
 * coalescing window into one optional parameter makes them atomic — there is no
 * way to wire the repository without also supplying the window (which would
 * otherwise silently disable recording).
 */
export interface ResetRequestTelemetryConfig {
  /** Account-security telemetry store. */
  readonly repo: AuthAttemptTelemetryRepository;
  /** Coalescing window in milliseconds. */
  readonly windowSizeMs: number;
}

/**
 * Initiates a password reset by generating a token and persisting it,
 * then notifying the user via the injected notifier.
 *
 * If the email does not exist, returns success with no side-effects to
 * prevent enumeration. Applies constant-time delay to prevent timing attacks.
 *
 * Every request is also recorded as account-existence-neutral, auto-purged
 * telemetry (the same coalesced mechanism as failed sign-ins) so reset-request
 * abuse is reconstructable without leaking which accounts exist.
 */
export class RequestPasswordResetUseCase {
  private readonly recordRequest?: RecordPasswordResetRequestUseCase;
  private readonly windowSizeMs?: number;

  /**
   * @param userRepo - Repository for user lookups.
   * @param tokenRepo - Repository for password reset token persistence.
   * @param tokenGenerator - Service for token generation.
   * @param notifier - Notifier responsible for sending the reset message.
   * @param telemetry - Reset-request telemetry store + coalescing window (atomic).
   * @param logger - Observability sink for swallowed telemetry failures (FR-021).
   */
  constructor(
    private readonly userRepo: UserRepository,
    private readonly tokenRepo: PasswordResetTokenRepository,
    private readonly tokenGenerator: TokenGenerator,
    private readonly notifier: PasswordResetNotifier,
    telemetry?: ResetRequestTelemetryConfig,
    private readonly logger?: Logger,
  ) {
    this.recordRequest = telemetry
      ? new RecordPasswordResetRequestUseCase(telemetry.repo)
      : undefined;
    this.windowSizeMs = telemetry?.windowSizeMs;
  }

  /**
   * Creates a password reset token for the given email and notifies the user.
   *
   * Always returns success to prevent email enumeration.
   * Applies constant-time delay to prevent timing attacks.
   *
   * @param email - The email address to reset.
   * @param context - Request origin, recorded into the reset-request telemetry.
   * @returns Always returns success.
   */
  async execute(
    email: Email,
    context?: RequestContext,
  ): Promise<Result<undefined, Error>> {
    const now = new Date();
    const startTime = now.getTime();

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

    // Record inside the constant-time window (before the padding below) so the write time is
    // absorbed and the timing is identical whether or not the account exists. Best-effort and
    // existence-neutral: recorded for every request, keyed by the attempted identifier (FR-028).
    if (this.recordRequest && this.windowSizeMs !== undefined) {
      try {
        await this.recordRequest.execute({
          identifier: email,
          context: context ?? {},
          now,
          windowSizeMs: this.windowSizeMs,
        });
      } catch (error) {
        this.logger?.warn('failed to record password-reset-request telemetry', { error });
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
