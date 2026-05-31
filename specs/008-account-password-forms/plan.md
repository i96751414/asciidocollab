# Implementation Plan: Account Management & Password Forms

**Branch**: `008-account-password-forms` | **Date**: 2026-05-31 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/008-account-password-forms/spec.md`

## Summary

Build the missing frontend forms for the existing password reset/change backend routes, add a full account management page with three independent cards (display name, email, password), and introduce a new email-change token flow following the established password reset token pattern. Extract a shared `buildPasswordSchema` utility and `useTouchedFields` hook to eliminate form validation duplication. The entire implementation follows TDD with security-focused negative tests at every layer.

## Technical Context

**Language/Version**: TypeScript 5.x — pnpm workspaces monorepo

**Primary Dependencies**:
- Backend: Fastify (schema-first), Prisma ORM, Argon2 (password hashing), existing `tokenGenerator` service, existing `emailSender` service
- Frontend: Next.js 16 App Router, Zod, shadcn/ui + Radix UI + Tailwind CSS
- Testing: Jest + Testing Library (unit/integration), testcontainers (PostgreSQL), Playwright (E2E)

**Storage**: PostgreSQL via Prisma ORM (`packages/db`)

**Testing**: Jest with testcontainers for API integration tests; in-memory fakes for domain unit tests; React Testing Library for frontend hooks/utilities

**Target Platform**: Web (Linux server + browser clients)

**Project Type**: Fullstack web application (modular monolith)

**Performance Goals**: Same response-time expectations as existing auth endpoints; no new performance requirements

**Constraints**: Zero `any` types; zero `as` casts; `Result<T,E>` for all fallible domain/application operations; domain layer has zero external dependencies

**Scale/Scope**: Single-user operations matching existing auth endpoint scale

## Constitution Check

| Rule | Status | Notes |
|------|--------|-------|
| Domain has zero external dependencies | ✅ PASS | `EmailChangeToken` entity and all new use cases are pure domain |
| Business logic in use cases only | ✅ PASS | `RequestEmailChangeUseCase`, `ConfirmEmailChangeUseCase`, `UpdateDisplayNameUseCase` own all logic |
| Repository interfaces in domain | ✅ PASS | `EmailChangeTokenRepository` defined in `packages/domain` |
| DTOs in `packages/shared` | ✅ PASS | `UserProfileDto` extended; three new DTOs added to `auth.dto.ts` |
| No `any` type in production code | ✅ PASS | Must be enforced during implementation |
| No `as` casts in production code | ✅ PASS | Must be enforced during implementation |
| In-memory fake per new repository | ✅ PASS | `InMemoryEmailChangeTokenRepository` required |
| `Result<T,E>` for fallible ops | ✅ PASS | All three new use cases return `Result<T,E>` |
| No cross-package type duplication | ✅ PASS | `UserProfileDto` extended once in `packages/shared` |

No violations. No complexity tracking required.

## Project Structure

### Documentation (this feature)

```text
specs/008-account-password-forms/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── contracts/
│   └── api-contracts.md # Phase 1 output
├── quickstart.md        # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code

```text
packages/
  domain/src/
    entities/
      email-change-token.ts             ← new
    value-objects/
      email-change-token-id.ts          ← new
    repositories/
      email-change-token.repository.ts  ← new
    use-cases/
      request-email-change.ts           ← new
      confirm-email-change.ts           ← new
      update-display-name.ts            ← new

  infrastructure/src/
    persistence/
      prisma-email-change-token.repository.ts  ← new
    fakes/
      in-memory-email-change-token.repository.ts ← new

  shared/src/dtos/
    auth.dto.ts                         ← extend (UserProfileDto + 2 new DTOs)

  db/prisma/
    schema.prisma                       ← add EmailChangeToken model + User relation
    migrations/                         ← new migration

apps/
  api/src/routes/
    me.ts                               ← extend to return displayName + email
    profile-update.ts                   ← new: PATCH /auth/profile
    email-change-request.ts             ← new: POST /auth/email/change-request
    email-confirm.ts                    ← new: GET /auth/email/confirm

  web/src/
    lib/
      password-schema.ts                ← new (extracted from register-form)
      api.ts                            ← extend authApi (6 new methods)
    hooks/
      use-touched-fields.ts             ← new
    app/(auth)/
      login/login-form.tsx              ← update (add forgot-password link)
      forgot-password/
        page.tsx                        ← new
        forgot-password-form.tsx        ← new
      reset-password/
        page.tsx                        ← new (fetches password policy server-side)
        reset-password-form.tsx         ← new (Client Component)
      email-confirm/
        page.tsx                        ← new (Server Component — calls API on load)
    app/(dashboard)/
      layout.tsx                        ← update (add Account button to header, next to Sign Out)
      dashboard/account/
        page.tsx                        ← new (Server Component — fetches profile)
        display-name-card.tsx           ← new (Client Component)
        email-card.tsx                  ← new (Client Component)
        password-card.tsx               ← new (Client Component)
    app/(auth)/register/
      register-form.tsx                 ← update (import buildPasswordSchema)

tests/
  packages/domain/src/
    entities/email-change-token.test.ts ← new (entity invariants)
    use-cases/request-email-change.test.ts ← new (happy path + negative)
    use-cases/confirm-email-change.test.ts ← new (happy path + negative)
    use-cases/update-display-name.test.ts  ← new (happy path + negative)
  apps/api/tests/
    profile-update.test.ts              ← new
    email-change.test.ts                ← new (request + confirm, including negative)
  apps/web/tests/
    lib/password-schema.test.ts         ← new
    hooks/use-touched-fields.test.ts    ← new
```

**Structure Decision**: Monolith structure exactly mirroring the `PasswordResetToken` pattern. One new domain entity, two new use cases for email change, one new use case for display name update, one new infrastructure repository, four new API routes, six new `authApi` client methods. Minimal footprint.
