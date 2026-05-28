---

description: "Task list for API Server + Local Authentication (Phase 3)"
---

# Tasks: API Server + Local Authentication

**Input**: Design documents from `specs/003-api-local-auth/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Included per spec.md user story Independent Test criteria.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **New code**: `apps/api/src/`, `apps/api/tests/`
- **Domain updates**: `packages/domain/src/entities/user.ts`, `packages/domain/src/repositories/user.repository.ts`
- **DB updates**: `packages/db/prisma/schema.prisma`
- Paths based on plan.md monorepo structure

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Scaffold the `apps/api` package and install all dependencies

- [X] T001 Create `apps/api/package.json` with Fastify, argon2, nodemailer, and Fastify plugin dependencies per plan.md
- [X] T002 [P] Create `apps/api/tsconfig.json` (composite, references infrastructure and shared)
- [X] T003 [P] Create `apps/api/jest.config.cjs` (testcontainers + fastify.inject() config)
- [X] T004 Create `apps/api/src/index.ts` composition root (boot Fastify, DI wiring, plugin registration)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Prisma schema updates, environment config validation, shared middleware plugins

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T005 Add `Session` model to `packages/db/prisma/schema.prisma` per data-model.md
- [X] T006 [P] Add `PasswordResetToken` model to `packages/db/prisma/schema.prisma` per data-model.md
- [X] T007 [P] Add `passwordHistory` column (`TEXT[]`) to User model in `packages/db/prisma/schema.prisma`
- [X] T008 [P] Update `packages/domain/src/entities/user.ts` — add `passwordHistory: string[]` field to constructor
- [X] T009 [P] Update `packages/domain/src/repositories/user.repository.ts` — ensure interface supports `passwordHistory`
- [X] T010 [P] Update in-memory fake in `packages/domain/tests/repositories/` to include `passwordHistory`
- [X] T011 Create `apps/api/src/config/env.ts` — environment variable validation with `@fastify/env` per data-model.md
- [X] T012 Create `apps/api/src/plugins/auth.ts` — session cookie and CSRF plugin registration per research.md
- [X] T013 [P] Create `apps/api/src/plugins/rate-limit.ts` — per-route rate limit configuration per research.md

**Checkpoint**: Foundation ready — user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - API Server Foundation (Priority: P1) 🎯 MVP

**Goal**: Running Fastify server with health check, structured error handling, and request logging

**Independent Test**: `GET /health` returns `200 { status: "ok" }`. A non-existent route returns structured JSON 404. An unhandled domain error returns safe JSON error body.

### Tests for User Story 1

- [X] T014 [P] [US1] Test health endpoint in `apps/api/tests/health.test.ts`
- [X] T015 [P] [US1] Test 404 and error handling in `apps/api/tests/health.test.ts`

### Implementation for User Story 1

- [X] T016 [US1] Implement error handler in `apps/api/src/plugins/error-handler.ts` mapping domain errors to HTTP status codes per FR-002 envelope
- [X] T017 [US1] Implement `GET /health` route in `apps/api/src/routes/health.ts` per contracts/README.md
- [X] T018 [US1] Add request logging plugin (method, path, status code, duration) with redaction of password/token fields per FR-003, FR-020
- [X] T018a [US1] Add Fastify schema validation for request/response on all routes per FR-016

**Checkpoint**: Server running, health checks pass, errors return structured JSON

---

## Phase 4: User Story 2 - User Registration (Priority: P1)

**Goal**: Visitors can create accounts with email and password

**Independent Test**: Register with valid email/password → 201 + account persisted. Register same email again → 200 (same message, no enumeration). Invalid email → 400 validation.

### Tests for User Story 2

- [X] T019 [P] [US2] Test successful registration in `apps/api/tests/register.test.ts`
- [X] T020 [P] [US2] Test duplicate email returns same success response in `apps/api/tests/register.test.ts`
- [X] T021 [P] [US2] Test invalid email and weak password rejection in `apps/api/tests/register.test.ts`
- [X] T022 [P] [US2] Test registration rate limiting (3 per IP per hour) in `apps/api/tests/register.test.ts`

### Implementation for User Story 2

- [X] T023 [P] [US2] Implement password validation (length 12+, uppercase, lowercase, digits, symbols) per FR-006
- [X] T024 [P] [US2] Implement local common-password blocklist check (SecLists top 10,000) per FR-006
- [X] T024a [P] [US2] Implement async HIBP API client (SHA-1 k-anonymity protocol) and retry logic in `apps/api/src/services/breach-check.service.ts` per FR-006
- [X] T024b [US2] Implement account flagging + notification email on post-registration breach detection per FR-006a
- [X] T025 [P] [US2] Implement argon2id password hashing in shared auth helper per FR-008
- [X] T026 [US2] Implement `POST /auth/register` route in `apps/api/src/routes/register.ts` — email validation, duplicate detection (catch Prisma P2002 → return 200), password hashing, user persistence per contracts/README.md
- [X] T027 [US2] Wire registration rate limiting (FR-036) via `@fastify/rate-limit`

**Checkpoint**: Registration flow complete and independently testable

---

## Phase 5: User Story 3 - Login and Session Management (Priority: P1)

**Goal**: Registered users can log in, maintain sessions, and log out

**Independent Test**: Login → 200 + session cookie. Access protected route with cookie → success. Wrong password → 401. Logout → session destroyed. Expired session → re-login required.

### Tests for User Story 3

- [X] T028 [P] [US3] Test successful login and session cookie in `apps/api/tests/login.test.ts`
- [X] T029 [P] [US3] Test wrong password returns 401 in `apps/api/tests/login.test.ts`
- [X] T030 [P] [US3] Test logout destroys session in `apps/api/tests/logout.test.ts`
- [X] T031 [P] [US3] Test session expiry and protected route access in `apps/api/tests/login.test.ts`

### Implementation for User Story 3

- [X] T032 [P] [US3] Implement custom Prisma-backed session store for `@fastify/session` per research.md
- [X] T033 [P] [US3] Implement Prisma middleware for AES-256-GCM encryption of session `data` column per FR-014
- [X] T034 [US3] Implement `POST /auth/login` route in `apps/api/src/routes/login.ts` — email/password verification, session creation, session ID regeneration (FR-017), rate limiting (FR-013) per contracts/README.md
- [X] T035 [US3] Implement `POST /auth/logout` route in `apps/api/src/routes/logout.ts` — session destruction, rate limiting per contracts/README.md
- [X] T036 [US3] Add artificial timing delay for unknown email logins per FR-019a
- [X] T037 [US3] Add timing-safe comparison for password verification per FR-020a

**Checkpoint**: Login/logout cycle complete and independently testable

---

## Phase 6: User Story 4 - Password Change (Priority: P1)

**Goal**: Logged-in users can change their password with history enforcement

**Independent Test**: Login, change password → 200 + old password invalidated. Check password history → 400 if reused. Other sessions invalidated.

### Tests for User Story 4

- [X] T038 [P] [US4] Test successful password change in `apps/api/tests/password-change.test.ts`
- [X] T039 [P] [US4] Test wrong current password rejection in `apps/api/tests/password-change.test.ts`
- [X] T040 [P] [US4] Test password history enforcement (last 5) in `apps/api/tests/password-change.test.ts`
- [X] T041 [P] [US4] Test other session invalidation on change in `apps/api/tests/password-change.test.ts`

### Implementation for User Story 4

- [X] T042 [P] [US4] Implement password history check logic (compare against last N hashes) per FR-027
- [X] T043 [US4] Implement `POST /auth/password/change` route in `apps/api/src/routes/password-change.ts` — current password verification, history check, hash update, session invalidation per contracts/README.md
- [X] T044 [US4] Wire login rate limiting (FR-025) and password policy (FR-026) to change endpoint
- [X] T045 [US4] Implement security notification email on password change per FR-024a

**Checkpoint**: Password change flow complete and independently testable

---

## Phase 7: User Story 5 - Password Reset (Priority: P1)

**Goal**: Users can reset forgotten passwords via email

**Independent Test**: Request reset → 200. Use token → password updated + sessions invalidated. Used/expired token rejected. Same message for unknown email.

### Tests for User Story 5

- [X] T046 [P] [US5] Test reset request in `apps/api/tests/password-reset.test.ts`
- [X] T047 [P] [US5] Test valid token resets password in `apps/api/tests/password-reset.test.ts`
- [X] T048 [P] [US5] Test expired/used token rejection in `apps/api/tests/password-reset.test.ts`
- [X] T049 [P] [US5] Test unknown email returns same message in `apps/api/tests/password-reset.test.ts`

### Implementation for User Story 5

- [X] T050 [P] [US5] Implement `apps/api/src/services/password-reset.service.ts` — token generation via `crypto.randomBytes(32)`, argon2id hashing for storage per FR-029/FR-035
- [X] T051 [P] [US5] Implement email dispatch service (nodemailer or SendGrid/SES adapter) per research.md
- [X] T052 [US5] Implement `POST /auth/password/reset/request` route in `apps/api/src/routes/password-reset-request.ts` — per-IP rate limited (FR-033), same 200 response for unknown email and rate-limited requests (FR-034) per contracts/README.md
- [X] T053 [US5] Implement `POST /auth/password/reset` route in `apps/api/src/routes/password-reset.ts` — token verification, password validation, hash update, all session invalidation (FR-032) per contracts/README.md

**Checkpoint**: Full auth lifecycle (register → login → change → reset → logout) complete

---

## Phase 8: Architecture Refactors (Post-Implementation)

**Purpose**: Address architecture review findings (V1–V4) to restore Clean Architecture boundaries

- [X] T059 [ARCH] Create `PasswordResetToken` entity in `packages/domain/src/entities/password-reset-token.ts` with `id`, `userId`, `tokenHash`, `expiresAt`, `usedAt`, `createdAt` fields per architecture_constitution.md
- [X] T060 [ARCH] Create `PasswordResetTokenRepository` interface in `packages/domain/src/repositories/password-reset-token.repository.ts` with `save`, `findByTokenHash`, `findByUserId`, `deleteExpired` methods
- [X] T061 [ARCH] Implement `PrismaPasswordResetTokenRepository` in `packages/infrastructure/src/persistence/prisma-password-reset-token.repository.ts` with `toDomain`/`toPersistence` mapping
- [X] T062 [ARCH] Implement `InMemoryPasswordResetTokenRepository` fake in `packages/domain/tests/repositories/` with Map-backed storage
- [X] T063 [ARCH] Create `RegisterUserUseCase` in `packages/domain/src/use-cases/register-user.ts` — extract entity construction + password history management from `apps/api/src/routes/register.ts`
- [X] T064 [ARCH] Create `ResetPasswordUseCase` in `packages/domain/src/use-cases/reset-password.ts` — extract token verification + password update + session invalidation from `apps/api/src/routes/password-reset.ts`
- [X] T065 [ARCH] Create `ChangePasswordUseCase` in `packages/domain/src/use-cases/change-password.ts` — extract current password verification + history check + hash update from `apps/api/src/routes/password-change.ts`
- [X] T066 [ARCH] Refactor `apps/api/src/routes/register.ts` to delegate to `RegisterUserUseCase` — route should only validate input and map Result to HTTP response
- [X] T067 [ARCH] Refactor `apps/api/src/routes/password-reset.ts` and `password-reset-request.ts` to use `PasswordResetTokenRepository` instead of direct `app.prisma` access
- [X] T068 [ARCH] Refactor `apps/api/src/routes/password-change.ts` to delegate to `ChangePasswordUseCase`
- [X] T069 [ARCH] Add all 9 repository implementations to barrel export in `packages/infrastructure/src/index.ts`
- [X] T070 [ARCH] Run `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm fresh-onion` — all must pass after refactors

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Security hardening, CORS, HTTPS enforcement, dependency scanning

- [X] T054 [P] Implement CORS configuration via `@fastify/cors` in `apps/api/src/index.ts` using `ASCIIDOCOLLAB_API_CORS_ORIGINS` env var per FR-038
- [X] T055 [P] Implement HTTPS redirect plugin (301 redirect for HTTP → HTTPS) per FR-020b
- [X] T056 [P] Add dependency vulnerability scanning to build pipeline (`pnpm audit`) per FR-021
- [X] T057 [P] Add environment config validation tests in `apps/api/tests/env-config.test.ts`
- [X] T057a [P] Verify log redaction of password/token fields across all routes per FR-020
- [X] T058 Run `pnpm build`, `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm fresh-onion` — all must pass

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories
- **US1 - Server (Phase 3)**: Depends on Foundational — no story dependencies
- **US2 - Registration (Phase 4)**: Depends on Foundational + US1 (server must be running)
- **US3 - Login (Phase 5)**: Depends on Foundational + US1 + US2 (needs registered users)
- **US4 - Password Change (Phase 6)**: Depends on US3 (needs active session)
- **US5 - Password Reset (Phase 7)**: Depends on US3 (login) but can be parallelized with US4
- **Architecture Refactors (Phase 8)**: Depends on all user stories being complete
- **Polish (Phase 9)**: Depends on architecture refactors being complete

### User Story Dependencies

- **US1 (P1)**: Can start after Foundational — no dependencies on other stories
- **US2 (P1)**: Can start after US1 (needs server) — no dependencies on US3-5
- **US3 (P1)**: Can start after US2 (needs users to log in)
- **US4 (P1)**: Can start after US3 (needs session/login)
- **US5 (P1)**: Can start after US3 (needs login context) — parallelizable with US4

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Models/services before route handlers
- Route handlers before integration
- Story complete before moving to next priority

### Parallel Opportunities

- All Setup Phase 1 [P] tasks can run in parallel
- All Foundational Phase 2 [P] tasks can run in parallel
- US4 and US5 can be implemented in parallel (different routes, services, tests)
- All test tasks within a story marked [P] can run in parallel
- Models and services marked [P] within a story can run in parallel

---

## Parallel Examples

### Phase 2 (Foundational)

```bash
Task: "Add Session model to Prisma schema"
Task: "Add PasswordResetToken model to Prisma schema"
Task: "Add passwordHistory column to User in Prisma schema"
Task: "Update User entity with passwordHistory field"
Task: "Update UserRepository interface"
Task: "Update in-memory fake for UserRepository"
Task: "Create env.ts config"
Task: "Create auth plugins"
Task: "Create rate-limit plugin"
```

### User Stories 4 + 5 (Parallel)

```bash
Task: "T042 Implement password history check logic"
Task: "T050 Implement password-reset.service.ts"
Task: "T051 Implement email dispatch service"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
3. Complete Phase 3: User Story 1 (server foundation)
4. **STOP and VALIDATE**: Health check + error handling working
5. Deploy/demo if ready

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. Add US1 (Server) → Health check, error handling, logging → Deploy/Demo
3. Add US2 (Registration) → User creation flow → Deploy/Demo
4. Add US3 (Login/Session) → Auth cycle → Deploy/Demo
5. Add US4 (Password Change) → Account security → Deploy/Demo
6. Add US5 (Password Reset) → Recovery flow → Deploy/Demo
7. Each story adds independent value without breaking previous stories

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: US1 (Server) → US2 (Registration) → US3 (Login)
   - Developer B (optional): US4 (Password Change) + US5 (Password Reset)
3. Stories complete and integrate independently

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Verify tests fail before implementing
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Password history (`passwordHistory` field) requires domain entity changes — see data-model.md
- Session encryption uses Prisma middleware with AES-256-GCM — see research.md
- All rate limit, timeout, and policy parameters are configurable via env vars (FR-037)
