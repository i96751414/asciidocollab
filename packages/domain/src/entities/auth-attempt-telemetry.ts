import { AuthAttemptTelemetryId } from '../value-objects/ids/auth-attempt-telemetry-id';
import { ValidationError } from '../errors/common/validation-error';

/** Coalesced failed sign-in attempts. */
export const AUTH_ATTEMPT_FAILED_SIGN_IN = 'failed_sign_in';
/** Coalesced password-reset *requests* — account-existence neutral like failed sign-ins. */
export const AUTH_ATTEMPT_PASSWORD_RESET_REQUEST = 'password_reset_request';

/**
 * Discriminates the kind of account-security attempt a telemetry bucket coalesces.
 * Kept separate from the governance `AuditLog` action vocabulary: these are
 * volume-bounded, purged telemetry events, not indefinitely-retained governance records.
 */
export type AuthAttemptEventType =
  | typeof AUTH_ATTEMPT_FAILED_SIGN_IN
  | typeof AUTH_ATTEMPT_PASSWORD_RESET_REQUEST;

/**
 * Coalesced, retention-bounded telemetry for account-security attempts that must
 * stay account-existence neutral — failed sign-ins and password-reset
 * requests. A single store with an `eventType` discriminator so both share the
 * same coalescing, retention, and purge mechanism.
 *
 * Kept deliberately distinct from the governance `AuditLog`: it bounds storage
 * volume by aggregating repeated attempts into a single bucket keyed by
 * (eventType, identifier, ipAddress, windowStart), is account-existence neutral,
 * never stores the submitted secret, and is purged after a bounded retention window.
 */
export class AuthAttemptTelemetry {
  /**
   * @param id - Unique identifier for this telemetry bucket.
   * @param eventType - Which kind of attempt this bucket coalesces.
   * @param identifier - The normalized, validated email attempted (never a secret).
   * @param ipAddress - The request origin, or the sentinel `"unknown"` when absent
   *   (NOT null, so the coalescing key stays total).
   * @param userAgent - The client identifier, when available.
   * @param windowStart - Start of the tumbling coalescing window this bucket covers.
   * @param attemptCount - Number of attempts coalesced into this bucket (>= 1).
   * @param firstAttemptAt - Timestamp of the first attempt in the window.
   * @param lastAttemptAt - Timestamp of the most recent attempt in the window.
   */
  constructor(
    public readonly id: AuthAttemptTelemetryId,
    public readonly eventType: AuthAttemptEventType,
    public readonly identifier: string,
    public readonly ipAddress: string,
    public readonly userAgent: string | null,
    public readonly windowStart: Date,
    public readonly attemptCount: number,
    public readonly firstAttemptAt: Date,
    public readonly lastAttemptAt: Date,
  ) {
    if (!Number.isInteger(attemptCount) || attemptCount < 1) {
      throw new ValidationError(
        `AuthAttemptTelemetry attemptCount must be an integer >= 1, got ${attemptCount}`,
      );
    }
  }
}
