# Contract: Failed Sign-In Telemetry (FR-025–FR-030, SC-008)

## Port — `FailedSignInAttemptRepository` (`packages/domain/src/ports/admin/`)

```ts
export interface RecordFailedSignInInput {
  readonly identifier: string;          // validated email (never a secret)
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
  readonly now: Date;                   // injected for determinism (research D8)
  readonly windowSizeMs: number;        // coalescing window (research D2)
}

export interface FailedSignInAttemptRepository {
  /**
   * Coalescing UPSERT: increments the matching (identifier, ipAddress, windowStart)
   * bucket or creates it. Atomic via the unique constraint.
   */
  record(input: RecordFailedSignInInput): Promise<void>;

  /** Deletes buckets older than `cutoff`. Returns the number deleted (observable purge). */
  deleteOlderThan(cutoff: Date): Promise<number>;

  /** Admin review (FR-032): paged + filtered by identifier, ipAddress, and time range. */
  findWithFilters(
    filters: { identifier?: string; ipAddress?: string; fromDate?: Date; toDate?: Date },
    pagination: { page: number; limit: number },
  ): Promise<{ items: FailedSignInAttempt[]; total: number; page: number; limit: number }>;

  /** Read access for tests/inspection. */
  findAll(): Promise<FailedSignInAttempt[]>;
}
```

> **Coalescing key (D2)**: `record` stores `ipAddress = "unknown"` when the origin is absent, never SQL `NULL`, so the `(identifier, ipAddress, windowStart)` unique key coalesces no-IP attempts (INV-1 holds for unknown IPs).

The in-memory fake (`packages/domain/tests/ports/admin/in-memory-failed-sign-in-attempt.repository.ts`) implements the same coalescing and `deleteOlderThan` semantics so use-case tests exercise real behaviour.

## Use case — `RecordFailedSignInUseCase`

- **Input**: `{ identifier: Email, context: RequestContext, now: Date }`.
- **Behaviour**: computes `windowStart = floor(now / windowSize)`, calls `repo.record(...)`. Returns `Result<void, DomainError>`.
- **Caller (login route)**: invoked on the 401 branch **best-effort and off the response path** — dispatched fire-and-forget (not awaited before `reply`), e.g. `void uc.execute(...).catch((e) => request.log.warn(...))` or an after-response hook. Never alters the auth response *or its timing* (FR-027, FR-033); tests await the exposed dispatch promise.
- **Account-existence neutral** (FR-028): called for every credential failure regardless of whether the user exists; identical record shape.

## Use case — `PurgeFailedSignInAttemptsUseCase`

- **Input**: `{ now: Date, retentionWindowMs: number }`.
- **Behaviour**: `cutoff = now - retentionWindow`; `const deleted = await repo.deleteOlderThan(cutoff)`; returns `Result<{ deleted: number }, DomainError>`.
- **Driver**: in-process scheduled task `apps/api/src/plugins/failed-sign-in-purge.ts` runs it on `failedSignIn.purgeIntervalHours` and logs `deleted` (FR-030 observability).

## Use case — `ListFailedSignInAttemptsUseCase` (FR-032, admin read)

- **Input**: `{ actorId: UserId, filters: { identifier?, ipAddress?, fromDate?, toDate? }, pagination: { page, limit } }`.
- **Behaviour**: authorizes the actor as admin, then returns `repo.findWithFilters(...)`. Returns `Result<PagedResult<FailedSignInAttempt>, DomainError>`.
- **Surface**: `GET /admin/failed-sign-ins` in `apps/api/src/routes/admin/failed-sign-ins.ts`, guarded by `requireAuth` + `requireAdmin` + rate limit, returning a dedicated DTO — **separate** from `/admin/audit-logs` so the two stores stay distinct (FR-026).

## Config additions (`apps/api/src/config/schema.ts`)

| Key | Default | Meaning |
|-----|---------|---------|
| `failedSignIn.retentionDays` | 90 | FR-030 retention window |
| `failedSignIn.coalesceWindowMinutes` | 60 | D2 tumbling window |
| `failedSignIn.purgeIntervalHours` | 24 | scheduled purge cadence |

## Invariants (test targets)

- **INV-1 (bounded volume, SC-008)**: N failures for the same (identifier, ip) within one window ⇒ exactly **1** row with `attemptCount = N`. Holds equally when the origin is unknown (sentinel `"unknown"`), so no-IP floods cannot defeat coalescing.
- **INV-2 (neutrality, FR-028)**: a failure for a non-existent account produces a row indistinguishable in shape from one for an existing account.
- **INV-3 (no secret, FR-029)**: the submitted password is never an argument to `record`; malformed (non-email) identifiers are rejected at the route boundary before recording.
- **INV-4 (retention, FR-030)**: after `deleteOlderThan(now - retention)`, no row with `windowStart < cutoff` remains; the purge returns the deleted count.
- **INV-5 (best-effort, FR-027)**: when `record` throws, the login response is unchanged (still 401) and the failure is logged.
- **INV-6 (constant-time, FR-033)**: the 401 response time is independent of account existence and unchanged whether the telemetry write is fast, slow, or fails — the write is off the response path and the `LOGIN_DELAY_MS` envelope is preserved.
