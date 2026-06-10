# Implementation Plan: Audit Log Coverage Review

**Branch**: `025-audit-log-coverage` | **Date**: 2026-06-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/025-audit-log-coverage/spec.md`

## Summary

The system already has a working governance audit trail (`AuditLog` entity, `AuditLogRepository` port, Prisma implementation, admin review API/UI) covering ~18 actions. This feature closes the gaps the spec identifies, in three slices:

1. **Account & authentication events (P1)** — instrument the existing auth use cases (`login`, `logout`, `change-password`, `reset-password`, `confirm-email-change`, `register-user`) to emit governance audit records, and add a **separate, volume-bounded, retention-limited failed-sign-in telemetry** store (distinct from the governance `AuditLog`) per FR-025–FR-030.
2. **File & folder lifecycle (P2)** — add audit writes to `create-file`, `create-folder`, `move-file`, `upload-asset` (currently silent), and enrich `rename-file`/`move-file` with before/after metadata.
3. **Record context (P3)** — thread an optional request-origin context (IP + user-agent) into audited use cases and add before/after metadata to change events (`project.updated`, `member.roleChanged`, `auth.email_changed`, rename, move).

**Technical approach**: Follow the established clean-architecture seam exactly — new domain entity + port + in-memory fake for the failed-auth telemetry, Prisma adapter in infrastructure, a shared `RequestContext` DTO, and a scheduled purge use case driven by an in-process task in `apps/api`. Reuse the existing `AuditLog` path for all governance events (its `userId` stays non-nullable because every governance event has a known actor). No change to the `AuditLog` schema is required; the failed-auth telemetry is a **new** table.

## Technical Context

**Language/Version**: TypeScript (Node.js 24+), ESM

**Primary Dependencies**: Fastify (API), Prisma 7 (ORM), PostgreSQL 15+, Jest + Testing Library (unit/integration), testcontainers (infra integration tests), Next.js 16 (admin review UI — read-only for this feature)

**Storage**: PostgreSQL via Prisma. Existing `AuditLog` table (unchanged) for governance events; **new** `FailedSignInAttempt` table (coalesced, retention-bounded) for auth-failure telemetry.

**Testing**: TDD per constitution — domain use cases with in-memory fakes; infrastructure repos with testcontainers PostgreSQL; API routes with Fastify inject tests.

**Target Platform**: Linux server (modular monolith)

**Project Type**: Web application (monorepo: `apps/api`, `apps/web`, `apps/collab`; `packages/domain|infrastructure|shared|db`)

**Performance Goals**: Audited governance actions add one indexed INSERT each (low volume). Failed-sign-in recording adds at most one coalescing UPSERT on the credential-failure path only; login p95 latency MUST stay within current bounds. Failed-auth row count grows sub-linearly with attempt volume (coalescing) — SC-008.

**Constraints**: Domain layer has zero framework/infra imports (`crypto.randomUUID` and `new Date()` are the existing accepted exceptions). No secrets in audit/telemetry records (FR-018/FR-029). Failed-auth recording must be best-effort and off the auth-response critical path (FR-027). Prisma migrations require explicit user confirmation before generation.

**Scale/Scope**: 1 new domain entity + port + fake + Prisma repo; ~10 use cases touched (6 new audit writes, 4 enrichments); 1 new failed-sign-in recording use case; 1 purge use case; 1 scheduled task; 1 shared DTO; config additions; coverage-inventory deliverable. No new external dependencies.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

**Governance Constitution**

- **I. Clean Code** — PASS. Action strings are currently inline magic strings across use cases; this feature introduces a named-constants module (`audit-actions.ts`) for the new actions to satisfy "no magic strings" without a disruptive rewrite of existing inline strings (existing ones noted as a non-blocking follow-up).
- **II. TDD (NON-NEGOTIABLE)** — PASS (planned). Every new entity, value object, port, use case, and Prisma repo is driven Red→Green→Refactor. The purge and coalescing logic are deterministic by taking `now: Date` as an input (no hidden clock), so time-based behaviour is unit-testable with in-memory fakes.
- **III. Seam testing with in-memory fakes** — PASS. New `FailedSignInAttemptRepository` port gets an in-memory fake under `packages/domain/tests/ports/admin/` mirroring source structure. No mocking libraries for repository behaviour.

**Architecture Constitution**

- **Layer boundaries** — PASS. New entity/port live in `packages/domain`; Prisma adapter in `packages/infrastructure`; `RequestContext` DTO in `packages/shared`; wiring at the `apps/api` composition root. Domain never imports infra.
- **Result<T,E>** — PASS. New fallible use cases return `Result`. Failed-auth recording is best-effort (its failure never changes the auth `Result`; it is surfaced via the request logger at the route boundary).
- **No `any` / no `as`** — PASS (planned).
- **Test file layout** — PASS. Tests under each package's `tests/` root mirroring source; no `__tests__/`.
- **Database Migration Policy** — ⚠️ GATE. This feature adds a `FailedSignInAttempt` model to `schema.prisma`. Per policy, the agent MUST ask the user before generating/applying any Prisma migration. Recorded in Phase 1; no migrate command runs without explicit confirmation.

**Security Constitution**

- **Auth events logged** — PASS and REINFORCED. The Security Constitution's "Audit, Logging & Monitoring" section already MANDATES logging login, logout, and failed attempts; this feature implements that requirement.
- **Secrets redacted** — PASS. FR-018/FR-029 forbid storing passwords/tokens; failed-auth records store only a validated identifier (never the submitted secret).
- **Authorization-denial logging — IN SCOPE (addressed)**: The Security Constitution states "All authorization denials MUST be logged with actor, resource, and reason." This is now satisfied (FR-031) via an incremental, boundary-by-boundary rollout using a shared denial recorder over the existing `AuditLog` store (`authz.denied` action) — see `architecture-migration-plan.md`. No schema change; best-effort recording never alters the returned `Result.err`. All authorization boundaries (file-tree, project, membership, admin) are delivered within this feature, sequenced incrementally per `architecture-migration-plan.md`.

**Editor/Theming principles (V–VIII)** — N/A. This feature touches no editor pipeline, preview sanitization, scroll-sync, design tokens, or per-user preference surfaces. The admin audit-review UI is unchanged (read-only) for this feature.

**Result**: PASS. One flagged operational item remains — the Prisma migration gate (handled by asking the user before any migrate command). Authorization-denial logging is now in scope (FR-031, incremental). No unjustified violations.

## Project Structure

### Documentation (this feature)

```text
specs/025-audit-log-coverage/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 — design decisions
├── data-model.md        # Phase 1 — entities & schema
├── quickstart.md        # Phase 1 — how to verify
├── contracts/           # Phase 1 — inventory + telemetry/DTO contracts
│   ├── audit-action-inventory.md   # FR-024 coverage inventory deliverable
│   ├── failed-sign-in-telemetry.md # telemetry model + coalescing/purge contract
│   └── request-context.md          # shared RequestContext DTO contract
└── checklists/
    └── requirements.md  # Spec quality checklist (already created)
```

### Source Code (repository root)

```text
packages/domain/src/
├── entities/
│   ├── audit-log.ts                         # (unchanged)
│   └── failed-sign-in-attempt.ts            # NEW entity (coalesced telemetry)
├── value-objects/
│   └── failed-sign-in-attempt-id.ts         # NEW id value object
├── ports/admin/
│   ├── audit-log.repository.ts              # (unchanged)
│   └── failed-sign-in-attempt.repository.ts # NEW port (record/coalesce + purge)
├── audit-actions.ts                          # NEW named action-string constants
└── use-cases/
    ├── auth/
    │   ├── login.ts                # EDIT: emit auth.signed_in; signal failure for telemetry
    │   ├── logout.ts (or new)      # audit auth.signed_out
    │   ├── change-password.ts      # EDIT: emit auth.password_changed
    │   ├── reset-password.ts       # EDIT: emit auth.password_reset
    │   ├── confirm-email-change.ts # EDIT: emit auth.email_changed (+ before/after)
    │   ├── register-user.ts        # EDIT: emit auth.registered
    │   └── record-failed-sign-in.ts# NEW use case (coalescing UPSERT, best-effort)
    ├── file-tree/
    │   ├── create-file.ts          # EDIT: emit file.created
    │   ├── create-folder.ts        # EDIT: emit folder.created
    │   ├── move-file.ts            # EDIT: emit file.moved (+ from/to)
    │   └── rename-file.ts         # EDIT: add before/after metadata
    ├── content/
    │   └── upload-asset.ts         # EDIT: emit file.uploaded
    ├── project/update-project.ts   # EDIT: add changed-fields before/after metadata
    ├── members/change-member-role.ts # EDIT: add previousRole/newRole metadata
    ├── settings/purge-failed-sign-ins.ts # NEW use case (retention purge, takes now+window)
    ├── settings/list-failed-sign-ins.ts  # NEW admin read use case (FR-032, paged+filtered)
    └── auth/record-audit-event.ts # NEW shared best-effort recorder (auth events + authz.denied, FR-031)

packages/infrastructure/src/persistence/admin/
├── prisma-audit-log.repository.ts            # (unchanged)
└── prisma-failed-sign-in-attempt.repository.ts # NEW Prisma adapter

packages/shared/src/
└── request-context.ts                        # NEW DTO { ipAddress?, userAgent? }

packages/db/prisma/
└── schema.prisma                             # EDIT: add FailedSignInAttempt model (migration gated on user confirm)

apps/api/src/
├── routes/
│   ├── login.ts        # EDIT: build RequestContext; best-effort failed-sign-in record on 401
│   ├── logout.ts       # EDIT: audit sign-out
│   ├── projects/file-tree-*.ts, assets.ts # EDIT: pass RequestContext to use cases
│   ├── auth/*          # EDIT: pass RequestContext where applicable
│   └── admin/failed-sign-ins.ts # NEW admin read endpoint for failed-auth telemetry (FR-032)
├── plugins/
│   └── failed-sign-in-purge.ts  # NEW scheduled in-process purge task (configurable interval)
├── config/schema.ts    # EDIT: add failedSignIn { retentionDays, coalesceWindow, purgeInterval }
└── lib/request-context.ts # NEW helper to build RequestContext from FastifyRequest

Tests mirror sources under each package's tests/ root (domain in-memory-fake + use-case tests, infrastructure testcontainers tests, apps/api inject tests).
```

**Structure Decision**: Web-application monorepo with Clean Architecture (the project's established layout). The feature adds exactly one new vertical slice (failed-sign-in telemetry: entity → port → fake → Prisma → use cases → scheduled task) and otherwise edits existing use cases/routes in place. No new top-level packages or apps.

## Complexity Tracking

| Violation / Deviation | Why Needed | Simpler Alternative Rejected Because |
|-----------------------|------------|--------------------------------------|
| Separate `FailedSignInAttempt` store instead of reusing `AuditLog` | Coalescing, account-existence neutrality, and bounded retention (FR-025/028/030) are fundamentally different from indefinite, one-row-per-event governance audit | Reusing `AuditLog` would require nullable-actor handling, defeat coalescing (unbounded rows), mix high-volume attacker-driven telemetry with low-volume governance events (slowing queries), and break the indefinite-retention guarantee |
| Authorization-denial logging delivered incrementally (not all boundaries at once) | The Security Constitution mandates it (FR-031); a single sweep across every permission check would be high-risk and unreviewable | A big-bang edit of every use case is rejected per Architecture Constitution "prefer incremental, module-by-module migration"; all boundaries (file-tree → project/membership → admin) are delivered in-feature, sequenced per `architecture-migration-plan.md` |
| New `audit-actions.ts` constants module while existing actions stay inline | New code must avoid magic strings (Principle I); a full sweep of existing inline strings is out of scope | Rewriting all existing inline action strings now is unrelated churn; consolidation is noted as a non-blocking follow-up |
