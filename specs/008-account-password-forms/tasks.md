# Tasks: Account Management & Password Forms

**Input**: Design documents from `specs/008-account-password-forms/`

**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓, data-model.md ✓, contracts/api-contracts.md ✓

**Tests**: TDD required — test tasks must FAIL before their corresponding implementation tasks begin.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no shared dependencies in current phase)
- **[Story]**: Which user story this task belongs to (US1–US5)
- Exact file paths in every description

---

## Phase 1: Setup — Shared Frontend Utilities (TDD)

**Purpose**: Extract shared form utilities required by multiple user stories. Must complete before any form implementation.

> **TDD**: Write the failing tests (T001, T002) before implementing (T003, T004).

- [x] T001 [P] Write failing tests for `buildPasswordSchema` (all policy rule combinations) in `apps/web/tests/lib/password-schema.test.ts`
- [x] T002 [P] Write failing tests for `useTouchedFields` (`touch`, `touchAll`, `isTouched` behaviour) in `apps/web/tests/hooks/use-touched-fields.test.ts`
- [x] T003 [P] Implement `buildPasswordSchema(policy)` in `apps/web/src/lib/password-schema.ts` — extract logic from `apps/web/src/app/(auth)/register/register-form.tsx` (keep `buildRegisterSchema` in place but delegate to this utility)
- [x] T004 [P] Implement `useTouchedFields<T>` hook in `apps/web/src/hooks/use-touched-fields.ts`
- [x] T005 Update `apps/web/src/app/(auth)/register/register-form.tsx` to import `buildPasswordSchema` from `apps/web/src/lib/password-schema.ts` — run existing register tests to confirm no regression

**Checkpoint**: `pnpm --filter web test` passes for password-schema and use-touched-fields; register form still passes.

---

## Phase 2: Foundational — Shared Backend + Navigation

**Purpose**: Extend shared DTOs, profile endpoint, API client, and dashboard navigation. All account page stories (US3–US5) depend on this.

> **TDD**: Write failing test T008 before updating `me.ts` in T009.

**⚠️ CRITICAL**: Account page stories (US3, US4, US5) cannot start until T012 is complete.

- [x] T006 Extend `packages/shared/src/dtos/auth.dto.ts`: add `displayName: string` and `email: string` to `UserProfileDto`; add `UpdateDisplayNameDto` and `RequestEmailChangeDto` interfaces (single edit, all in one file)
- [x] T008 Write failing test asserting `GET /auth/me` response includes `displayName` and `email` in `apps/api/tests/routes/me.test.ts` (also add 401 negative test if missing)
- [x] T009 Update `apps/api/src/routes/me.ts` to query `displayName` and `email` from the User record and include them in the response — verify T008 passes
- [x] T010 [P] Add 6 new methods to `authApi` in `apps/web/src/lib/api.ts`: `requestPasswordReset(email)`, `resetPassword(token, newPassword)`, `changePassword(currentPassword, newPassword)`, `updateDisplayName(displayName)`, `requestEmailChange(newEmail)`, `profile()` — each maps to the contract in `contracts/api-contracts.md`
- [x] T011 Add an "Account" button to the dashboard header in `apps/web/src/app/(dashboard)/layout.tsx`, placed adjacent to the Sign Out button, linking to `/dashboard/account`
- [x] T012 Create account page Server Component at `apps/web/src/app/(dashboard)/dashboard/account/page.tsx` — calls `authApi.profile()` (depends on T010), passes `displayName` and `email` as props to card component slots (render null placeholders until cards exist)

**Checkpoint**: `GET /auth/me` returns displayName + email; "Account" button visible in dashboard header; `/dashboard/account` loads without error.

---

## Phase 3: US1 — Forgot Password (Priority: P1) 🎯 MVP

**Goal**: Logged-out user can request a password reset link by entering their email.

**Independent Test**: Navigate to `/forgot-password`, submit any email, verify the confirmation message always appears regardless of whether the address exists.

- [x] T013a [P] [US1] Write/verify integration tests for `POST /auth/password/reset/request` in `apps/api/tests/password-reset-request.test.ts`: always returns 200 regardless of whether the email exists (enumeration prevention); rate limit exceeded → 429 with `retryAfter`
- [x] T013 [US1] Create `apps/web/src/app/(auth)/forgot-password/forgot-password-form.tsx` — Client Component: single email field, `useTouchedFields`, submit button disabled when email invalid or pending, always shows success banner on submit (no error branching on 200)
- [x] T014 [US1] Create `apps/web/src/app/(auth)/forgot-password/page.tsx` — renders `ForgotPasswordForm` within the `(auth)` layout
- [x] T015 [US1] Add "Forgot password?" link to `apps/web/src/app/(auth)/login/login-form.tsx` pointing to `/forgot-password`

**Checkpoint**: User Story 1 fully functional — submit any email on `/forgot-password`, confirmation appears.

---

## Phase 4: US2 — Reset Password via Token (Priority: P1)

**Goal**: User follows reset link from email and sets a new policy-compliant password.

**Independent Test**: Visit `/reset-password?token=<valid-token>`, enter a compliant password and matching confirmation, submit — redirect to `/login`. Verify the new password works and the old one does not.

> **TDD**: Write failing negative tests T016 before verifying/enhancing existing `password-reset.ts` route. Tests for the new frontend pages are verified manually per quickstart.md.

- [x] T016 [P] [US2] Write failing integration tests for missing negative scenarios in `apps/api/tests/password-reset.test.ts`: expired token → 400 `INVALID_TOKEN`, already-used token → 400 `INVALID_TOKEN`, password fails policy → 400 `VALIDATION_ERROR`, password reuse → 400 `PASSWORD_REUSE`, missing token field → 400
- [x] T017 [US2] Create `apps/web/src/app/(auth)/reset-password/reset-password-form.tsx` — Client Component: `newPassword` and `confirmPassword` fields, `buildPasswordSchema(policy)` + `useTouchedFields`, submit button disabled when invalid/pending, shows error when token is invalid/expired (on API error), redirects to `/login` on success
- [x] T018 [US2] Create `apps/web/src/app/(auth)/reset-password/page.tsx` — Server Component: reads `token` from `searchParams`, fetches password policy via `authApi.setupStatus()`, passes both to `ResetPasswordForm`; if token is absent renders error with link to `/forgot-password`

**Checkpoint**: User Story 2 fully functional — complete forgot-password → reset-password flow works end-to-end.

---

## Phase 5: US3 — Change Password (Priority: P2)

**Goal**: Logged-in user can change their password from the account page.

**Independent Test**: Navigate to `/dashboard/account`, fill in the Password card, save — verify new password works and old one does not.

> **TDD**: Write failing negative tests T019 before building the frontend card.

- [x] T019 [P] [US3] Write failing integration tests for missing negative scenarios in `apps/api/tests/password-change.test.ts`: wrong current password → 400 `INVALID_PASSWORD`, new password fails policy → 400 `VALIDATION_ERROR`, missing session → 401, rate limit → 429 with `retryAfter`
- [x] T020 [US3] Create `apps/web/src/app/(dashboard)/dashboard/account/password-card.tsx` — Client Component: `currentPassword`, `newPassword`, `confirmPassword` fields; `buildPasswordSchema(policy)` + `useTouchedFields`; Save button disabled when any field empty, validation fails, or pending; inline "Password updated" confirmation on success (clears fields, dismisses after 3 s)
- [x] T021 [US3] Update `apps/web/src/app/(dashboard)/dashboard/account/page.tsx` to fetch password policy alongside profile and render `PasswordCard` with policy prop

**Checkpoint**: Password card saves independently; success clears all three fields; wrong current password shows error; save button correctly disabled in all invalid states.

---

## Phase 6: US4 — Change Display Name (Priority: P2)

**Goal**: Logged-in user can update their display name independently.

**Independent Test**: Navigate to `/dashboard/account`, change display name, save — verify updated name shown; other cards unaffected.

> **TDD**: Write domain unit test T022 and integration test T024 before implementations T023 and T025.

- [x] T022 [P] [US4] Write failing domain unit tests for `UpdateDisplayNameUseCase` in `packages/domain/src/use-cases/update-display-name.test.ts`: happy path updates user displayName; empty string → `ValidationError`; name > 100 chars → `ValidationError`; non-existent userId → `NotFoundError`
- [x] T023 [US4] Implement `UpdateDisplayNameUseCase` in `packages/domain/src/use-cases/update-display-name.ts` returning `Result<T,E>`; export from `packages/domain/src/use-cases/index.ts`
- [x] T024 [P] [US4] Write failing integration tests for `PATCH /auth/profile` in `apps/api/tests/profile-update.test.ts`: 200 success; 400 when displayName empty; 400 when displayName > 100 chars; 401 when session absent
- [x] T025 [US4] Create `apps/api/src/routes/profile-update.ts` — `PATCH /auth/profile` handler using `UpdateDisplayNameUseCase`; Fastify schema validation on request body
- [x] T026 [US4] Register `profileUpdateRoute` in `apps/api/src/index.ts` and wire `UpdateDisplayNameUseCase` with `request.server.repos.user` — run T024 tests to confirm passing
- [x] T027 [US4] Create `apps/web/src/app/(dashboard)/dashboard/account/display-name-card.tsx` — Client Component: single `displayName` field pre-populated; `useTouchedFields`; Save button disabled when value unchanged, empty, > 100 chars, or pending; inline "Saved" confirmation dismisses after 3 s
- [x] T028 [US4] Update `apps/web/src/app/(dashboard)/dashboard/account/page.tsx` to render `DisplayNameCard` with `displayName` prop from fetched profile

**Checkpoint**: Display Name card saves independently; button correctly disabled; inline confirmation appears and fades; other cards unaffected.

---

## Phase 7: US5 — Email Change (Priority: P3)

**Goal**: Logged-in user requests email change; confirms via link sent to new address; current email unchanged until confirmed.

**Independent Test**: Enter new email in Email card → save → banner appears → follow dev confirmation URL → redirected to `/dashboard/account` with success notice → current email updated.

> **TDD**: Write entity test T029 and value object T030 first, then entity impl T031. Write use-case tests T034/T035 before implementations T036/T037. Write integration test T042 before API routes T043/T044.

### Domain Layer

- [x] T029 [P] [US5] Write failing domain unit tests for `EmailChangeToken` entity in `packages/domain/src/entities/email-change-token.test.ts`: `isUsed` true when `usedAt` set; `isExpired` true when `expiresAt` in the past; `isValid` false when used or expired; `isValid` true when unused and not expired
- [x] T030 [P] [US5] Create `EmailChangeTokenId` value object in `packages/domain/src/value-objects/email-change-token-id.ts` (mirrors `PasswordResetTokenId`); export from `packages/domain/src/value-objects/index.ts`
- [x] T03X [US5] Create `EmailChangeToken` entity in `packages/domain/src/entities/email-change-token.ts` with fields: `id`, `userId`, `tokenHash`, `pendingEmail`, `expiresAt`, `usedAt`, `createdAt`, computed `isUsed`/`isExpired`/`isValid`; export from `packages/domain/src/entities/index.ts`
- [x] T03X [US5] Create `EmailChangeTokenRepository` interface in `packages/domain/src/repositories/email-change-token.repository.ts` with methods: `save`, `findByTokenHash`, `findActiveByUserId`, `markAsUsed`, `deleteByUserId`; export from `packages/domain/src/repositories/index.ts`
- [x] T03X [US5] Create `InMemoryEmailChangeTokenRepository` in `packages/infrastructure/src/fakes/in-memory-email-change-token.repository.ts` implementing the domain interface (required by use-case tests)
- [x] T03X [P] [US5] Write failing domain unit tests for `RequestEmailChangeUseCase` in `packages/domain/src/use-cases/request-email-change.test.ts`: happy path creates token with pendingEmail; supersedes existing active token; returns success (no error) when newEmail already registered (enumeration prevention); returns success when newEmail equals current email (noop)
- [x] T03X [P] [US5] Write failing domain unit tests for `ConfirmEmailChangeUseCase` in `packages/domain/src/use-cases/confirm-email-change.test.ts`: happy path updates user email to pendingEmail and marks token used; expired token → `InvalidTokenError`; already-used token → `InvalidTokenError`; token not found → `InvalidTokenError`
- [x] T03X [US5] Implement `RequestEmailChangeUseCase` in `packages/domain/src/use-cases/request-email-change.ts` returning `Result<T,E>`; export from `packages/domain/src/use-cases/index.ts`
- [x] T03X [US5] Implement `ConfirmEmailChangeUseCase` in `packages/domain/src/use-cases/confirm-email-change.ts` returning `Result<T,E>`; export from `packages/domain/src/use-cases/index.ts`

### Database & Infrastructure

- [x] T03X [P] [US5] Add `EmailChangeToken` Prisma model to `packages/db/prisma/schema.prisma` and add `emailChangeTokens EmailChangeToken[]` relation to `User` model (per data-model.md)
- [x] T03X [US5] Run Prisma migration: `pnpm --filter @asciidocollab/db migrate dev --name add-email-change-token` (depends on T038)
- [x] T040 [US5] Implement `PrismaEmailChangeTokenRepository` in `packages/infrastructure/src/persistence/prisma-email-change-token.repository.ts`; export from `packages/infrastructure/src/index.ts`

### API Routes

- [x] T041 [US5] Write failing integration tests in `apps/api/tests/email-change.test.ts` (depends on T040 — requires compiled Prisma schema and repository) covering: full happy-path (request → confirm → email updated); 401 on `POST /auth/email/change-request` without session; 200 (no email sent) when newEmail is already registered (enumeration); 200 (no email sent) when newEmail equals current email; 429 rate limit on `POST /auth/email/change-request`; 400 `INVALID_TOKEN` on `GET /auth/email/confirm` with expired token; 400 `INVALID_TOKEN` with already-used token; 400 `VALIDATION_ERROR` when token query param absent
- [x] T042 [US5] Create `apps/api/src/routes/email-change-request.ts` — `POST /auth/email/change-request` handler using `RequestEmailChangeUseCase`; rate limit matches password reset; always returns 200
- [x] T043 [US5] Create `apps/api/src/routes/email-confirm.ts` — `GET /auth/email/confirm` handler using `ConfirmEmailChangeUseCase`; reads `token` from query params; returns 400 on `InvalidTokenError`
- [x] T044 [US5] Add `emailChangeToken: EmailChangeTokenRepository` to `AppContainer` in `apps/api/src/index.ts`; wire `PrismaEmailChangeTokenRepository`; register `emailChangeRequestRoute` and `emailConfirmRoute` — run T041 tests to confirm passing

### Frontend

- [x] T045 [P] [US5] Create `apps/web/src/app/(auth)/email-confirm/page.tsx` — Server Component: reads `token` from `searchParams`, calls `GET /auth/email/confirm` on the backend server-side; on success redirects to `/dashboard/account?confirmed=email`; on error renders error message with link back to `/dashboard/account`
- [x] T046 [US5] Create `apps/web/src/app/(dashboard)/dashboard/account/email-card.tsx` — Client Component: single `newEmail` field; `useTouchedFields`; Save button disabled when value equals current email, invalid format, or pending; hides form and shows persistent "Check your email at `<newEmail>` to confirm" banner on success
- [x] T047 [US5] Update `apps/web/src/app/(dashboard)/dashboard/account/page.tsx` to render `EmailCard` with `email` prop from fetched profile; also read `?confirmed=email` from `searchParams` and display a one-time success notice ("Email address updated") when present

**Checkpoint**: Full email change flow works end-to-end; confirmation link confirms the change; expired/used links show clear error; current email unchanged until confirmed.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Regression verification, security checklist, and end-to-end validation.

- [x] T048 [P] Run full test suite `pnpm test` — confirm zero regressions to existing register, login, password-change, and password-reset flows
- [x] T049 [P] Verify security checklist from `specs/008-account-password-forms/quickstart.md`: CSRF header on all new mutating routes; 401 on all authenticated routes without session; `POST /auth/email/change-request` always 200; no token or pendingEmail in server logs; `pendingEmail` read from database on confirm (not from URL); rate limiting on email change endpoint
- [x] T050 [P] Manual end-to-end: `/login` → "Forgot password?" → `/forgot-password` → email → `/reset-password?token=…` → log in with new password
- [x] T051 [P] Manual end-to-end: log in → "Account" button → `/dashboard/account` → update display name → change password → request email change → confirm via link → all three cards work independently; verify new form error messages match the registration form in style (font, colour, placement) and timing (shown only after blur or submit attempt)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1** (Setup): No dependencies — start immediately
- **Phase 2** (Foundational): Depends on Phase 1 — BLOCKS Phase 5 (US3), Phase 6 (US4), Phase 7 (US5)
- **Phase 3** (US1): Depends on Phase 1 only — can start as soon as T004 is done
- **Phase 4** (US2): Depends on Phase 1 only — can start as soon as T004 is done
- **Phase 5** (US3): Depends on Phase 2 (needs account page shell T012, password policy in API, authApi.changePassword)
- **Phase 6** (US4): Depends on Phase 2 (needs account page shell T012, authApi.updateDisplayName)
- **Phase 7** (US5): Depends on Phase 2 + Phases 5/6 (account page cards share the page.tsx); domain layer (T029–T037) can start after Phase 1
- **Phase 8** (Polish): Depends on all desired stories being complete

### User Story Dependencies

- **US1 (P1)**: Depends on Phase 1 only — starts after T004
- **US2 (P1)**: Depends on Phase 1 only — starts after T004; can run in parallel with US1
- **US3 (P2)**: Depends on Phase 2 (T012 account page shell, T010 authApi)
- **US4 (P2)**: Depends on Phase 2 (T012 account page shell, T010 authApi); can run in parallel with US3
- **US5 (P3)**: Domain tasks depend only on Phase 1; API/frontend tasks depend on Phase 2

### Within Each User Story (TDD Order)

1. Tests (failing) → 2. Implementation (tests pass) → 3. Verify checkpoint

### Parallel Opportunities

- T001 + T002: write both test files simultaneously
- T003 + T004: implement both utilities simultaneously
- T008 + T010: API test + authApi methods are in different files
- T016 + T019: adding negative tests to two different existing test files
- T022 + T024: domain test + API test for US4 (different files)
- T029 + T030: entity test + value object (different files)
- T034 + T035: two use-case test files (different files)
- T038: Prisma schema can be drafted while T033 (in-memory fake) is being implemented
- T041: depends on T040 (needs compiled Prisma schema + repository) — NOT parallel with T038/T039/T040

---

## Parallel Example: Phase 7 (US5) Domain Layer

```
Start simultaneously:
  Task T029: Write entity tests in packages/domain/src/entities/email-change-token.test.ts
  Task T030: Create EmailChangeTokenId in packages/domain/src/value-objects/email-change-token-id.ts

Then:
  Task T031: Implement EmailChangeToken entity (needs T029 test file, T030 value object)
  Task T032: Create repository interface (needs T031 entity)
  Task T033: Create in-memory fake (needs T032 interface)

Then simultaneously:
  Task T034: Write RequestEmailChangeUseCase tests (needs T032 interface, T033 fake)
  Task T035: Write ConfirmEmailChangeUseCase tests (needs T032 interface, T033 fake)

Then:
  Task T036: Implement RequestEmailChangeUseCase (needs T034 tests)
  Task T037: Implement ConfirmEmailChangeUseCase (needs T035 tests)
```

---

## Implementation Strategy

### MVP (User Stories 1 + 2 only — unauthenticated flows)

1. Complete Phase 1: Setup (T001–T005)
2. Complete Phase 3: US1 Forgot Password (T013a–T015)
3. Complete Phase 4: US2 Reset Password (T016–T018)
4. **STOP and VALIDATE**: Full password-reset flow works end-to-end
5. Ship / demo

### Incremental Delivery

1. Phase 1 + Phase 3 → **Forgot Password live**
2. + Phase 4 → **Full password recovery live**
3. + Phase 2 + Phase 5 → **Change Password on account page live**
4. + Phase 6 → **Display Name change live**
5. + Phase 7 → **Email change live** (full feature complete)

### Parallel Team Strategy

Once Phase 1 + Phase 2 complete:
- Developer A: US1 + US2 (unauthenticated password flows)
- Developer B: US3 + US4 (account page — password card + display name card)
- Developer C: US5 domain layer (email change — can start domain tasks after Phase 1)

---

## Notes

- `[P]` = different files, no dependencies on other in-progress tasks in the same phase
- `[Story]` label maps each task to its user story for traceability
- TDD: every test task must **fail** before its paired implementation task begins
- Negative tests are part of the required TDD scope (per research.md security matrix)
- Commit after each checkpoint or logical group
- The `EmailChangeToken` pattern is a direct mirror of `PasswordResetToken` — consult that implementation for reference
- `buildPasswordSchema` and `useTouchedFields` are the only shared frontend abstractions — do not introduce additional shared state hooks
