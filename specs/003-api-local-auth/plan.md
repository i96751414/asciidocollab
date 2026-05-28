# Implementation Plan: API Server + Local Authentication

**Branch**: `003-api-local-auth` | **Date**: 2026-05-27 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/003-api-local-auth/spec.md`

## Summary

Implement a Fastify API server with local email/password authentication (register, login, logout, password change,
password reset) using the existing domain entities (Phase 1) and Prisma repositories (Phase 2). All auth parameters are
configurable via environment variables. Leverage trusted libraries (Fastify ecosystem plugins, argon2, `node:crypto`) —
no custom cryptography or protocol implementations.

## Technical Context

**Language/Version**: TypeScript 5.5+ (same as Phases 1-2)

**Primary Dependencies**:

- `fastify` — HTTP server framework (already in monorepo stack)
- `@fastify/session` — server-side session management with custom Prisma-backed store
- `@fastify/cookie` — cookie parsing/signing
- `@fastify/csrf-protection` — CSRF token generation/validation
- `@fastify/sensible` — standard error responses, payload validation helpers
- `@fastify/rate-limit` — per-route rate limiting (login, registration, password reset)
- `argon2` — password hashing (as specified by FR-008)
- `@fastify/env` or `env-schema` — environment variable validation
- `nodemailer` (or transactional email SDK) — password reset email dispatch
- `@fastify/swagger` / `@fastify/swagger-ui` — OpenAPI docs for development
- `node:crypto` — built-in for token generation (`randomBytes`), timing-safe comparison (`timingSafeEqual`), and
  AES-256-GCM encryption

**Storage**: PostgreSQL via Prisma (existing `packages/db`). Sessions stored in `prisma.session` table. No new packages
required — new code lives in `apps/api/`.

**Testing**: Jest (existing monorepo config). Integration tests via testcontainers (from Phase 2 infrastructure).
Route-level tests with `fastify.inject()`. No mocking libraries for domain fakes.

**Target Platform**: Linux server (Docker), Node.js 24.x (Active LTS "Krypton")

**Project Type**: Web API server (Fastify) within a pnpm monorepo

**Performance Goals**:

- Health check: <100ms p99 (SC-007)
- Login: <2s p95 (SC-002)
- Registration: <3s p95 (SC-001)
- Password change/reset: <2s p95 (SC-009, SC-011)
- Server startup: <5s (SC-005)

**Constraints**:

- No custom authentication logic — delegate to Fastify ecosystem plugins
- All rate limits, timeouts, and policy parameters configurable via environment variables (FR-037) — zero hardcoded
  magic numbers
- Domain layer MUST NOT import from `apps/api` (constitution Principle I)
- Existing Phase 1-2 tests MUST continue to pass (SC-006)
- Session data encrypted at rest with AES-256-GCM (FR-014) — implemented via Prisma middleware on session `data` column
  per research.md
- All environment variables follow `ASCIIDOCOLLAB_CATEGORY_VARIABLE` convention (`ASCIIDOCOLLAB_AUTH_` for auth params,
  `ASCIIDOCOLLAB_API_` for server config)
- No `any` type in production code, no `as` casts (constitution Principle IV)
- fresh-onion must pass in CI

**Scale/Scope**: Single Fastify server. ~15 route handlers across 5 user stories. 43 FRs.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle                     | Compliance | Notes                                                                                                                                                                                                                                                                                                               |
|-------------------------------|------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **I. Clean Architecture**     | ✅ PASS     | Domain gains `passwordHistory` field on User entity; fresh-onion still enforced.                                                                                                                                                                                                                                    |
| **II. Clean Code**            | ✅ PASS     | Constants via env vars (FR-037). All error paths typed. Side effects explicit.                                                                                                                                                                                                                                      |
| **III. TDD (NON-NEGOTIABLE)** | ✅ PASS     | `fastify.inject()` enables route-level tests without HTTP. Integration tests via testcontainers. Red-green-refactor per endpoint.                                                                                                                                                                                   |
| **IV. Type Safety**           | ✅ PASS     | `strict: true`. Fastify schemas for request validation (FR-016). No `any` or `as`. Prisma generated types for DB.                                                                                                                                                                                                   |
| **V. Security by Design**     | ✅ PASS     | 43 FRs covering password policy, hashing, session management, CSRF, rate limiting, enumeration prevention, secrets-in-logs, dependency scanning, token encryption at rest, timing-safe comparison, HTTPS enforcement, breach check remediation, password change notification, CORS. All auth via trusted libraries. |
| **VI. Seam Testing**          | ✅ PASS     | Route handlers tested via `fastify.inject()`. Domain use cases still tested with in-memory fakes from Phase 1.                                                                                                                                                                                                      |
| **Phased Delivery**           | ✅ PASS     | Phase 3 produces independently testable API with auth. No forward deps to Phase 4+.                                                                                                                                                                                                                                 |
| **Quality Gates**             | ✅ PASS     | `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm fresh-onion` all pass pre-commit.                                                                                                                                                                                                                                 |
| **Commit Discipline**         | ✅ PASS     | Conventional Commits. Granular per-endpoint commits.                                                                                                                                                                                                                                                                |

All gates pass. No violations requiring complexity justification.

## Project Structure

### Documentation (this feature)

```text
specs/003-api-local-auth/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Generated by /speckit-tasks
```

### Source Code (repository root)

```text
apps/api/
├── package.json             # fastify, plugins, argon2, nodemailer
├── tsconfig.json            # composite, references infrastructure, shared
├── jest.config.cjs          # testcontainers + fastify.inject()
└── src/
    ├── index.ts             # Composition root: boot server, DI wiring
    ├── config/
    │   └── env.ts           # Environment variable validation + defaults
    ├── plugins/
    │   ├── auth.ts          # Session, cookie, CSRF plugin registration
    │   ├── error-handler.ts # Domain error → HTTP status mapping
    │   └── rate-limit.ts    # Per-route rate limit configuration
    ├── routes/
    │   ├── health.ts        # GET /health (US1)
    │   ├── register.ts      # POST /auth/register (US2)
    │   ├── login.ts         # POST /auth/login (US3)
    │   ├── logout.ts        # POST /auth/logout (US3)
    │   ├── password-change.ts  # POST /auth/password/change (US4)
    │   ├── password-reset-request.ts  # POST /auth/password/reset/request (US5)
    │   └── password-reset.ts         # POST /auth/password/reset (US5)
    ├── services/
    │   ├── auth.service.ts        # Orchestrates domain use cases + session
    │   └── password-reset.service.ts  # Token generation, email dispatch
    └── tests/
        ├── health.test.ts
        ├── register.test.ts
        ├── login.test.ts
        ├── logout.test.ts
        ├── password-change.test.ts
        ├── password-reset.test.ts
        └── env-config.test.ts

packages/
├── domain/                # UPDATE: User entity + passwordHistory field, UserRepository
├── shared/                # Unchanged from Phase 1
├── db/                    # ADD: Session, PasswordResetToken models; User.passwordHistory field
└── infrastructure/        # Unchanged from Phase 2
```

**Structure Decision**: All Phase 3 code lives in `apps/api/` (which was scaffolded as a shell in Phase 1). The existing
`packages/domain` gains a `passwordHistory` field on the `User` entity and corresponding updates to `UserRepository` and
its in-memory fake. `packages/db` adds `Session` and `PasswordResetToken` models plus the `User.passwordHistory` column.
`packages/shared` and `packages/infrastructure` remain unchanged.

## Architecture Refactors (Post-Implementation)

**Source**: Architecture Guard review (2026-05-28) against `architecture_constitution.md`

| Refactor                                   | Priority | Constitution Rule                                 | Status |
|--------------------------------------------|----------|---------------------------------------------------|--------|
| Extract auth use cases from route handlers | P1       | "Controllers/handlers MUST delegate to use cases" | Open   |
| Add PasswordResetToken to domain model     | P1       | "Domain MUST define repository interfaces"        | Open   |
| Complete infrastructure barrel export      | P2       | "Each package owns its internal structure"        | Open   |
| Add runtime validation to session-store    | P3       | "No `as` casts in production code"                | Open   |

**Accepted Deviation**: Route handlers currently use `as` casts for Fastify `request.body` typing. ESLint override
suppresses this at `apps/api/src/routes/*.ts`. This is a pragmatic trade-off for Fastify's untyped body — fix deferred
to Phase 4+ when route-level DTO validation schemas are standardized.

---

## Complexity Tracking

| Violation                                                                                  | Why Needed                                                                                                  | Simpler Alternative Rejected Because                                                                                             |
|--------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------|
| Constitution V §session storage: custom Prisma-backed store instead of `connect-pg-simple` | Type safety, encryption middleware (AES-256-GCM via Prisma hooks), consistent with existing Prisma patterns | `connect-pg-simple` is untyped, doesn't support encryption middleware, and introduces a different query pattern alongside Prisma |
