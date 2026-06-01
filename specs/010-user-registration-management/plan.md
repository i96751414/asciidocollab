# Implementation Plan: Multi-User Registration & User Management

**Branch**: `010-user-registration-management` | **Date**: 2026-06-01 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/010-user-registration-management/spec.md`

## Summary

Allow multiple users to join AsciiDoCollab via admin-sent invitations (always available) or open
self-registration (runtime toggle). Self-registered users must verify their email before accessing
the application; invited users are verified by clicking their invitation link. Administrators
manage users from a dedicated page — view all users, invite, change admin status, remove — with
hard-delete and project-ownership transfer on removal. A unified `RegisterUseCase` extends the
existing initial-setup endpoint to handle the self-registration path. All new domain entities and
use cases follow Clean Architecture and the TDD/in-memory-fake discipline mandated by the
constitution.

## Technical Context

**Language/Version**: TypeScript 6.x (Node.js ≥ 24) — pnpm workspace monorepo

**Primary Dependencies**:
- Domain: zero external deps (pure TypeScript)
- Infrastructure: Prisma 7.x, Nodemailer (via EmailSender interface), Argon2id (existing)
- API: Fastify + @fastify/session, existing plugin set
- Frontend: Next.js 16 (App Router), shadcn/ui, Radix UI, Tailwind CSS, Zod

**Storage**: PostgreSQL via Prisma ORM (`packages/db`)

**Testing**: Jest + Testing Library (unit/integration), Playwright (E2E)

**Target Platform**: Node.js 24+, Linux server

**Project Type**: Web application — Modular Monolith with Clean Architecture

**Performance Goals**: Email delivery < 2 min under normal conditions (SC-003); no new latency
requirements beyond existing API targets

**Constraints**:
- Email send + record creation are atomic (FR-002, FR-007): send email first, only persist on success
- Open registration toggle takes effect immediately, no restart required (FR-005)
- Last-admin protection is domain-enforced (SC-006)
- Token hashes only stored in DB; raw tokens sent via email only

**Scale/Scope**: Single-instance self-hosted deployment; no pagination for user list v1

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

### I. Clean Code ✓

- All new entities, value objects, and use cases follow the noun/verb/predicate naming already
  established in `packages/domain`.
- Each new use case does exactly one thing (single-registration flow, verify email, remove user,
  etc.). No use case spans two unrelated concerns.
- Typed error classes for every failure mode — no string errors, no generic `Error` throws.
- Token expiry (72h / 24h) defined as named constants in domain, not magic literals.

### II. TDD — Red-Green-Refactor (NON-NEGOTIABLE) ✓

- Every new domain use case, entity computed property, and value object MUST have a failing test
  written first using in-memory fakes of all repository/service dependencies.
- The modified `RegisterUserUseCase` requires red-first tests for the two new branches (open
  self-registration, email-already-registered anti-enumeration path).
- Infrastructure adapters (`PrismaUserInvitationRepository`, etc.) are covered by integration
  tests against real PostgreSQL via testcontainers.
- No production code is committed until the corresponding test is green.

### III. Seam Testing with In-Memory Fakes ✓

Four new in-memory fakes to create alongside their repository interfaces:

| Interface | In-memory Fake (tests/) |
|-----------|-------------------------|
| `UserInvitationRepository` | `InMemoryUserInvitationRepository` |
| `EmailVerificationTokenRepository` | `InMemoryEmailVerificationTokenRepository` |
| `SystemSettingRepository` | `InMemorySystemSettingRepository` |
| `SessionRepository` | `InMemorySessionRepository` |

Extended `UserRepository` methods (`findAll`, `delete`, `countAdmins`) are added to the existing
`InMemoryUserRepository` in the test suite.

Mocking libraries are NOT used for these.

### Architecture — Layer Boundaries ✓

- `packages/domain` gains zero new external dependencies.
- Email notification is injected via two new domain service interfaces:
  `RegistrationInvitationNotifier` and `EmailVerificationNotifier`.
- Session invalidation uses a `SessionRepository` interface defined in domain;
  `PrismaSessionRepository` in infrastructure implements it.
- All new cross-package types live in `packages/shared` — no type duplication.
- Dependency injection wired at `apps/api/src/index.ts` (composition root), same as today.

### Security ✓

- RBAC: all admin operations (`ListUsersUseCase`, `RemoveUserUseCase`, etc.) verify `actor.isAdmin`
  inside the use case. Route-level `requireAdmin` plugin is an additional fast-fail only.
- Anti-enumeration: self-registration returns HTTP 202 regardless of whether the email exists.
- Token security: 32-byte crypto-random seed, SHA-256 hash stored; raw token only in email.
- Last-admin protection: `RemoveUserUseCase` and `SetAdminStatusUseCase` call `userRepo.countAdmins()`
  before any destructive action.
- Session invalidation: `RemoveUserUseCase` calls `sessionRepo.deleteByUserId` before hard-delete.
- Rate limiting: `/auth/register`, `/auth/verify-email`, `/auth/resend-verification`,
  `/auth/accept-invite`, `/admin/users/invite` all carry rate limits.

### P0 Blocking Violations — None ✓

| Check | Status |
|-------|--------|
| Domain imports infra/delivery | None |
| Business logic in route handlers | None — all logic in use cases |
| Repository interfaces missing from domain | None — all defined in `packages/domain` |
| Cross-package type duplication | None — all shared types in `packages/shared` |
| `any` in production code | Prohibited |
| `as` casts in production code | Prohibited |

## Project Structure

### Documentation (this feature)

```text
specs/010-user-registration-management/
├── plan.md              # This file
├── research.md          # Phase 0 output — token design, atomicity, anti-enumeration decisions
├── data-model.md        # Phase 1 output — schema changes, entities, repositories, use cases
├── quickstart.md        # Phase 1 output — manual test walkthrough for all 4 user stories
├── contracts/
│   ├── api-contracts.md       # All new / modified API endpoints and shared DTOs
│   └── frontend-contracts.md  # New pages, modified components, API client additions
└── tasks.md             # Phase 2 output — generated by /speckit-tasks (NOT yet created)
```

### Source Code (repository root)

```text
packages/db/prisma/
└── schema.prisma                        # MODIFY: User (emailVerified), AuditLog (userId nullable),
                                         #   ADD: UserInvitation, EmailVerificationToken, SystemSetting

packages/domain/src/
├── entities/
│   ├── user.ts                          # MODIFY: add emailVerified field
│   ├── user-invitation.ts               # NEW
│   └── email-verification-token.ts      # NEW
├── value-objects/
│   ├── user-invitation-id.ts            # NEW
│   └── email-verification-token-id.ts   # NEW
├── repositories/
│   ├── user.repository.ts               # MODIFY: add findAll(), delete(), countAdmins()
│   ├── user-invitation.repository.ts    # NEW
│   ├── email-verification-token.repository.ts  # NEW
│   ├── system-setting.repository.ts     # NEW
│   └── session.repository.ts            # NEW
├── services/
│   ├── token-generator.ts               # MODIFY: add generateInvitationToken(), generateEmailVerificationToken()
│   ├── registration-invitation-notifier.ts  # NEW
│   └── email-verification-notifier.ts   # NEW
├── use-cases/
│   ├── register-user.ts                 # MODIFY: unified first-user + self-registration
│   ├── verify-email.ts                  # NEW
│   ├── resend-verification-email.ts     # NEW
│   ├── send-user-invitation.ts          # NEW
│   ├── accept-user-invitation.ts        # NEW
│   ├── list-users.ts                    # NEW
│   ├── remove-user.ts                   # NEW
│   ├── set-admin-status.ts              # NEW
│   ├── get-open-registration.ts         # NEW
│   └── set-open-registration.ts         # NEW
└── errors/
    ├── invitation-already-pending.ts    # NEW
    ├── cannot-remove-self.ts            # NEW
    ├── cannot-modify-self-admin.ts      # NEW
    └── email-not-verified.ts            # NEW (used by API middleware mapping)

packages/domain/tests/
├── entities/
│   ├── user-invitation.test.ts          # NEW
│   └── email-verification-token.test.ts # NEW
├── repositories/                        # NEW in-memory fakes (used by use-case tests)
│   ├── in-memory-user-invitation.repository.ts
│   ├── in-memory-email-verification-token.repository.ts
│   ├── in-memory-system-setting.repository.ts
│   └── in-memory-session.repository.ts
└── use-cases/
    ├── register-user.test.ts            # EXTEND: new branches
    ├── verify-email.test.ts             # NEW
    ├── resend-verification-email.test.ts # NEW
    ├── send-user-invitation.test.ts     # NEW
    ├── accept-user-invitation.test.ts   # NEW
    ├── list-users.test.ts               # NEW
    ├── remove-user.test.ts              # NEW
    ├── set-admin-status.test.ts         # NEW
    └── set-open-registration.test.ts    # NEW

packages/infrastructure/src/
├── persistence/
│   ├── prisma-user.repository.ts        # MODIFY: add findAll(), delete(), countAdmins()
│   ├── prisma-user-invitation.repository.ts       # NEW
│   ├── prisma-email-verification-token.repository.ts # NEW
│   ├── prisma-system-setting.repository.ts        # NEW
│   └── prisma-session.repository.ts               # NEW
└── services/
    ├── crypto-token-generator.ts        # MODIFY: add invitation + verification token methods
    ├── smtp-registration-invitation-notifier.ts  # NEW
    └── smtp-email-verification-notifier.ts       # NEW

packages/infrastructure/tests/
├── persistence/
│   ├── prisma-user-invitation.repository.test.ts      # NEW (integration)
│   ├── prisma-email-verification-token.repository.test.ts # NEW (integration)
│   ├── prisma-system-setting.repository.test.ts       # NEW (integration)
│   └── prisma-session.repository.test.ts              # NEW (integration)
└── services/
    └── crypto-token-generator.test.ts   # EXTEND: new token methods

packages/shared/src/dtos/
├── auth.dto.ts                          # EXTEND: SelfRegisterResultDto
└── admin.dto.ts                         # NEW: AdminUserDto, AdminSettingsDto,
                                         #      InviteUserDto, AcceptInviteDto,
                                         #      UserRemovalPreviewDto

apps/api/src/
├── plugins/
│   ├── require-admin.ts                 # NEW: Fastify preHandler — fast-fail for admin routes
│   └── require-email-verified.ts        # NEW: Fastify preHandler — blocks unverified users
├── routes/
│   ├── register.ts                      # MODIFY: 201 for admin, 202 for self-register
│   ├── open-registration-status.ts      # NEW: GET /auth/open-registration-status
│   ├── verify-email.ts                  # NEW: GET /auth/verify-email?token=...
│   ├── accept-invite.ts                 # NEW: GET + POST /auth/accept-invite
│   ├── resend-verification.ts           # NEW: POST /auth/resend-verification
│   └── admin/
│       ├── users.ts                     # NEW: GET /admin/users, GET /admin/users/:id/removal-preview
│       ├── users-invite.ts              # NEW: POST /admin/users/invite
│       ├── users-admin-status.ts        # NEW: PATCH /admin/users/:id/admin
│       ├── users-remove.ts              # NEW: DELETE /admin/users/:id
│       └── settings.ts                  # NEW: GET + PATCH /admin/settings
└── index.ts                             # MODIFY: register new routes + wire new repositories/services

apps/api/tests/routes/
├── register.test.ts                     # EXTEND: self-registration branches
├── open-registration-status.test.ts     # NEW
├── verify-email.test.ts                 # NEW
├── accept-invite.test.ts                # NEW
├── resend-verification.test.ts          # NEW
└── admin/
    ├── users.test.ts                    # NEW
    ├── users-invite.test.ts             # NEW
    ├── users-admin-status.test.ts       # NEW
    ├── users-remove.test.ts             # NEW
    └── settings.test.ts                 # NEW

apps/web/src/
├── app/
│   ├── (auth)/
│   │   ├── register/
│   │   │   ├── page.tsx                 # MODIFY: gate logic + 202 success state
│   │   │   └── register-form.tsx        # MODIFY: show "check email" on 202 response
│   │   ├── accept-invite/
│   │   │   ├── page.tsx                 # NEW
│   │   │   └── accept-invite-form.tsx   # NEW
│   │   ├── verify-email/
│   │   │   └── page.tsx                 # NEW: token verification + redirect
│   │   └── verify-email-required/
│   │       └── page.tsx                 # NEW: interstitial + resend button
│   ├── (dashboard)/dashboard/admin/
│   │   └── users/
│   │       ├── page.tsx                 # NEW: admin user management page (SSR)
│   │       └── users-client.tsx         # NEW: interactive table, invite form, dialogs
│   └── (auth)/login/
│       └── login-form.tsx               # MODIFY: conditional "Create an account" link
├── lib/
│   └── api.ts                           # EXTEND: admin + auth API client functions
└── middleware.ts                         # NEW or MODIFY: emailVerified check → redirect to
                                         #   /verify-email-required

apps/web/e2e/
├── registration-invitation.spec.ts      # NEW: User Story 1 E2E
├── self-registration.spec.ts            # NEW: User Story 2 E2E
├── user-management.spec.ts              # NEW: User Story 3 E2E
└── open-registration-toggle.spec.ts     # NEW: User Story 4 E2E
```

**Structure Decision**: Existing monorepo layout (Option 2 equivalent — `apps/` for delivery,
`packages/` for domain/infra/shared). New files follow the established per-concern naming
convention already present in each package. Admin routes grouped under `apps/api/src/routes/admin/`
matching the URL prefix `/admin/`.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No Constitution violations requiring justification. The anti-enumeration behaviour (returning
202 for an already-registered email on self-registration) is a deliberate security design choice
documented in [research.md](research.md) Decision 7, not a violation of any principle.
