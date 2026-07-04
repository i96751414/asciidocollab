import { AuthAttemptTelemetryRepository } from '../../ports/admin/auth-attempt-telemetry.repository';
import { AuthAttemptEventType } from '../../entities/auth-attempt-telemetry';
import { Email } from '../../value-objects/identity/email';
import { RequestContext } from '../../types/request-context';
import { ValidationError } from '../../errors/common/validation-error';

/** Sentinel stored when a request origin IP is unavailable (keeps the coalescing key total). */
export const UNKNOWN_IP = 'unknown';

/** Shared details for coalescing an account-security attempt into telemetry. */
export interface AuthAttemptDetails {
  /** The attempted identifier (validated email; never carries the submitted secret). */
  readonly identifier: Email;
  /** Request origin. */
  readonly context: RequestContext;
  /** The instant the attempt occurred. */
  readonly now: Date;
  /** Coalescing window size in milliseconds. */
  readonly windowSizeMs: number;
}

/**
 * Coalesces a single account-security attempt of `eventType` into its
 * tumbling-window bucket — the shared core behind {@link RecordFailedSignInUseCase}
 * and the password-reset-request recorder.
 *
 * It performs no user lookup and takes no password — the identical record shape is
 * produced whether or not the account exists, and the submitted secret is
 * never an argument. The tumbling window collapses repeated attempts for
 * the same (eventType, identifier, origin, window) into one bucket.
 *
 * @param repo - Account-security telemetry repository.
 * @param eventType - Which kind of attempt is being recorded.
 * @param input - The attempt details.
 */
export async function recordAuthAttempt(
  repo: AuthAttemptTelemetryRepository,
  eventType: AuthAttemptEventType,
  input: AuthAttemptDetails,
): Promise<void> {
  // Guard the window size: a zero/negative/non-finite value would make
  // windowStart an Invalid Date (Math.floor(t/0) = Infinity → ×0 = NaN), which
  // would throw on every record and — because recording is best-effort — silently
  // black out the telemetry. Fail loudly instead. (Config must also enforce a
  // minimum coalescing window so this is unreachable in production.)
  if (!Number.isFinite(input.windowSizeMs) || input.windowSizeMs <= 0) {
    throw new ValidationError(`windowSizeMs must be a positive number, got ${input.windowSizeMs}`);
  }
  const windowStartMs = Math.floor(input.now.getTime() / input.windowSizeMs) * input.windowSizeMs;
  await repo.record({
    eventType,
    identifier: input.identifier.value,
    ipAddress: input.context.ipAddress ?? UNKNOWN_IP,
    userAgent: input.context.userAgent ?? null,
    windowStart: new Date(windowStartMs),
    now: input.now,
  });
}
