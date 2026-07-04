import { AuthAttemptTelemetryRepository } from '../../ports/admin/auth-attempt-telemetry.repository';
import { Result } from '../../types/result';
import { DomainError } from '../../errors/domain-error';

/** Input for purging expired failed-sign-in telemetry. */
export interface PurgeAuthAttemptTelemetryInput {
  /** The current time (injected for deterministic testing). */
  readonly now: Date;
  /** Retention window in milliseconds; buckets older than this are deleted. */
  readonly retentionWindowMs: number;
}

/** Result of a purge run. */
export interface PurgeAuthAttemptTelemetryResult {
  /** Number of telemetry buckets deleted. */
  readonly deleted: number;
}

/**
 * Deletes expired account-security telemetry — failed sign-ins and password-reset
 * requests alike, since both share one retention-bounded store — older than the
 * bounded retention window. Takes `now` as input so the cutoff is
 * deterministic and unit-testable. The caller (scheduled task) reports the
 * returned count for observability.
 */
export class PurgeAuthAttemptTelemetryUseCase {
  /**
   * @param repo - Account-security telemetry repository.
   */
  constructor(private readonly repo: AuthAttemptTelemetryRepository) {}

  /**
   * Purges buckets whose window started before `now - retentionWindowMs`.
   *
   * @param input - Current time and retention window.
   * @returns The number of buckets deleted.
   */
  async execute(input: PurgeAuthAttemptTelemetryInput): Promise<Result<PurgeAuthAttemptTelemetryResult, DomainError>> {
    const cutoff = new Date(input.now.getTime() - input.retentionWindowMs);
    const deleted = await this.repo.deleteOlderThan(cutoff);
    return { success: true, value: { deleted } };
  }
}
