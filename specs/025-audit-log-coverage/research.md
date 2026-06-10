# Phase 0 Research & Design Decisions: Audit Log Coverage Review

This document resolves the open design questions for closing the audit-coverage gaps. Each decision records what was chosen, why, and what was rejected. No `NEEDS CLARIFICATION` markers remain.

---

## D1 — Failed sign-ins: separate telemetry store vs. reuse `AuditLog`

**Decision**: Store failed sign-ins in a **new `FailedSignInAttempt` table**, not as `AuditLog` rows.

**Rationale**:
- The existing `AuditLog` domain entity has a **non-nullable `userId`** (`packages/domain/src/entities/audit-log.ts`), and `toDomainAuditLog` returns `null` when `userId` is missing. Failed attempts frequently have no resolvable user (account doesn't exist) — a poor fit.
- Coalescing (FR-025), account-existence neutrality (FR-028), and bounded retention with scheduled purge (FR-030) are structurally different from the indefinite, one-row-per-event governance model.
- Mixing high-volume, attacker-driven telemetry into the governance table would slow the admin review queries and bloat its indexes (the composite `timestamp,userId,action` index).

**Alternatives rejected**:
- *Reuse `AuditLog` with a nullable actor*: forces an entity change, breaks coalescing, and pollutes governance review.
- *Write to application logs only (no DB)*: spec requires queryable, retention-bounded records and SC-008 verification; pure stdout logging isn't queryable.

---

## D2 — Coalescing strategy (FR-025: bounded volume)

**Decision**: One row per **(identifier, ipAddress, timeWindow)** bucket. Each failed attempt performs an UPSERT: insert a new bucket or increment `attemptCount` and update `lastAttemptAt` on the existing bucket. `timeWindow` is a fixed tumbling window (default **1 hour**, configurable).

**Fields**: `id`, `identifier` (validated email, see D4), `ipAddress` (nullable), `userAgent` (nullable), `windowStart`, `attemptCount`, `firstAttemptAt`, `lastAttemptAt`.

**Rationale**: Bounds row count to distinct (account, origin, hour) combinations regardless of attempt volume — a distributed spray writes one row per (target, source) per hour instead of one per attempt. Brute-force / spray patterns remain fully reconstructable (FR-026) by querying buckets with high `attemptCount` or many distinct identifiers per `ipAddress`.

**Uniqueness**: a unique constraint on `(identifier, ipAddress, windowStart)` makes the UPSERT atomic (Prisma `upsert`). `ipAddress` is stored **NOT NULL** — a missing origin is recorded as the sentinel `"unknown"` rather than SQL `NULL`. This is required, not optional: PostgreSQL treats `NULL`s as distinct in a unique key, so a nullable `ipAddress` would prevent no-IP attempts from coalescing and reopen the unbounded-growth problem on the attacker-controlled path. The sentinel keeps the coalescing key total so INV-1 holds even when the IP is unknown.

**Alternatives rejected**:
- *One row per attempt*: unbounded growth, the exact problem the spec calls out.
- *Sliding-window counters in memory/Redis*: adds infrastructure (no Redis in stack) and loses durable forensic detail; a DB tumbling window is sufficient and queryable.

---

## D3 — Where failed-sign-in recording happens (FR-027: off the critical path)

**Decision**: The **login route** invokes a dedicated `RecordFailedSignInUseCase` on the credential-failure (401) branch, **best-effort and off the response path**: the failure response (after the `LoginUseCase`'s constant-time `LOGIN_DELAY_MS` delay) is sent **without awaiting** the telemetry write; the write is dispatched fire-and-forget (e.g. not awaited before `reply`, or scheduled post-response) and its `try/catch` failures are logged via `request.log.warn`. It never alters the auth response *or its timing*. Coalescing logic lives entirely in the use case + repository (no business logic in the route).

**Rationale**:
- Route-level rate limiting (`config.rateLimit` in `apps/api/src/routes/login.ts`) runs in a Fastify preHandler **before** the handler, so abusive requests are rejected before any telemetry write — the recording cannot be forced first, satisfying FR-027.
- **Timing-attack preservation (FR-033)**: the UPSERT has variable latency (INSERT vs UPDATE, DB load). Awaiting it inside the response would add that jitter *on top of* the constant-time `LOGIN_DELAY_MS` envelope, partially re-opening a timing side-channel on the failure path. Dispatching it off the response path keeps the failure-response time governed solely by the constant-time delay — independent of account existence and of the write's outcome.
- Best-effort semantics keep the auth path resilient: a telemetry DB hiccup must not turn a normal failed login into a 500 or block the constant-time delay defence.
- Keeping the coalescing/upsert in a use case (not the route) honours the Architecture Constitution ("no business logic in route handlers").

**Note on `LoginUseCase`**: it stays focused on authentication and returns its existing `Result`. The route already distinguishes success/failure from that `Result`; it adds the success-audit and failure-telemetry calls around it.

**Alternatives rejected**:
- *Record inside `LoginUseCase`*: couples authentication with telemetry side-effects and complicates best-effort error isolation (domain has no logger port to surface a swallowed failure).
- *Awaited UPSERT inside the response*: simpler to test but adds variable latency to the 401 response on top of the constant-time delay — rejected as a timing-side-channel regression (FR-033). Chosen instead: fire-and-forget, with test determinism handled by exposing the dispatched promise (or an injected "after-response" hook) so tests can await it without it being on the production response path.

---

## D4 — Identifier safety & account-existence neutrality (FR-028, FR-029)

**Decision**:
- Record a failed attempt for **every** credential failure, with **identical shape** whether or not the account exists (FR-028). The login flow already applies a constant-time delay (`LOGIN_DELAY_MS`) and a generic 401, so recording uniformly does not create a new enumeration oracle.
- Store the **normalized, already-validated email** as `identifier`. The login route validates the email at the boundary (`Email.create` / Fastify schema) **before** the use case runs, so a password mistakenly typed into a non-email-shaped field is rejected pre-recording and never stored (FR-029). The submitted password is never passed to the recorder.

**Rationale**: Storing the validated email keeps records human-readable for investigation (operators can see which account was targeted) while the boundary validation removes the realistic "password in the identifier field" leak. The identifier is PII of a possibly-non-user, which is precisely why retention is bounded (D6).

**Alternatives rejected**:
- *Hash the identifier*: maximises privacy but destroys investigative readability (an admin can't tell which account was sprayed); rejected given records are already retention-bounded and admin-only. (Left as a future hardening option if a privacy review demands it.)
- *Only record when the account exists*: creates an enumeration oracle and misses spray detection against non-existent accounts.

---

## D5 — Request origin context (FR-017): IP + user-agent threading

**Decision**: Introduce a shared `RequestContext` DTO `{ ipAddress?: string; userAgent?: string }` in `packages/shared`. A small helper in `apps/api/src/lib/request-context.ts` builds it from `request.ip` and `request.headers['user-agent']`. Audited use cases accept an **optional** `RequestContext` and fold it into the `AuditLog.metadata` (e.g. `metadata.origin = { ipAddress, userAgent }`).

**Rationale**: Reuses the existing `metadata` JSON field — no `AuditLog` schema change. Optionality (FR-017 "where available") lets background/system contexts omit it. `request.ip` already honours the configured proxy/`X-Forwarded-For` handling at the Fastify level.

**Alternatives rejected**:
- *Add dedicated `ipAddress`/`userAgent` columns to `AuditLog`*: schema migration + reduces flexibility; metadata is the existing extension point and is already surfaced by the admin API.
- *Capture context in a Fastify hook into async-local storage*: more machinery than threading an explicit optional DTO; explicit is clearer and testable.

---

## D6 — Retention & scheduled purge (FR-030)

**Decision**:
- A `PurgeFailedSignInAttemptsUseCase` takes `now: Date` and a `retentionWindow` (default **90 days**) and deletes buckets whose `windowStart` (equivalently `lastAttemptAt`) is older than `now - retentionWindow`, returning the count deleted. The repository exposes `deleteOlderThan(cutoff: Date): Promise<number>`.
- An **in-process scheduled task** (`apps/api/src/plugins/failed-sign-in-purge.ts`) runs the purge use case on a configurable interval (default **daily**) and logs the purged count (observable, FR-030). Configuration: `failedSignIn.retentionDays`, `failedSignIn.coalesceWindowMinutes`, `failedSignIn.purgeIntervalHours`.

**Rationale**: Passing `now` in keeps the purge use case deterministic and unit-testable with in-memory fakes (no Clock port, consistent with the codebase's existing "pass values in" convention). An in-process task is the lowest-ops choice for a not-yet-released modular monolith and needs no external scheduler.

**Multi-instance caveat (documented)**: if the API is ever scaled horizontally, concurrent purge runs are harmless (idempotent delete) but redundant. The chosen approach is acceptable; at scale this can be swapped for an external cron invoking a CLI/admin endpoint, or guarded by an advisory lock. Recorded so it isn't a silent assumption.

**Alternatives rejected**:
- *Postgres TTL / partition drop*: Prisma has no native TTL; partitioning is over-engineering for current scale.
- *Purge lazily on read*: violates FR-030's "actual scheduled deletion" and leaves rows indefinitely if never read.

---

## D7 — Governance auth/file events: reuse existing `AuditLog` path

**Decision**: All newly-covered governance events use the existing `AuditLog` entity + `AuditLogRepository.save` pattern (inject `auditLogRepo`, construct `new AuditLog(AuditLogId.create(randomUUID()), actorId, projectId|null, action, resourceType, resourceId, timestamp, metadata)`), exactly mirroring `create-project.ts` / `delete-file.ts`.

Action strings (named in `audit-actions.ts`):

| Event | action | resourceType | actor | projectId | metadata |
|-------|--------|--------------|-------|-----------|----------|
| Successful sign-in | `auth.signed_in` | `User` | the user | null | `origin` |
| Sign-out | `auth.signed_out` | `User` | the user | null | `origin` |
| Registration | `auth.registered` | `User` | the new user | null | `origin` |
| Password changed | `auth.password_changed` | `User` | the user | null | `origin` |
| Password reset completed | `auth.password_reset` | `User` | the user | null | `origin` |
| Email changed | `auth.email_changed` | `User` | the user | null | `{ previousEmail, newEmail, origin }` |
| File created | `file.created` | `FileNode` | actor | project | `{ path, origin }` |
| Folder created | `folder.created` | `FileNode` | actor | project | `{ path, origin }` |
| File/asset uploaded | `file.uploaded` | `FileNode` | actor | project | `{ path, sizeBytes, origin }` |
| File/folder moved | `file.moved` | `FileNode` | actor | project | `{ from, to, origin }` |
| File/folder renamed | `file.renamed` | `FileNode` | actor | project | `{ previousName, newName, origin }` |

**Rationale**: Every governance event has a known actor, so the non-nullable `userId` is correct. `auth.*` events are user-scoped/global (`projectId = null`), consistent with existing `user.*`/`auth.email_verified` rows. The `previousEmail` for `auth.email_changed` is read before the update is applied (the use case already loads the user).

**Failure handling (FR-021) — auth events are best-effort**: The spec's intent is "the action is allowed to stand; the audit-write failure is surfaced, not blocking." For the **auth** events this matters acutely: `LoginUseCase` returns its success `Result` and the route sets the session only afterwards, so an awaited-and-propagated audit failure would *block a legitimate login*; likewise a password change persists before its audit write, so a propagated failure would misreport success as failure. Therefore the auth-event audit writes (`auth.signed_in`, `auth.password_changed`, `auth.password_reset`, `auth.email_changed`, `auth.registered`, `auth.signed_out`) are **best-effort and route-orchestrated**: the auth use case performs the action and returns its `Result`; the **route** then — after the action has taken effect (session set / password persisted) — invokes a shared `RecordAuditEventUseCase(auditLogRepo)` inside `try/catch`, logging any failure via `request.log.warn`. This places the swallow-and-log at the only layer that has the request logger (the domain has no logger port, and we deliberately do not introduce one), keeps the auth use cases pure, and mirrors the failed-sign-in best-effort placement (D3). Resource-mutation governance events outside auth keep the existing await pattern (unchanged behaviour); converting them to best-effort is out of scope.

---

## D8 — Determinism: no new Clock/Id ports

**Decision**: Continue the codebase convention — generate ids with `crypto.randomUUID()` and timestamps with `new Date()` inside use cases/entities; for the **two time-sensitive** use cases (coalescing record, purge) pass `now: Date` in as a parameter so their behaviour is deterministic under test.

**Rationale**: Avoids introducing Clock/Id port abstractions that the project has deliberately not adopted, while still giving TDD-testable time behaviour where it matters. `crypto`/`Date` are the already-accepted domain exceptions (used throughout existing use cases).

---

## D9 — Coverage inventory deliverable (FR-024)

**Decision**: Produce `contracts/audit-action-inventory.md` enumerating every consequential action surface with a status of **Audited today / Gap (to add) / Intentionally not audited (rationale)**. This is a tracked artifact of the feature, kept in the spec folder and referenced from the admin docs.

**Rationale**: FR-024 requires the coverage decision to be explicit and reviewable; a living inventory is the deliverable and doubles as the test checklist for SC-001/SC-006.

---

## D10 — Admin read surface for failed-sign-in telemetry (FR-032)

**Decision**: Add a paged, filtered read path for `FailedSignInAttempt` so the telemetry is reviewable, not write-only. The port gains `findWithFilters(filters, pagination)` (filter by identifier, ipAddress, time range); a `ListFailedSignInAttemptsUseCase` (admin-authorized) wraps it; an admin route `GET /admin/failed-sign-ins` exposes it via a dedicated DTO, mirroring the existing `/admin/audit-logs` review conventions (auth + `requireAdmin` + rate limit + pagination).

**Rationale**: FR-026 requires brute-force/credential-stuffing patterns to "remain reconstructable," and FR-022 makes audit data admin-queryable. Capture + purge without a read surface would satisfy the letter (records exist) but not the intent (an admin can actually see attack patterns). Kept as a **separate** endpoint/DTO from governance audit logs so the two stores stay cleanly distinguished (FR-026).

**Alternatives rejected**:
- *Expose via the existing `/admin/audit-logs`*: would merge the two stores, defeating FR-026's separation and the bounded-retention distinction.
- *No read surface (rely on direct DB access)*: leaves the data effectively write-only for operators; not reconstructable through the product.

---

## D11 — Authorization-denial logging (FR-031) via a shared best-effort recorder

**Decision**: Log authorization denials by recording an `authz.denied` governance `AuditLog` entry via the shared `RecordAuditEventUseCase` (the same recorder as the auth events, D7), invoked at the **route boundary**. Rollout is **incremental** (file-tree boundary first, then project/membership/admin), but **all boundaries are delivered within this feature**, sequenced per `architecture-migration-plan.md`. Recording is **best-effort** — a denial-record write failure never changes the `Result.err(Forbidden)` returned to the caller.

**Rationale**: The Security Constitution makes this a MUST ("authorization denials MUST be logged with actor, resource, and reason"). Reusing `AuditLog` with a dedicated action means no schema change and immediate admin-review filterability. A single shared recorder keeps the denial record shape uniform and reduces each deny path to one call. Incremental rollout honours the Architecture Constitution's "prefer incremental, module-by-module migration".

**Placement note**: like the auth events (D7), recording happens at the **route boundary**, not inside the use case — the domain has no logger for best-effort surfacing. The permission check stays in the use case (per the Security Constitution) and returns a typed `ForbiddenError` carrying `resourceType`, `resourceId`, and `reason`; the route, on receiving that error, best-effort records `authz.denied` (adding `actor` + `origin`) and logs any failure via `request.log.warn`, so it cannot convert a clean 403 into a 500.

**Alternatives rejected**:
- *Bespoke logging block per use case*: drifts in shape and is error-prone; a shared recorder is uniform.
- *A new dedicated denial table*: unnecessary — denials are low-volume governance events that fit `AuditLog`.

---

## D12 — Purge use-case location (structural consistency)

**Decision**: Place the purge and the failed-sign-in read use cases under `packages/domain/src/use-cases/settings/`, alongside the existing admin/maintenance use cases (`set-admin-status.ts`, `admin-max-upload-size.ts`, `get-open-registration.ts`), rather than introducing a new `use-cases/admin/` subfolder.

**Rationale**: The Architecture Constitution enumerates the domain use-case subfolders as `{auth, project, file-tree, content, settings, members}`; admin-scoped operations already live in `settings/`. Reusing it keeps the structure self-describing without an undocumented new grouping (or a constitution amendment, which requires separate approval).
