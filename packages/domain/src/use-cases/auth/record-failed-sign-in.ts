import { AuthAttemptTelemetryRepository } from '../../ports/admin/auth-attempt-telemetry.repository';
import { AUTH_ATTEMPT_FAILED_SIGN_IN } from '../../entities/auth-attempt-telemetry';
import { AuthAttemptDetails, recordAuthAttempt } from './record-auth-attempt';

export { UNKNOWN_IP } from './record-auth-attempt';

/** Input for recording a failed sign-in attempt as coalesced telemetry. */
export type RecordFailedSignInInputDto = AuthAttemptDetails;

/**
 * Records a failed sign-in as account-existence-neutral, coalesced telemetry
 * (FR-025/FR-028/FR-029). A thin specialization of {@link recordAuthAttempt} that
 * pins the `failed_sign_in` event type.
 */
export class RecordFailedSignInUseCase {
  /**
   * @param repo - Account-security telemetry repository.
   */
  constructor(private readonly repo: AuthAttemptTelemetryRepository) {}

  /**
   * Coalesces the failed attempt into its tumbling-window bucket.
   *
   * @param input - The attempt details.
   */
  async execute(input: RecordFailedSignInInputDto): Promise<void> {
    await recordAuthAttempt(this.repo, AUTH_ATTEMPT_FAILED_SIGN_IN, input);
  }
}