---
description: "Task list for Audit Log Coverage Review"
---

# Tasks: Audit Log Coverage Review

**Input**: Design documents from `/specs/025-audit-log-coverage/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, architecture-migration-plan.md

**Tests**: INCLUDED — the Governance Constitution mandates TDD (Red→Green→Refactor, NON-NEGOTIABLE). Every entity, value object, port fake, use case, Prisma repo, and route gets a failing test first.

**Organization**: Tasks are grouped by user story (US1=P1 account/auth, US2=P2 file/folder, US3=P3 record context), then a cross-cutting authorization-denial phase (FR-031), then polish.

## Path Conventions

Tests live under each package's `tests/` root mirroring `src/` (no `__tests__/`, no co-location). Domain use cases under `packages/domain/src/use-cases/{auth,file-tree,content,project,members,settings}/`; ports under `…/ports/admin/`; infra under `packages/infrastructure/src/persistence/admin/`. (Admin/maintenance use cases live in `settings/` per the established convention — research D12.)

---

## Phase 1: Setup (Shared configuration)

- [X] T001 Add a `failedSignIn` config block to `apps/api/src/config/schema.ts` with defaults `retentionDays=90`, `coalesceWindowMinutes=60`, `purgeIntervalHours=24`, plus env var wiring and the typed config accessor.

---

## Phase 2: Foundational (Blocking prerequisites for ALL stories)

**⚠️ CRITICAL**: Complete before starting any user story.

- [X] T002 [P] Create named audit-action constants in `packages/domain/src/audit-actions.ts` for all new/affected actions (`auth.signed_in`, `auth.signed_out`, `auth.registered`, `auth.password_changed`, `auth.password_reset`, `auth.email_changed`, `file.created`, `folder.created`, `file.uploaded`, `file.moved`, `file.renamed`, `authz.denied`) and export from the domain index.
- [X] T003 [P] Create the `RequestContext` DTO `{ ipAddress?: string; userAgent?: string }` in `packages/domain/src/types/request-context.ts` and export it — placed in domain (not shared) because domain consumes it and must not depend on outer layers.
- [X] T004 [P] Create the `requestContextFrom(request)` helper in `apps/api/src/lib/request-context.ts` (maps `request.ip`, `request.headers['user-agent']`), with a unit test at `apps/api/tests/lib/request-context.test.ts`.
- [X] T005 Write a failing test at `packages/domain/tests/use-cases/auth/record-audit-event.test.ts`, then implement the shared `RecordAuditEventUseCase` at `packages/domain/src/use-cases/auth/record-audit-event.ts` — `execute({ action, actorId, projectId?, resourceType, resourceId, metadata?, context?, now })` builds an `AuditLog` and saves it via `auditLogRepo`. (Reused by all best-effort governance recording: auth events + authorization denials. Best-effort isolation is the caller's responsibility — see T020.)

**Checkpoint**: Constants, DTO, helper, and shared recorder available — user stories can begin.

---

## Phase 3: User Story 1 — Complete account & authentication audit trail (Priority: P1) 🎯 MVP

**Goal**: Every account-security event produces a record; failed sign-ins go to a separate, coalesced, retention-bounded, admin-reviewable telemetry store. Auth-event audit writes are best-effort (never block the user action).

**Independent Test**: Perform each account/auth action; confirm governance records for successes and a single coalescing `FailedSignInAttempt` row for repeated failures (identical shape for non-existent accounts, no secrets), reviewable via the admin read surface.

### 1a. Failed-sign-in telemetry vertical

- [X] T006 [P] [US1] Test then implement `FailedSignInAttemptId` value object — `packages/domain/tests/value-objects/failed-sign-in-attempt-id.test.ts` → `packages/domain/src/value-objects/failed-sign-in-attempt-id.ts`.
- [X] T007 [P] [US1] Test then implement the `FailedSignInAttempt` entity (`ipAddress` is a required string; `attemptCount ≥ 1`) — `packages/domain/tests/entities/failed-sign-in-attempt.test.ts` → `packages/domain/src/entities/failed-sign-in-attempt.ts`.
- [X] T008 [US1] Define the `FailedSignInAttemptRepository` port (`record`, `deleteOlderThan`, `findWithFilters`, `findAll`) in `packages/domain/src/ports/admin/failed-sign-in-attempt.repository.ts` per `contracts/failed-sign-in-telemetry.md`; export from domain index.
- [X] T009 [US1] Write failing behaviour test at `packages/domain/tests/ports/admin/in-memory-failed-sign-in-attempt.repository.test.ts` covering INV-1 (coalescing UPSERT) **including the `"unknown"`-IP sentinel case**, INV-4 (retention delete), and `findWithFilters`; then implement the in-memory fake `packages/domain/tests/ports/admin/in-memory-failed-sign-in-attempt.repository.ts`.
- [X] T010 [US1] Add the `FailedSignInAttempt` model to `packages/db/prisma/schema.prisma` per data-model.md — **`ipAddress String` (NOT NULL)**, `@@unique([identifier, ipAddress, windowStart])`, indexes on `windowStart`, `identifier`, `(ipAddress, windowStart)`.
- [X] T011 [US1] ⚠️ STOP — per the Database Migration Policy, ASK THE USER to confirm before generating/applying any Prisma migration for the `FailedSignInAttempt` model. Do not run any `prisma migrate` command without explicit confirmation. After confirmation, generate the migration and regenerate the Prisma client.
- [X] T012 [US1] Write failing testcontainers test at `packages/infrastructure/tests/persistence/admin/prisma-failed-sign-in-attempt.repository.test.ts` (coalescing upsert against real PostgreSQL **including unknown-IP coalescing**, `deleteOlderThan` count, `findWithFilters`); then implement `PrismaFailedSignInAttemptRepository` at `packages/infrastructure/src/persistence/admin/prisma-failed-sign-in-attempt.repository.ts` (store `"unknown"` for absent IP) and export it.
- [X] T013 [US1] Wire the `failedSignInAttempt` repository into the API repos registry (`apps/api/src/plugins/repos.*`) so it is reachable via `request.server.repos`.

### 1b. Telemetry use cases (record, purge, admin read)

- [X] T014 [P] [US1] Test then implement `RecordFailedSignInUseCase` at `packages/domain/src/use-cases/auth/record-failed-sign-in.ts` (`execute({ identifier, context, now })`; computes `windowStart`; passes `"unknown"` when no IP) — `packages/domain/tests/use-cases/auth/record-failed-sign-in.test.ts` covering INV-1 (incl. unknown IP), INV-2 (neutrality), INV-3 (no secret arg).
- [X] T015 [P] [US1] Test then implement `PurgeFailedSignInAttemptsUseCase` at `packages/domain/src/use-cases/admin/purge-failed-sign-ins.ts` (`execute({ now, retentionWindowMs })`) — `packages/domain/tests/use-cases/admin/purge-failed-sign-ins.test.ts` covering INV-4.
- [X] T016 [US1] Test then implement the scheduled purge plugin `apps/api/src/plugins/failed-sign-in-purge.ts` (interval/retention from config, passes `now`, logs deleted count — FR-030 observability) and register it in `apps/api/src/index.ts` — `apps/api/tests/plugins/failed-sign-in-purge.test.ts`.
- [X] T017 [P] [US1] Test then implement `ListFailedSignInAttemptsUseCase` at `packages/domain/src/use-cases/admin/list-failed-sign-ins.ts` (admin-authorized; paged + filtered by identifier/ip/time) — `packages/domain/tests/use-cases/admin/list-failed-sign-ins.test.ts`.
- [X] T018 [US1] Implement the admin read endpoint `GET /admin/failed-sign-ins` (FR-032) at `apps/api/src/routes/admin/failed-sign-ins.ts` (`requireAuth` + `requireAdmin` + rate limit, dedicated DTO, **separate** from `/admin/audit-logs`) with an inject test at `apps/api/tests/routes/admin/failed-sign-ins.test.ts`.

### 1c. Auth governance events (best-effort, route-orchestrated)

- [X] T019 [US1] Update `apps/api/tests/routes/login.test.ts` (success → best-effort `auth.signed_in` with `origin` after the session is set; wrong password → coalesced `FailedSignInAttempt` and unchanged 401; identical shape for non-existent accounts; INV-5 best-effort on telemetry/audit error; **FR-033 timing — the 401 response time is independent of account existence and unchanged whether the telemetry write succeeds, fails, or is slow**), then update `apps/api/src/routes/login.ts`: build `RequestContext`; on success call `RecordAuditEventUseCase(auth.signed_in)` best-effort; on 401 dispatch `RecordFailedSignInUseCase` **fire-and-forget off the response path** (not awaited before `reply`; `try/catch` → `request.log.warn`), preserving the `LoginUseCase` `LOGIN_DELAY_MS` constant-time envelope. Expose the dispatched promise/after-response hook so the test can await it deterministically. (`LoginUseCase` itself is unchanged.)
- [X] T020 [P] [US1] Update `apps/api/tests/routes/logout.test.ts` (best-effort `auth.signed_out` before session destroy, failure logged not thrown), then update `apps/api/src/routes/logout.ts` to call `RecordAuditEventUseCase(auth.signed_out)` with actor + `RequestContext` best-effort.
- [X] T021 [P] [US1] Update the change-password route test (best-effort `auth.password_changed` after success; no password values in record), then update `apps/api/src/routes/auth/*` change-password route to record best-effort after `ChangePasswordUseCase` succeeds. (Use case unchanged.)
- [X] T022 [P] [US1] Update the reset-password route test (best-effort `auth.password_reset` for the resolved user after success), then update the reset route to record best-effort after `ResetPasswordUseCase` succeeds.
- [X] T023 [US1] Update `packages/domain/tests/use-cases/auth/confirm-email-change.test.ts` (result now also returns `previousEmail`), update `ConfirmEmailChangeUseCase` at `packages/domain/src/use-cases/auth/confirm-email-change.ts` to read + return the previous email; then update the confirm route (+ test) to record best-effort `auth.email_changed` with `metadata.previousEmail`/`newEmail`.
- [X] T024 [P] [US1] Update the register route test (best-effort `auth.registered`, actor = new user after success), then update the register route to record best-effort after `RegisterUserUseCase` succeeds.

**Checkpoint**: All account/auth events recorded best-effort; failed sign-ins coalesced, purgeable, and admin-reviewable. US1 independently testable (SC-005, SC-008, INV-1..5, FR-032).

---

## Phase 4: User Story 2 — Complete file & folder lifecycle audit trail (Priority: P2)

**Goal**: File/folder create, upload, and move become auditable; rename gains before/after metadata. (Resource-mutation events keep the existing in-use-case await pattern.)

**Independent Test**: Create a file and folder, upload an asset, rename and move items; confirm one record per action with the expected metadata.

- [X] T025 [P] [US2] Test then update `CreateFileUseCase` (`packages/domain/src/use-cases/file-tree/create-file.ts`) to inject `auditLogRepo` + optional `context` and emit `file.created` (`metadata.path`) — `packages/domain/tests/use-cases/file-tree/create-file.test.ts`.
- [X] T026 [P] [US2] Test then update `CreateFolderUseCase` (`…/file-tree/create-folder.ts`) to emit `folder.created` (`metadata.path`).
- [X] T027 [P] [US2] Test then update `MoveFileUseCase` (`…/file-tree/move-file.ts`) to inject `auditLogRepo` and emit `file.moved` (`metadata.from`/`to`).
- [X] T028 [P] [US2] Test then enrich `RenameFileUseCase` (`…/file-tree/rename-file.ts`) so `file.renamed` carries `metadata.previousName`/`newName`.
- [X] T029 [P] [US2] Test then update `UploadAssetUseCase` (`…/content/upload-asset.ts`) to inject `auditLogRepo` and emit `file.uploaded` (`metadata.path`/`sizeBytes`).
- [X] T030 [US2] Wire `RequestContext` and (newly required) `auditLogRepo` into `apps/api/src/routes/projects/file-tree-create.ts`, `file-tree-patch.ts` (move/rename), and `assets.ts`, updating their inject tests under `apps/api/tests/routes/projects/`.

**Checkpoint**: File/folder lifecycle fully covered (US2 independently testable).

---

## Phase 5: User Story 3 — Sufficient context on every audit record (Priority: P3)

**Goal**: Change events carry before/after values; request origin is present on audited records end-to-end.

**Independent Test**: Change a member role and update project details; confirm before/after values and `metadata.origin` on the records.

- [X] T031 [P] [US3] Test then enrich `ChangeMemberRoleUseCase` (`…/members/change-member-role.ts`) so `member.roleChanged` carries `metadata.previousRole`/`newRole`.
- [X] T032 [P] [US3] Test then enrich `UpdateProjectUseCase` (`…/project/update-project.ts`) so `project.updated` lists changed fields with previous/new values.
- [X] T033 [US3] Thread `RequestContext` into the member-role and project-update routes (and any audited route not covered in US1/US2), asserting `metadata.origin` in their inject tests.
- [X] T034 [US3] Add an end-to-end verification test (`apps/api/tests/routes/audit-origin.test.ts`) confirming a representative audited action records `metadata.origin.ipAddress`/`userAgent` (FR-017) and that change events expose before/after values (SC-004).

**Checkpoint**: All three stories complete.

---

## Phase 6: Authorization-denial logging (FR-031, P0 — Constitution MUST)

**Goal**: Permission-denied attempts on consequential actions produce an `authz.denied` record (actor, resource, reason, origin), recorded best-effort at the route boundary via the shared `RecordAuditEventUseCase`. Sequenced incrementally per `architecture-migration-plan.md` but delivered for **all** boundaries in this feature (T036 file-tree, T037 the rest).

- [X] T035 Test then enrich the domain authorization error type (e.g. `ForbiddenError`) to carry `resourceType`, `resourceId`, and `reason` — `packages/domain/tests/...` → `packages/domain/src/...`. (The permission check itself stays in the use case per the Security Constitution.)
- [X] T036 In the file-tree routes (delete/move/create), best-effort record `authz.denied` via `RecordAuditEventUseCase` when the use case returns a `ForbiddenError` — attaching actor + resource + reason + `origin`, logging failures via `request.log.warn`, never converting a 403 into a 500. Add route inject tests asserting the denial record. (Migration-plan Phase 1; the remaining boundaries are completed in T037.)
- [X] T037 Apply the same denial-recording pattern to the remaining boundaries — project, membership, and admin/settings routes — recording `authz.denied` best-effort via `RecordAuditEventUseCase` on `ForbiddenError`, with a route inject test per boundary. (Migration-plan Phase 2; in-scope for this feature, fully closing the Constitution MUST across all authorization boundaries.)

**Checkpoint**: Authorization denials recorded across all boundaries (file-tree via T036, project/membership/admin via T037) — the Constitution MUST is fully satisfied in-feature with a reusable, tested pattern.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T038 [P] Write a test then verify SC-007 — a governance `AuditLog` record remains retrievable after its referenced actor/project is deleted (`onDelete: SetNull`): `packages/infrastructure/tests/persistence/admin/prisma-audit-log.repository.test.ts` (or a route inject test) asserting the record survives and `userId` becomes null.
- [X] T039 [P] Write a burst test for SC-008 at `packages/infrastructure/tests/persistence/admin/failed-sign-in-burst.test.ts` — simulate many failures across identifiers/IPs (incl. unknown IP) within a window and assert stored rows grow sub-linearly (coalesced) and that rows older than the retention window are absent after a purge cycle. Note the auth-path latency clause of SC-008 is verified manually in T043 (no automated load harness in scope).
- [X] T040 [P] Add display labels for all new action strings (`auth.*`, `file.*`, `folder.*`, `authz.denied`) to `apps/web/src/app/(dashboard)/dashboard/admin/audit-log/audit-log-format.ts` so the admin review UI renders them (and origin/before-after metadata) legibly.
- [ ] T041 [P] (Optional UI) Add an admin web view for the failed-sign-in telemetry consuming `GET /admin/failed-sign-ins` (FR-032), if a UI surface is desired beyond the API.
- [X] T042 [P] Finalize `contracts/audit-action-inventory.md` against the implemented code — every action categorised with no blanks (FR-024 / SC-006).
- [X] T043 Run the `quickstart.md` manual verification end-to-end (SC-001/002/003/004/005/007/008 auth-path latency).
- [X] T044 Run the full quality gates: `pnpm lint`, `pnpm typecheck`, `pnpm test` across `packages/domain`, `packages/infrastructure`, `apps/api` (and `apps/web` if T040/T041 touched it); zero warnings/errors, all tests green before committing.

---

## Dependencies & Execution Order

- **Setup (T001)** → **Foundational (T002–T005)** before any story. T005 (shared recorder) depends on nothing new and unblocks T019–T024 and T036.
- **US1 (T006–T024)**: 1a order `T006,T007 → T008 → T009`; `T010 → T011 (gate) → T012 → T013`. 1b `T014/T015/T017` depend on the port (T008) + fake (T009); `T016` depends on T015; `T018` depends on T017. 1c `T019–T024` depend on T005 + T002/T003/T004 and (for T019) T014; T020–T022/T024 are mutually parallel (different routes).
- **US2 (T025–T030)**: T025–T029 parallel; T030 depends on them.
- **US3 (T031–T034)**: T031/T032 parallel; T033 then T034.
- **Phase 6 (T035–T037)**: depends on T005 (recorder) + T002 (`authz.denied`). T035 → T036 → T037. Independent of US2/US3.
- **Polish (T038–T044)**: after the phases they document; T038/T039 verify SC-007/SC-008; T044 is the final gate.
- **Story independence**: US1, US2, US3, and the authz-denial phase each deliver standalone value and can be implemented/tested in isolation once Foundational is done.

## Parallel Execution Examples

- **Foundational**: T002, T003, T004 together (separate files); then T005.
- **US1**: after T008/T009, run T014, T015, T017 in parallel; T020, T021, T022, T024 in parallel.
- **US2**: T025–T029 all in parallel, then T030.
- **US3**: T031 and T032 in parallel, then T033, then T034.

## Implementation Strategy

- **MVP = User Story 1** (P1): account/auth trail + failed-sign-in telemetry (capture, purge, admin read) — the highest-security, currently-0%-covered slice.
- **Increment 2 = User Story 2** (P2): file/folder lifecycle holes.
- **Increment 3 = User Story 3** (P3): origin + before/after context on every record.
- **P0 = Phase 6** authorization-denial logging — a Constitution MUST; the file-tree boundary establishes the pattern (T035/T036) and T037 completes project/membership/admin, all within this feature.
- Honour TDD throughout (Red→Green→Refactor); commit only on green. The single hard gate is **T011** — do not generate the Prisma migration without explicit user confirmation.
