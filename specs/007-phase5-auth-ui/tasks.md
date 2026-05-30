# Tasks: Authentication UI & Session Flows

**Input**: Design documents from `specs/007-phase5-auth-ui/`

**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓, data-model.md ✓, contracts/api-routes.md ✓

**Tests**: TDD is NON-NEGOTIABLE per the plan constitution. All RED→GREEN test tasks are included.

**Organization**: Tasks follow the plan's TDD sequence (Step 0–7), organized by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US4)
- Exact file paths are included in every description

---

## Phase 1: Setup (Bug Fixes)

**Purpose**: Fix three known bugs that block all subsequent work. Both fixes are independent and can run in parallel.

- [X] T001 [P] Create `apps/web/src/middleware.ts` as the Next.js edge middleware: reads `sessionId` cookie (not `"session"`), redirects unauthenticated requests to `/login?redirect=<path>`, matcher covers `/(dashboard|projects)(.*)`; then delete the now-replaced `apps/web/src/proxy.ts`
- [X] T002 [P] Fix `API_BASE_URL` default from `http://localhost:3001` to `http://localhost:4000` in `apps/web/src/lib/api.ts`

**Checkpoint**: Known bugs resolved — middleware is active, proxy.ts removed, web app points to the correct API port.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Domain hardening, new use case, shared DTO, API security config, a single shared auth hook for all protected routes, route wiring, and web infrastructure. MUST be complete before any user story phase begins.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### Domain — RegisterUserUseCase hardening (Step 0)

- [X] T003 RED: Add two failing tests to `packages/domain/tests/use-cases/register-user.test.ts` — `'returns RegistrationClosedError when users already exist'` and `'returns RegistrationClosedError when concurrent insert causes constraint violation'`
- [X] T004 Create `RegistrationClosedError` class (extends `DomainError`) in `packages/domain/src/errors/registration-closed.ts`
- [X] T005 Add `hasAny(): Promise<boolean>` method signature to `UserRepository` interface in `packages/domain/src/repositories/user.repository.ts`
- [X] T006 Add `hasAny()` implementation (`this.storage.size > 0`) to `InMemoryUserRepository` in `packages/domain/tests/repositories/in-memory-user.repository.ts`
- [X] T007 GREEN: Update `RegisterUserUseCase.execute()` in `packages/domain/src/use-cases/register-user.ts` — call `userRepo.hasAny()` first and return `RegistrationClosedError` if true; wrap `userRepo.save()` in try/catch for DB unique-constraint violations, re-check `hasAny()` on catch and return `RegistrationClosedError` if true
- [X] T008 [P] Export `RegistrationClosedError` from `packages/domain/src/errors/index.ts`

### Domain — CheckSystemSetupUseCase (Step 1)

- [X] T009 RED: Write two failing tests in `packages/domain/tests/use-cases/check-system-setup.test.ts` — `'returns configured: false when no users exist'` and `'returns configured: true when at least one user exists'`
- [X] T010 GREEN: Implement `CheckSystemSetupUseCase` in `packages/domain/src/use-cases/check-system-setup.ts` — constructor takes `UserRepository`, `execute()` returns `{ configured: boolean }` based on `userRepo.hasAny()`
- [X] T011 [P] Add `hasAny()` to `PrismaUserRepository` in `packages/infrastructure/src/repositories/prisma-user.repository.ts` — implement as `(await prisma.user.count({ take: 1 })) > 0`
- [X] T012 [P] Export `CheckSystemSetupUseCase` from `packages/domain/src/use-cases/index.ts`
- [X] T013 [P] Add `SetupStatusDto` interface (`{ configured: boolean }`) to `packages/shared/src/dtos/auth.dto.ts`

### API — Security config, new endpoint, shared auth hook, route wiring (Step 2)

- [X] T014 [P] Update `sameSite: 'lax'` to `sameSite: 'strict'` in the session cookie configuration in `apps/api/src/plugins/auth.ts`
- [X] T015 Update `apps/api/src/routes/register.ts` to always return `201 Created` (remove the `200` path), and map `RegistrationClosedError` → `403 Forbidden` with body `{ "error": { "code": "REGISTRATION_CLOSED", "message": "Registration is closed" } }`
- [X] T016 RED: Write failing integration tests (testcontainers) in `apps/api/tests/routes/setup-status.test.ts` — `'returns configured: false with empty database'` and `'returns configured: true after a user is created'`
- [X] T017 GREEN: Create `GET /auth/setup-status` route handler in `apps/api/src/routes/setup-status.ts` using `CheckSystemSetupUseCase`; response schema uses `SetupStatusDto`
- [X] T018 RED: Write failing CSRF integration tests (testcontainers) in `apps/api/tests/routes/auth-csrf.test.ts` — assert `POST /auth/login`, `POST /auth/register`, and `POST /auth/logout` each return `403 Forbidden` when the CSRF token header is absent
- [X] T019 GREEN: Verify `@fastify/csrf-protection` is active on `POST /auth/login`, `POST /auth/register`, and `POST /auth/logout` in `apps/api/src/routes/`; explicitly configure CSRF validation on each route if any test from T018 fails
- [X] T020 Create `requireAuth` Fastify `preHandler` in `apps/api/src/plugins/require-auth.ts` — reads `request.session.userId`; if absent, replies `401` with `{ "error": { "code": "UNAUTHORIZED", "message": "Authentication required" } }`; export as a named function so protected route groups can add it via `app.addHook('preHandler', requireAuth)` at registration time — no per-route duplication; behavior is verified by the integration tests for protected endpoints (me, projects, members)
- [X] T021 Register all routes in `buildServer()` in `apps/api/src/index.ts`: group `meRoute`, `passwordChangeRoute`, `passwordResetRequestRoute`, `passwordResetRoute`, `projectRoutes`, and `memberRoutes` inside a scoped plugin that adds `requireAuth` as a `preHandler` hook; register `loginRoute`, `registerRoute`, `logoutRoute`, and `setupStatusRoute` outside that group (public); verify each wired route's handler emits the auth-event logs required by the security constitution (login success/failure, logout)

### Web — Redirect helper, API client, session utility (Step 3)

- [X] T022 [P] RED: Write failing unit tests for `isInternalPath()` in `apps/web/src/lib/redirect.test.ts` — `'/'` → true, `'/dashboard'` → true, `'https://evil.com'` → false, `'//evil.com'` → false, `''` → false, `'relative'` → false
- [X] T023 [P] GREEN: Implement `isInternalPath(path: string): boolean` in `apps/web/src/lib/redirect.ts` — returns true iff `path.startsWith('/') && !path.startsWith('//')`
- [X] T024 [P] Add `authApi` methods to `apps/web/src/lib/api.ts`: `login(email, password)` → `POST /auth/login`, `register(email, password, displayName)` → `POST /auth/register`, `logout()` → `POST /auth/logout`, `setupStatus()` → `GET /auth/setup-status`, `me()` → `GET /auth/me`
- [X] T025 Create `getSession()` in `apps/web/src/lib/auth.ts` — write the failing unit test first in `apps/web/src/lib/auth.test.ts` (mock `authApi.me()`; assert returns `{ userId }` on success and `null` on any error), then implement: calls `authApi.me()`, returns the result on success, catches any error and returns `null`; all server components call this single utility instead of calling `authApi.me()` directly

**Checkpoint**: Foundation complete — domain, API, shared auth hook, and web infrastructure are ready for user story implementation.

---

## Phase 3: User Story 1 — Sign in with email and password (Priority: P1) 🎯 MVP

**Goal**: Any visitor to a protected page is redirected to the login page; valid credentials redirect the user to the dashboard (or the originally requested path); invalid credentials show a single generic error; already-authenticated users are redirected away from the login page.

**Independent Test**: Start the app with at least one existing account, visit `/dashboard` while signed out, verify redirect to `/login?redirect=/dashboard`, complete the login form with valid credentials, and confirm redirect back to `/dashboard`.

- [X] T026 [P] [US1] Create centered card layout for auth pages in `apps/web/src/app/(auth)/layout.tsx`
- [X] T027 [US1] RED: Write failing component tests for `LoginForm` in `apps/web/src/app/(auth)/login/page.test.tsx` — renders email and password fields; shows generic error on 401; disables submit button during submission; `?redirect=https://evil.com` resolves to `/dashboard` after login; `?redirect=//evil.com` resolves to `/dashboard`
- [X] T028 [US1] GREEN: Implement login page server component and `LoginForm` client component in `apps/web/src/app/(auth)/login/page.tsx` — server component calls `getSession()` from `apps/web/src/lib/auth.ts` and redirects to `/dashboard` if non-null; checks setup status via `authApi.setupStatus()` and redirects to `/register` if `configured: false`; validates `?redirect=` with `isInternalPath()`; shows `?reason=expired` notice; renders `LoginForm` client component with Zod-validated form
- [X] T029 [P] [US1] Add server-side session validation to `apps/web/src/app/(dashboard)/layout.tsx` — call `getSession()` from `apps/web/src/lib/auth.ts`; redirect to `/login?reason=expired` if it returns `null`

**Checkpoint**: User Story 1 fully functional — sign-in flow works end-to-end.

---

## Phase 4: User Story 2 — First-run setup for a new deployment (Priority: P1)

**Goal**: A fresh installation with no users automatically redirects any visitor to `/register`; submitting valid name/email/password creates an admin account, signs the user in, and redirects to `/dashboard`; the setup screen is inaccessible once any user exists.

**Independent Test**: Start the app against an empty database, visit `/`, verify automatic redirect to `/register`, submit the setup form, and confirm landing on `/dashboard`. Then revisit `/register` and confirm redirect to `/login`.

- [X] T030 [US2] RED: Write failing component tests for `RegisterForm` in `apps/web/src/app/(auth)/register/page.test.tsx` — shows "Set up your account" heading when `configured: false`; shows validation errors for weak password without losing other input; redirects to `/dashboard` on successful first-run submission; page redirects to `/login` when `configured: true` and user has no session
- [X] T031 [US2] GREEN: Implement register page server component and `RegisterForm` client component in `apps/web/src/app/(auth)/register/page.tsx` — server component calls `getSession()` (redirect to `/dashboard` if non-null), checks setup status (redirect to `/login` if `configured: true`); passes `isFirstRun` flag to `RegisterForm`; Zod-validates displayName, email, and password

**Checkpoint**: User Story 2 fully functional — first-run trial path works end-to-end.

---

## Phase 5: User Story 3 — Sign out (Priority: P2)

**Goal**: A signed-in user can end their session from the navigation bar; session is destroyed and the user lands on the login page; protected pages are inaccessible after sign-out.

**Independent Test**: Sign in, click "Sign Out" in the nav bar, confirm redirect to `/login`, then attempt to access `/dashboard` and confirm redirect back to `/login`.

- [X] T032 [US3] RED: Write failing test in `apps/web/src/app/(dashboard)/layout.test.tsx` — Sign Out button calls `authApi.logout()` and redirects to `/login`; button is keyboard accessible
- [X] T033 [US3] GREEN: Add Sign Out button to `apps/web/src/app/(dashboard)/layout.tsx` — calls `authApi.logout()`, redirects to `/login`; ensure button is keyboard accessible and visually consistent with the nav bar

**Checkpoint**: User Story 3 fully functional — session lifecycle is complete.

---

## Phase 6: User Story 4 — Rate limit and lockout feedback (Priority: P3)

**Goal**: A user who exceeds the failed-login threshold sees a human-readable lockout message with an approximate wait time instead of an opaque error.

**Independent Test**: Submit incorrect credentials until the API returns 429; verify the login form displays a message like "Too many failed attempts — please try again in 15 minutes".

- [X] T034 [US4] RED: Add failing test to `apps/web/src/app/(auth)/login/page.test.tsx` — when the API returns 429 with `{ "error": { "code": "RATE_LIMITED", "retryAfter": 900 } }`, the form shows a human-readable lockout message derived from `retryAfter` (e.g., "Too many failed attempts — please try again in 15 minutes")
- [X] T035 [US4] GREEN: Update `LoginForm` in `apps/web/src/app/(auth)/login/page.tsx` to handle 429 responses: read `error.retryAfter` from the response body and display a message such as "Too many failed attempts — please try again in X minutes"

**Checkpoint**: User Story 4 fully functional — lockout feedback is visible in the UI.

---

## Phase 7: E2E & Polish

**Purpose**: Playwright end-to-end validation, systematic protected-route coverage check, and quickstart confirmation.

- [X] T036 [P] Write Playwright E2E test for first-run flow in `apps/web/e2e/auth-first-run.spec.ts` — empty database → visit `/` → auto-redirect to `/register` → fill setup form → land on `/dashboard`; then visit `/register` → auto-redirect to `/login`
- [X] T037 [P] Write Playwright E2E test for sign-in and redirect flow in `apps/web/e2e/auth-signin.spec.ts` — visit `/dashboard` → redirect to `/login?redirect=/dashboard` → fill valid credentials → land on `/dashboard`; also test: already-authenticated user visits `/login` → redirect to `/dashboard`
- [X] T038 [P] Write Playwright E2E test for sign-out and session protection in `apps/web/e2e/auth-signout.spec.ts` — sign in → click "Sign Out" → redirect to `/login` → use back button to reach dashboard → redirect back to `/login`
- [X] T039 [P] Write Playwright E2E test for security edge cases in `apps/web/e2e/auth-session.spec.ts` — open-redirect: `/login?redirect=https://evil.com` → after login lands on `/dashboard`; post-setup register block: visit `/register` after setup → redirect to `/login`
- [X] T040 [P] Write a systematic protected-route coverage check in `apps/web/e2e/auth-route-coverage.spec.ts` — for each route under `/dashboard` and `/projects`, assert that accessing it without a `sessionId` cookie redirects to `/login`; this verifies SC-004 ("100% of routes in authenticated area enforce session check")
- [X] T041 Validate all scenarios in `specs/007-phase5-auth-ui/quickstart.md` work end-to-end against the running dev stack (`./scripts/dev.sh`)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately; T001 and T002 are parallel
- **Foundational (Phase 2)**: Depends on Phase 1 completion — BLOCKS all user stories
  - Domain tasks T003–T013 are sequential within the domain chain
  - T014, T022–T025 are independent and can run parallel to the domain chain
  - API tasks T015–T021 depend on domain tasks T007 (T015) and T010 (T017) being complete
  - T020 (requireAuth) depends on T019 (CSRF config) and is a prerequisite for T021 (route wiring)
- **User Stories (Phase 3–6)**: All depend on Phase 2 completion
  - US1 (Phase 3) and US2 (Phase 4) can run in parallel (different files)
  - US3 (Phase 5) can start after Phase 2; T033 extends T029 (US1 dashboard layout)
  - US4 (Phase 6) extends the `LoginForm` from US1 (T028)
- **Polish (Phase 7)**: Depends on all desired stories being complete

### User Story Dependencies

- **US1 (P1)**: Depends on Phase 2 only — notably T025 (getSession utility)
- **US2 (P1)**: Depends on Phase 2 only — can run in parallel with US1
- **US3 (P2)**: Depends on Phase 2; T033 adds Sign Out to the layout started in T029 (US1)
- **US4 (P3)**: Depends on T028 (US1 LoginForm); extends the same component

### Within Each User Story

- RED tests MUST be written first and confirmed failing before GREEN implementation
- T026 (layout) and T029 (dashboard layout validation) can be done in parallel with RED test writing
- Complete RED → GREEN → refactor within each task grouping

### Parallel Opportunities Within Phase 2

```bash
# Run in parallel (different file groups):
Domain chain: T003 → T004 → T005 → T006 → T007 → T008 → T009 → T010 → T011 → T012
Shared DTO:   T013 (independent)
API config:   T014 (independent)
Web helpers:  T022 → T023, T024, T025 (independent of domain)

# After domain chain completes:
API tests+impl: T015 → T016 → T017 → T018 → T019 → T020 → T021
```

---

## Parallel Example: Phase 3 (User Story 1)

```bash
# These tasks can run in parallel once Phase 2 is complete:
Task T026: Create auth layout in apps/web/src/app/(auth)/layout.tsx
Task T029: Add session validation to apps/web/src/app/(dashboard)/layout.tsx

# Then sequentially:
Task T027: RED — Write LoginForm component tests
Task T028: GREEN — Implement login page + LoginForm (uses getSession() from auth.ts)
```

---

## Implementation Strategy

### MVP First (User Stories 1 + 2 — both P1)

1. Complete Phase 1: Bug fixes (T001–T002)
2. Complete Phase 2: Foundational (T003–T025)
3. Complete Phase 3: US1 — Sign in (T026–T029)
4. Complete Phase 4: US2 — First-run setup (T030–T031)
5. **STOP and VALIDATE**: Run quickstart.md first-run and sign-in flows
6. Demo/deploy if ready

### Incremental Delivery

1. Phase 1 + Phase 2 → Infrastructure ready
2. Phase 3 (US1) → Sign-in works → **Demo: returning user can log in**
3. Phase 4 (US2) → First-run works → **Demo: trial evaluator can set up and log in**
4. Phase 5 (US3) → Sign-out works → Session lifecycle complete
5. Phase 6 (US4) → Lockout feedback → Security UX polished
6. Phase 7 → E2E confirmed

### Parallel Team Strategy

With multiple developers after Phase 2 is done:
- Developer A: Phase 3 (US1 — login page)
- Developer B: Phase 4 (US2 — register/setup page)
- Both merge, then one developer handles Phase 5 (US3) and Phase 6 (US4)

---

## Notes

- `[P]` tasks touch different files with no incomplete-task dependencies
- `[USn]` label maps each task to a specific user story for traceability
- RED tasks MUST be written and confirmed failing before GREEN implementation begins
- Each user story phase is independently completable and testable
- Commit after each logical RED→GREEN→refactor cycle
- Stop at any checkpoint to validate the story independently before moving to the next
