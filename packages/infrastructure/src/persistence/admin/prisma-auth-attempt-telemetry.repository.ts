import { PrismaClient } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import {
  AuthAttemptTelemetry,
  AuthAttemptTelemetryId,
  AuthAttemptTelemetryRepository,
  AuthAttemptTelemetryFilters,
  AuthAttemptEventType,
  AUTH_ATTEMPT_FAILED_SIGN_IN,
  AUTH_ATTEMPT_PASSWORD_RESET_REQUEST,
  RecordAuthAttemptInput,
  PaginationOptions,
  PagedResult,
} from '@asciidocollab/domain';
import { dateRangeFilter, paginationSkip } from './prisma-query-helpers';

/**
 * Prisma-backed implementation of {@link AuthAttemptTelemetryRepository}.
 *
 * Coalescing is an atomic UPSERT on the `(eventType, identifier, ipAddress,
 * windowStart)` unique key. The store is intentionally separate from `AuditLog`
 * and has no FK to `User` (attempts may target non-existent accounts).
 */
export class PrismaAuthAttemptTelemetryRepository implements AuthAttemptTelemetryRepository {
  /**
   * @param prisma - The Prisma client used for database operations.
   */
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Coalescing UPSERT: increments the matching bucket or creates a new one.
   *
   * @param input - The attempt to record.
   */
  async record(input: RecordAuthAttemptInput): Promise<void> {
    // Atomic coalescing via a single INSERT ... ON CONFLICT DO UPDATE. Prisma's
    // `upsert` can resolve as find-then-insert, so two concurrent first-attempts
    // for the same bucket would race to a unique-constraint violation — and since
    // recording is best-effort (errors are swallowed by the caller), that attempt
    // would be silently uncounted during exactly the brute-force burst this
    // telemetry exists to measure. A native upsert increments losslessly instead.
    await this.prisma.$executeRaw`
      INSERT INTO "AuthAttemptTelemetry"
        ("id", "eventType", "identifier", "ipAddress", "userAgent", "windowStart", "attemptCount", "firstAttemptAt", "lastAttemptAt")
      VALUES
        (gen_random_uuid(), ${input.eventType}, ${input.identifier}, ${input.ipAddress}, ${input.userAgent}, ${input.windowStart}, 1, ${input.now}, ${input.now})
      ON CONFLICT ("eventType", "identifier", "ipAddress", "windowStart")
      DO UPDATE SET
        "attemptCount" = "AuthAttemptTelemetry"."attemptCount" + 1,
        "lastAttemptAt" = ${input.now}
    `;
  }

  /**
   * @param cutoff - The retention boundary.
   * @returns The number of buckets deleted.
   */
  async deleteOlderThan(cutoff: Date): Promise<number> {
    const { count } = await this.prisma.authAttemptTelemetry.deleteMany({
      where: { windowStart: { lt: cutoff } },
    });
    return count;
  }

  /** Returns a filtered, paged view ordered by most recent activity. */
  async findWithFilters(
    filters: AuthAttemptTelemetryFilters,
    pagination: PaginationOptions,
  ): Promise<PagedResult<AuthAttemptTelemetry>> {
    const where: Prisma.AuthAttemptTelemetryWhereInput = {};
    if (filters.eventType) where.eventType = filters.eventType;
    if (filters.identifier) where.identifier = filters.identifier;
    if (filters.ipAddress) where.ipAddress = filters.ipAddress;
    const windowRange = dateRangeFilter(filters.fromDate, filters.toDate);
    if (windowRange) where.windowStart = windowRange;

    const skip = paginationSkip(pagination.page, pagination.limit);
    const [total, records] = await this.prisma.$transaction([
      this.prisma.authAttemptTelemetry.count({ where }),
      this.prisma.authAttemptTelemetry.findMany({
        where,
        orderBy: { lastAttemptAt: 'desc' },
        skip,
        take: pagination.limit,
      }),
    ]);

    return {
      items: records.map(toDomain),
      total,
      page: pagination.page,
      limit: pagination.limit,
    };
  }

  /** Returns all telemetry buckets. */
  async findAll(): Promise<AuthAttemptTelemetry[]> {
    const records = await this.prisma.authAttemptTelemetry.findMany();
    return records.map(toDomain);
  }
}

type AuthAttemptTelemetryRecord = {
  id: string;
  eventType: string;
  identifier: string;
  ipAddress: string;
  userAgent: string | null;
  windowStart: Date;
  attemptCount: number;
  firstAttemptAt: Date;
  lastAttemptAt: Date;
};

/** Narrows the stored eventType string to the domain union, rejecting unknown values. */
function toEventType(value: string): AuthAttemptEventType {
  if (value === AUTH_ATTEMPT_FAILED_SIGN_IN || value === AUTH_ATTEMPT_PASSWORD_RESET_REQUEST) {
    return value;
  }
  throw new Error(`Unknown auth-attempt eventType: ${value}`);
}

function toDomain(record: AuthAttemptTelemetryRecord): AuthAttemptTelemetry {
  return new AuthAttemptTelemetry(
    AuthAttemptTelemetryId.create(record.id),
    toEventType(record.eventType),
    record.identifier,
    record.ipAddress,
    record.userAgent,
    record.windowStart,
    record.attemptCount,
    record.firstAttemptAt,
    record.lastAttemptAt,
  );
}
