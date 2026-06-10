import { randomUUID } from 'crypto';
import { AuthAttemptTelemetry } from '../../../src/entities/auth-attempt-telemetry';
import { AuthAttemptTelemetryId } from '../../../src/value-objects/auth-attempt-telemetry-id';
import { PaginationOptions, PagedResult } from '../../../src/ports/admin/audit-log.repository';
import {
  AuthAttemptTelemetryRepository,
  AuthAttemptTelemetryFilters,
  RecordAuthAttemptInput,
} from '../../../src/ports/admin/auth-attempt-telemetry.repository';

/**
 * In-memory AuthAttemptTelemetryRepository for tests. Reproduces the real
 * coalescing semantics: one bucket per (identifier, ipAddress, windowStart),
 * incremented on repeat.
 */
export class InMemoryAuthAttemptTelemetryRepository implements AuthAttemptTelemetryRepository {
  private readonly storage = new Map<string, AuthAttemptTelemetry>();

  private key(eventType: string, identifier: string, ipAddress: string, windowStart: Date): string {
    return `${eventType}|${identifier}|${ipAddress}|${windowStart.toISOString()}`;
  }

  /** Coalescing UPSERT keyed on (eventType, identifier, ipAddress, windowStart). */
  async record(input: RecordAuthAttemptInput): Promise<void> {
    const key = this.key(input.eventType, input.identifier, input.ipAddress, input.windowStart);
    const existing = this.storage.get(key);
    if (existing) {
      this.storage.set(
        key,
        new AuthAttemptTelemetry(
          existing.id,
          existing.eventType,
          existing.identifier,
          existing.ipAddress,
          existing.userAgent,
          existing.windowStart,
          existing.attemptCount + 1,
          existing.firstAttemptAt,
          input.now,
        ),
      );
      return;
    }
    this.storage.set(
      key,
      new AuthAttemptTelemetry(
        AuthAttemptTelemetryId.create(randomUUID()),
        input.eventType,
        input.identifier,
        input.ipAddress,
        input.userAgent,
        input.windowStart,
        1,
        input.now,
        input.now,
      ),
    );
  }

  /** Deletes buckets whose windowStart is strictly older than cutoff. */
  async deleteOlderThan(cutoff: Date): Promise<number> {
    let deleted = 0;
    for (const [key, attempt] of this.storage) {
      if (attempt.windowStart < cutoff) {
        this.storage.delete(key);
        deleted += 1;
      }
    }
    return deleted;
  }

  /** Returns a filtered, paged view sorted by most recent activity. */
  async findWithFilters(
    filters: AuthAttemptTelemetryFilters,
    pagination: PaginationOptions,
  ): Promise<PagedResult<AuthAttemptTelemetry>> {
    let items = [...this.storage.values()];

    if (filters.eventType) {
      items = items.filter((a) => a.eventType === filters.eventType);
    }
    if (filters.identifier) {
      items = items.filter((a) => a.identifier === filters.identifier);
    }
    if (filters.ipAddress) {
      items = items.filter((a) => a.ipAddress === filters.ipAddress);
    }
    if (filters.fromDate) {
      items = items.filter((a) => a.windowStart >= filters.fromDate!);
    }
    if (filters.toDate) {
      items = items.filter((a) => a.windowStart <= filters.toDate!);
    }

    items.sort((a, b) => b.lastAttemptAt.getTime() - a.lastAttemptAt.getTime());

    const total = items.length;
    const start = (pagination.page - 1) * pagination.limit;
    return {
      items: items.slice(start, start + pagination.limit),
      total,
      page: pagination.page,
      limit: pagination.limit,
    };
  }

  /** Returns all stored buckets. */
  async findAll(): Promise<AuthAttemptTelemetry[]> {
    return [...this.storage.values()];
  }
}
