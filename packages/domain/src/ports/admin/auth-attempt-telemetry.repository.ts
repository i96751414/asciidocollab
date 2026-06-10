import { AuthAttemptTelemetry, AuthAttemptEventType } from '../../entities/auth-attempt-telemetry';
import { PaginationOptions, PagedResult } from './audit-log.repository';

/**
 * Input for coalescing a single account-security attempt into a telemetry bucket.
 * The submitted secret is never part of this input (FR-029).
 */
export interface RecordAuthAttemptInput {
  /** Which kind of attempt this is — part of the coalescing key. */
  readonly eventType: AuthAttemptEventType;
  /** Normalized, validated attempted identifier (email). */
  readonly identifier: string;
  /** Request origin, or the sentinel `"unknown"` (never null — FR-025/D2). */
  readonly ipAddress: string;
  /** Client identifier, when available. */
  readonly userAgent: string | null;
  /** Start of the tumbling coalescing window for this attempt. */
  readonly windowStart: Date;
  /** The instant the failure occurred. */
  readonly now: Date;
}

/** Filters for reviewing account-security telemetry (FR-032). */
export interface AuthAttemptTelemetryFilters {
  /** Restrict to a single attempt kind (e.g. Only failed sign-ins). */
  eventType?: AuthAttemptEventType;
  /** Filter by attempted identifier. */
  identifier?: string;
  /** Filter by request origin. */
  ipAddress?: string;
  /** Inclusive start of the window-start range. */
  fromDate?: Date;
  /** Inclusive end of the window-start range. */
  toDate?: Date;
}

/**
 * Persistence port for failed sign-in telemetry. Separate from
 * {@link AuditLogRepository} so the two stores stay distinct (FR-026).
 */
export interface AuthAttemptTelemetryRepository {
  /**
   * Coalescing UPSERT: increments the matching (identifier, ipAddress,
   * windowStart) bucket's count and `lastAttemptAt`, or creates it with count 1.
   *
   * @param input - The attempt to record.
   * @returns A promise that resolves once the bucket is upserted.
   */
  record(input: RecordAuthAttemptInput): Promise<void>;

  /**
   * Deletes buckets whose `windowStart` is strictly older than `cutoff`.
   *
   * @param cutoff - The retention boundary.
   * @returns The number of buckets deleted (for observable purge reporting).
   */
  deleteOlderThan(cutoff: Date): Promise<number>;

  /**
   * Returns a paged, filtered view of telemetry buckets for admin review.
   *
   * @param filters - Identifier, origin, and time-range filters.
   * @param pagination - Page and limit options.
   * @returns A paged result of matching telemetry buckets.
   */
  findWithFilters(
    filters: AuthAttemptTelemetryFilters,
    pagination: PaginationOptions,
  ): Promise<PagedResult<AuthAttemptTelemetry>>;

  /**
   * Returns all telemetry buckets (test/inspection use).
   *
   * @returns All stored telemetry buckets.
   */
  findAll(): Promise<AuthAttemptTelemetry[]>;
}
