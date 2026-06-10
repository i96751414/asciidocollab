# Quickstart: Verifying Audit Log Coverage

How to confirm the feature works, mapped to the spec's success criteria. Assumes the dev stack is running (`pnpm dev` / API + PostgreSQL) and you can inspect the DB or the admin audit-log screen (`/dashboard/admin/audit-log`).

## Prerequisites

- Migrations applied (incl. the new `FailedSignInAttempt` table — **generated only after you confirm**, per the Database Migration Policy).
- An admin account (to view governance audit records) and a normal test account.

## 1. Account & authentication trail (User Story 1 / SC-005)

1. Sign in with valid credentials → expect a governance record `auth.signed_in` (actor = you, `metadata.origin` set).
2. Sign in with a **wrong password** a few times → expect **no** new `auth.*` governance rows, and a single coalescing `FailedSignInAttempt` row whose `attemptCount` increments (SC-008 / INV-1). Confirm the submitted password appears **nowhere** (INV-3 / SC-003).
3. Sign in with a wrong password for a **non-existent** email → expect a `FailedSignInAttempt` row identical in shape to step 2 (INV-2 / FR-028).
4. Sign out → `auth.signed_out`.
5. Change your password → `auth.password_changed` (no password values stored).
6. Complete a password reset → `auth.password_reset`.
7. Change + confirm your email → `auth.email_changed` with `metadata.previousEmail` / `metadata.newEmail`.
8. Register a new account → `auth.registered` (actor = the new user).

## 2. File & folder trail (User Story 2)

In a test project, perform each and confirm one record per action:

| Action | Expect |
|--------|--------|
| Create file | `file.created` (`metadata.path`) |
| Create folder | `folder.created` (`metadata.path`) |
| Upload an asset | `file.uploaded` (`metadata.path`, `sizeBytes`) |
| Move a file/folder | `file.moved` (`metadata.from`, `metadata.to`) |
| Rename a file/folder | `file.renamed` (`metadata.previousName`, `metadata.newName`) |
| Delete a file | `file.deleted` (existing) |

## 3. Record context & before/after (User Story 3 / SC-004)

1. Change a member's role → `member.roleChanged` with `metadata.previousRole` / `metadata.newRole`.
2. Update project details → `project.updated` listing changed fields with previous/new values.
3. Any audited action via the API → record carries `metadata.origin.ipAddress` / `userAgent` (FR-017).

## 4. Retention & purge (FR-030 / SC-008)

1. Insert/seed `FailedSignInAttempt` rows with `windowStart` older than the retention window (default 90d).
2. Run the purge (trigger the scheduled task or call `PurgeFailedSignInAttemptsUseCase` with `now`) → old rows gone, recent rows kept; the run logs the deleted count (observable). (INV-4)

## 5. Resilience (FR-021 / FR-027)

- Simulate a telemetry write failure on the login-failure path → the login still returns 401 and a warning is logged; the auth flow is unaffected (INV-5).

## 6. Authorization denials (FR-031)

1. As a non-member (or insufficient-role user), attempt a consequential action you are not allowed to perform on the file-tree boundary (e.g. delete a file in a project you cannot access) → expect a `403`, **and** an `authz.denied` governance record carrying actor, `resourceType`/`resourceId`, reason, and `origin`.
2. Simulate a failure of the denial-record write → the request still returns `403` (not `500`) and a warning is logged (best-effort).

## 7. Failed-sign-in review (FR-032)

- As an admin, call `GET /admin/failed-sign-ins` (filter by identifier / ip / time) → the coalesced telemetry from step 1.2/1.3 is returned, paged — confirming attack patterns are reconstructable, and that this surface is separate from `/admin/audit-logs`.

## 8. Coverage inventory (FR-024 / SC-006)

- Open `contracts/audit-action-inventory.md` and confirm every consequential action is categorised (AUDITED / GAP / TELEMETRY / DEFER) with no blanks.

## Automated test entry points

- Domain use-case tests (in-memory fakes): `packages/domain/tests/use-cases/{auth,file-tree,content,project,members,admin}/…`
- Telemetry coalescing + purge + admin read: `packages/domain/tests/use-cases/settings/purge-failed-sign-ins.test.ts`, `.../settings/list-failed-sign-ins.test.ts`, `.../auth/record-failed-sign-in.test.ts`
- Infrastructure (testcontainers): `packages/infrastructure/tests/persistence/admin/prisma-failed-sign-in-attempt.repository.test.ts`
- API routes (Fastify inject): `apps/api/tests/routes/login.test.ts`, `.../routes/projects/file-tree-*.test.ts`
