import { AuthAttemptTelemetryRepository } from '../../ports/admin/auth-attempt-telemetry.repository';
import { AUTH_ATTEMPT_PASSWORD_RESET_REQUEST } from '../../entities/auth-attempt-telemetry';
import { AuthAttemptDetails, recordAuthAttempt } from './record-auth-attempt';

/** Input for recording a password-reset request as coalesced telemetry. */
export type RecordPasswordResetRequestInputDto = AuthAttemptDetails;

/**
 * Records a password-reset *request* as account-existence-neutral, coalesced,
 * auto-purged telemetry — the same mechanism as failed sign-ins. A reset request
 * must not reveal whether the account exists, so (like a failed sign-in) it is
 * keyed by the attempted identifier rather than a user id, and it is bounded and
 * purged on the shared retention schedule rather than kept as a governance record.
 * A thin specialization of {@link recordAuthAttempt} that pins the
 * `password_reset_request` event type.
 */
export class RecordPasswordResetRequestUseCase {
  /**
   * @param repo - Account-security telemetry repository.
   */
  constructor(private readonly repo: AuthAttemptTelemetryRepository) {}

  /**
   * Coalesces the reset request into its tumbling-window bucket.
   *
   * @param input - The attempt details.
   */
  async execute(input: RecordPasswordResetRequestInputDto): Promise<void> {
    await recordAuthAttempt(this.repo, AUTH_ATTEMPT_PASSWORD_RESET_REQUEST, input);
  }
}
