# Tasks: Multi-User Registration & User Management

**Input**: Design documents from `/specs/010-user-registration-management/`

**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓, data-model.md ✓, contracts/ ✓, quickstart.md ✓

**Constitution**: TDD is NON-NEGOTIABLE. Every use case, entity computed property, and value object MUST have a failing test written BEFORE the implementation. In-memory fakes are used for all domain tests. Infrastructure adapters use integration tests with testcontainers.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing. Foundational tasks in Phase 2 must complete before any user story work begins.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no sequential dependency)
- **[Story]**: User story label — US1, US2, US3, US4 maps to spec.md stories
- Exact file paths are included in each description

---

## Phase 1: Setup (Database Schema)

**Purpose**: Update the Prisma schema and generate migrations. Blocks all other work.

- [x] T001 Update `packages/db/prisma/schema.prisma` — add `enum RegistrationMethod { SELF_REGISTERED INVITED }`; add `emailVerified Boolean @default(true)` and `registrationMethod RegistrationMethod @default(SELF_REGISTERED)` to User model; make AuditLog.userId nullable with `onDelete: SetNull`; add UserInvitation model (id, recipientEmail, invitedByUserId nullable, tokenHash unique, expiresAt, acceptedAt nullable, createdAt); add EmailVerificationToken model (id, userId, tokenHash unique, expiresAt, usedAt nullable, createdAt, cascade on user delete); add SystemSetting model (key @id, value String, updatedAt @updatedAt)
- [x] T002 Generate and run Prisma migration: `pnpm --filter @asciidocollab/db db:migrate` — migration name `add-user-registration-management`; verify all new tables and columns exist in the database

**Checkpoint**: Database schema up to date. All other tasks can proceed.

---

## Phase 2: Foundational (Domain + Infrastructure — Blocks All User Stories)

**Purpose**: Core building blocks shared across all user stories. Every use case in later phases depends on this phase completing first.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### Domain Layer

- [x] T003 Modify `packages/domain/src/entities/user.ts` — add `emailVerified: boolean` constructor parameter (default `false`) and `registrationMethod: 'SELF_REGISTERED' | 'INVITED'` (TypeScript string-literal union; export this type from `packages/domain/src/types/index.ts` as `RegistrationMethod`); update all existing callers in `packages/domain/src/use-cases/register-user.ts` and `packages/infrastructure/src/persistence/prisma-user.repository.ts` to pass `emailVerified: true` and `registrationMethod: 'SELF_REGISTERED'` for the initial setup user and existing mapped rows
- [x] T004 [P] Add value objects `packages/domain/src/value-objects/user-invitation-id.ts` and `packages/domain/src/value-objects/email-verification-token-id.ts` — UUID wrappers following the UserId/ProjectId pattern; add exports to `packages/domain/src/value-objects/index.ts`
- [x] T005 [P] Write unit tests for `packages/domain/src/entities/user-invitation.ts` in `packages/domain/tests/entities/user-invitation.test.ts` — test `isAccepted`, `isExpired`, `isValid` computed properties; confirm tests FAIL before entity exists
- [x] T006 [P] Implement `packages/domain/src/entities/user-invitation.ts` — fields: id (UserInvitationId), recipientEmail (Email), invitedByUserId (UserId | null), tokenHash (string), expiresAt (Date), acceptedAt (Date | null), createdAt (Date); computed: `isAccepted`, `isExpired`, `isValid`; make T005 tests pass
- [x] T007 [P] Write unit tests for `packages/domain/src/entities/email-verification-token.ts` in `packages/domain/tests/entities/email-verification-token.test.ts` — test `isUsed`, `isExpired`, `isValid`; confirm tests FAIL
- [x] T008 [P] Implement `packages/domain/src/entities/email-verification-token.ts` — fields: id (EmailVerificationTokenId), userId (UserId), tokenHash (string), expiresAt (Date), usedAt (Date | null), createdAt (Date); computed: `isUsed`, `isExpired`, `isValid`; make T007 tests pass
- [x] T009 [P] Add new domain error classes — `packages/domain/src/errors/invitation-already-pending.ts`, `packages/domain/src/errors/cannot-remove-self.ts`, `packages/domain/src/errors/cannot-modify-self-admin.ts`; add exports to `packages/domain/src/errors/index.ts`
- [x] T010 Extend `packages/domain/src/repositories/user.repository.ts` — add `findAll(): Promise<User[]>`, `delete(id: UserId): Promise<void>`, `countAdmins(): Promise<number>`; export from `packages/domain/src/repositories/index.ts`
- [x] T011 [P] Add `packages/domain/src/repositories/user-invitation.repository.ts` — interface with `save(invitation: UserInvitation): Promise<void>`, `findByTokenHash(tokenHash: string): Promise<UserInvitation | null>`, `findPendingByEmail(email: Email): Promise<UserInvitation | null>`; export from index
- [x] T012 [P] Add `packages/domain/src/repositories/email-verification-token.repository.ts` — interface with `save(token: EmailVerificationToken): Promise<void>`, `findByTokenHash(tokenHash: string): Promise<EmailVerificationToken | null>`, `deleteByUserId(userId: UserId): Promise<void>`; add `packages/domain/src/repositories/system-setting.repository.ts` — interface with `get(key: string): Promise<string | null>`, `set(key: string, value: string): Promise<void>`; add `packages/domain/src/repositories/session.repository.ts` — interface with `deleteByUserId(userId: UserId): Promise<void>`; export all from index
- [x] T013 [P] Add service interfaces `packages/domain/src/services/registration-invitation-notifier.ts` — `sendInvitation(recipientEmail: Email, rawToken: string, invitedBy: string): Promise<void>`; and `packages/domain/src/services/email-verification-notifier.ts` — `sendVerificationEmail(recipientEmail: Email, rawToken: string): Promise<void>`, `sendResendVerificationEmail(recipientEmail: Email, rawToken: string): Promise<void>`; export from `packages/domain/src/services/index.ts`
- [x] T014 Extend `packages/domain/src/services/token-generator.ts` — add `generateInvitationToken(): PasswordResetTokenData` (72 h TTL) and `generateEmailVerificationToken(): PasswordResetTokenData` (24 h TTL) to the `TokenGenerator` interface; add corresponding TTL constants in `packages/domain/src/constants.ts`

### In-Memory Fakes (Test Infrastructure — Required for All Use Case Tests)

- [x] T015 Update `packages/domain/tests/repositories/` in-memory user repository — add `findAll()`, `delete()`, `countAdmins()` implementations to the existing `InMemoryUserRepository` fake; ensure behaviour matches interface semantics (e.g., countAdmins counts users with isAdmin=true)
- [x] T016 [P] Create `packages/domain/tests/repositories/in-memory-user-invitation.repository.ts` — in-memory implementation of `UserInvitationRepository`; same error conditions and lookup semantics as Prisma version; no mocking libraries; **depends on T011** (interface must be defined first)
- [x] T017 [P] Create `packages/domain/tests/repositories/in-memory-email-verification-token.repository.ts` and `packages/domain/tests/repositories/in-memory-system-setting.repository.ts` — in-memory implementations of their respective interfaces; `deleteByUserId` removes all tokens for that user; `get`/`set` use a plain Map; **depends on T012** (interfaces must be defined first)
- [x] T018 [P] Create `packages/domain/tests/repositories/in-memory-session.repository.ts` — in-memory implementation of `SessionRepository`; tracks deleted user IDs for test assertions; **depends on T012** (interface must be defined first)

### Infrastructure Layer

- [x] T019 Update `packages/infrastructure/src/persistence/prisma-user.repository.ts` — add `findAll()` (returns all users), `delete(id)` (Prisma `deleteMany` by id), `countAdmins()` (Prisma `count` where isAdmin=true); update mapper to include `emailVerified` from the new schema column
- [x] T020 Update `packages/infrastructure/src/services/crypto-token-generator.ts` — add `generateInvitationToken()` (72 h TTL) and `generateEmailVerificationToken()` (24 h TTL) using the same `crypto.randomBytes(32)` + SHA-256 pattern as `generatePasswordResetToken()`; add tests in `packages/infrastructure/tests/services/crypto-token-generator.test.ts`
- [x] T021 [P] Create `packages/infrastructure/src/persistence/prisma-user-invitation.repository.ts` — Prisma-backed implementation of `UserInvitationRepository`; map Prisma model to `UserInvitation` domain entity; handle null `invitedByUserId`
- [x] T022 [P] Create `packages/infrastructure/src/persistence/prisma-email-verification-token.repository.ts` — Prisma-backed implementation of `EmailVerificationTokenRepository`; `deleteByUserId` uses Prisma `deleteMany`
- [x] T023 [P] Create `packages/infrastructure/src/persistence/prisma-system-setting.repository.ts` — Prisma-backed `SystemSettingRepository`; `get` returns `null` when key absent (means default false for openRegistration); `set` uses `upsert`
- [x] T024 [P] Create `packages/infrastructure/src/persistence/prisma-session.repository.ts` — Prisma-backed `SessionRepository`; `deleteByUserId` deletes all rows from `Session` table where `userId = id`; export all new repositories from `packages/infrastructure/src/persistence/index.ts`
- [x] T025 [P] Create `packages/infrastructure/src/services/smtp-registration-invitation-notifier.ts` — implements `RegistrationInvitationNotifier`; injects `EmailSender`, subject, and HTML template with `{token}` and `{invitedBy}` placeholders; follows same pattern as `SmtpPasswordResetNotifier`
- [x] T026 [P] Create `packages/infrastructure/src/services/smtp-email-verification-notifier.ts` — implements `EmailVerificationNotifier`; two methods (initial send + resend) with separate HTML templates; injects `EmailSender`; export both from `packages/infrastructure/src/services/index.ts`

### Shared DTOs and API Plugins

- [x] T027 [P] Create `packages/shared/src/dtos/admin.dto.ts` — export `AdminUserDto` (id, email, displayName, isAdmin, emailVerified, registrationMethod: 'SELF_REGISTERED' | 'INVITED', createdAt), `AdminSettingsDto` (openRegistration), `InviteUserDto` (email), `AcceptInviteDto` (token, displayName, password), `UserRemovalPreviewDto` (projectsToTransfer array); add exports to `packages/shared/src/dtos/index.ts`
- [x] T028 [P] Create `apps/api/src/plugins/require-admin.ts` — Fastify preHandler that returns 403 `{ error: { code: 'PERMISSION_DENIED' } }` if `request.session.isAdmin !== true`; use same pattern as existing `require-auth.ts`; **depends on T086** for `session.isAdmin` to be typed and populated
- [x] T029 [P] Create `apps/api/src/plugins/require-email-verified.ts` — Fastify preHandler that returns 403 `{ error: { code: 'EMAIL_NOT_VERIFIED' } }` if session exists but `request.session.emailVerified !== true`; **session type extensions (isAdmin and emailVerified) are handled by T086** — do not separately add to `apps/api/src/types/session.ts`; **MUST be registered as a scoped preHandler on specific route prefixes** (e.g. `app.addHook('preHandler', requireEmailVerified)` inside a scoped `app.register()` block), NOT as a global hook — global registration would incorrectly gate `/auth/session-status`, `/auth/resend-verification`, `/auth/verify-email`, and other exempt routes

- [x] T086 Extend `LoginResult` in `packages/domain/src/use-cases/login.ts` to include `emailVerified: boolean` and `isAdmin: boolean`; update `LoginUseCase.execute()` to return `{ userId: user.id.value, emailVerified: user.emailVerified, isAdmin: user.isAdmin }` — the `user` object is already loaded, so no extra DB query; update `apps/api/src/routes/login.ts` to set `request.session.emailVerified = result.value.emailVerified` and `request.session.isAdmin = result.value.isAdmin` after successful authentication; **P0 constitution fix: replace `request.body as LoginDto` with Fastify typed route — change handler to `app.post<{ Body: LoginDto }>('/auth/login', opts, async (request, reply) => {` so `request.body` is inferred without an `as` cast**; update `apps/api/src/types/session.ts` to add `isAdmin?: boolean` and `emailVerified?: boolean` fields (T029 and T028 reference these — both depend on this task); update existing LoginUseCase tests to assert the new return fields; **must come after T003** (User entity must have emailVerified and isAdmin)
- [x] T087 [P] Create `apps/api/src/routes/session-status.ts` — `GET /auth/session-status`: **no** `requireAuth` or `requireEmailVerified` prehandler (handles its own check — must remain accessible to unauthenticated and unverified callers); reads directly from `request.session` without an additional DB query (Fastify session middleware already decrypts and loads session data on each request); returns `{ authenticated: true, emailVerified: boolean, isAdmin: boolean }` when `session.userId` exists, or `{ authenticated: false }` when no session; register route in `apps/api/src/index.ts` **outside any scoped plugin that applies requireEmailVerified**; add `INTERNAL_API_URL` to `apps/web/.env.example` (e.g. `http://localhost:4000` for development, pointing to Fastify's non-public internal hostname in production) — this env var is consumed by the Next.js middleware (T054) to call this endpoint server-side without client-readable cookies
- [x] T088 [P] Extend `apps/api/src/config/schema.ts` with new config entries — invitation email: `auth.invitation.subject` (string), `auth.invitation.htmlTemplate` (string, placeholders `{token}` and `{invitedBy}`), `auth.invitation.rateLimitMax` (number), `auth.invitation.rateLimitWindow` (string); email verification: `auth.emailVerification.subject` (string), `auth.emailVerification.htmlTemplate` (string, placeholder `{token}`), `auth.emailVerification.resendSubject` (string), `auth.emailVerification.resendHtmlTemplate` (string); admin invite: `admin.invite.rateLimitMax` (number), `admin.invite.rateLimitWindow` (string); add corresponding default values to `apps/api/config/`; update T025, T026 (SMTP notifiers) and T034, T049 (rate-limited routes) to reference these config keys instead of hardcoded values

**Checkpoint**: Foundation complete. User story phases can now begin.

---

## Phase 3: User Story 1 — Admin Invites a New User (Priority: P1) 🎯 MVP

**Goal**: An admin can send a registration invitation email; the recipient clicks the link, sets a display name and password, and gets an account immediately verified.

**Independent Test**: Log in as admin → `/dashboard/admin/users` → send invitation → open mail catcher → click link → complete registration form → confirm redirect to dashboard. Also: reuse link → error; expired link → error.

### Tests — User Story 1

- [x] T030 [P] [US1] Write unit tests for `SendUserInvitationUseCase` in `packages/domain/tests/use-cases/send-user-invitation.test.ts` — test: actor not admin → PermissionDeniedError; email already registered → DuplicateEmailError; pending invitation exists → InvitationAlreadyPendingError; SMTP throws → no record saved (atomicity); success → invitation saved + notifier called; confirm tests FAIL before use case exists
- [x] T031 [P] [US1] Write unit tests for `AcceptUserInvitationUseCase` in `packages/domain/tests/use-cases/accept-user-invitation.test.ts` — test: token not found → InvalidTokenError; token expired → InvalidTokenError; token already accepted → InvalidTokenError; password policy violation → ValidationError; email already registered (race) → DuplicateEmailError; success → User created with emailVerified=true, invitation acceptedAt set, audit log written; confirm tests FAIL

### Implementation — User Story 1

- [x] T032 [US1] Implement `packages/domain/src/use-cases/send-user-invitation.ts` — `SendUserInvitationUseCase`: verify actor isAdmin; check email not already registered; check no pending invitation for email (`invitationRepo.findPendingByEmail`); generate raw token via `tokenGenerator.generateInvitationToken()`; **send invitation email first** via notifier (throws propagate atomically); save `UserInvitation` to repo only on email success; write AuditLog `user.invitation_sent`; make T030 tests pass
- [x] T033 [US1] Implement `packages/domain/src/use-cases/accept-user-invitation.ts` — `AcceptUserInvitationUseCase`: hash raw token; look up invitation; validate `isValid`; validate display name (non-empty, ≤100 chars) and password (policy + breach check); check email not already taken (race guard); create `User` with `emailVerified=true` and `registrationMethod='INVITED'`, hash password; save user; mark `invitation.acceptedAt = now()` and save; write AuditLog `user.invitation_accepted`; make T031 tests pass
- [x] T034 [P] [US1] Create `apps/api/src/routes/admin/users-invite.ts` — `POST /admin/users/invite`: requireAdmin; schema validation (`email` string, format email); call `SendUserInvitationUseCase`; map `DuplicateEmailError` → 409 `DUPLICATE_EMAIL`; map `InvitationAlreadyPendingError` → 409 `INVITATION_ALREADY_PENDING`; success → 202 `{ message: 'Invitation sent' }`; rate-limited
- [x] T035 [P] [US1] Create `apps/api/src/routes/accept-invite.ts` — `GET /auth/accept-invite?token=...`: hash token; look up `UserInvitationRepository.findByTokenHash`; if invalid/expired/accepted → 400 `INVALID_TOKEN`; else → 200 `{ email: string }`; `POST /auth/accept-invite`: schema validation (token, displayName, password); call `AcceptUserInvitationUseCase`; on success set `request.session.userId = userId.value`, `request.session.emailVerified = true`, and `request.session.isAdmin = false` (invited users are never admin on creation); 201 `{ message: 'Account created' }`; map errors to appropriate HTTP codes
- [x] T036 [US1] Wire `SendUserInvitationUseCase` and `AcceptUserInvitationUseCase` in `apps/api/src/index.ts` — instantiate `PrismaUserInvitationRepository`, `SmtpRegistrationInvitationNotifier` (with template from config); register `accept-invite.ts` and `admin/users-invite.ts` routes; update `request.server.repos` type declarations
- [x] T037 [P] [US1] Create `apps/web/src/app/(auth)/accept-invite/page.tsx` and `apps/web/src/app/(auth)/accept-invite/accept-invite-form.tsx` — on mount call `GET /auth/accept-invite?token=...`; show "invalid/expired" state or the registration completion form (email read-only, display name, password); on submit call `POST /auth/accept-invite`; on 201 redirect to `/dashboard`; Zod validation on form
- [x] T038 [US1] Create `apps/web/src/app/(dashboard)/dashboard/admin/users/page.tsx` (SSR) and `apps/web/src/app/(dashboard)/dashboard/admin/users/users-client.tsx` — admin-only page (redirect to `/403` if not admin); implement the "Invite User" section: email input + submit button; call `POST /admin/users/invite`; show success/error inline messages; extend `apps/web/src/lib/api.ts` with `inviteUser(email: string): Promise<void>`
- [x] T039 [US1] Add "Users" admin link to sidebar/nav — `apps/web/src/app/(dashboard)/layout.tsx` or the navigation component — show link only when `session.isAdmin`; route: `/dashboard/admin/users`

### Integration Tests — User Story 1

- [x] T040 [P] [US1] Write Prisma integration tests for `PrismaUserInvitationRepository` in `packages/infrastructure/tests/persistence/prisma-user-invitation.repository.test.ts` — test save, findByTokenHash (found/not found), findPendingByEmail; use testcontainers

**Checkpoint**: User Story 1 fully functional. Admin can invite users; invitees can complete registration.

---

## Phase 4: User Story 2 — New User Self-Registers via Login Page (Priority: P2)

**Goal**: When open registration is enabled, a visitor can self-register; the system creates an unverified account and sends a verification email; only after clicking the link can the user access the application.

**Independent Test**: Enable open registration as admin → visit login page → click "Create an account" → submit form → open mail catcher → click verification link → confirm redirect to dashboard. Also: unverified user login → redirected to interstitial.

### Tests — User Story 2

- [x] T041 [P] [US2] Extend `RegisterUseCase` tests (file: `packages/domain/tests/use-cases/register-user.test.ts`) — add cases: open registration disabled → RegistrationClosedError; email already registered → use case returns success (anti-enumeration — no error exposed); open registration enabled → User created with emailVerified=false; email send fails → no user saved (atomicity); confirm new test cases FAIL before changes
- [x] T042 [P] [US2] Write unit tests for `VerifyEmailUseCase` in `packages/domain/tests/use-cases/verify-email.test.ts` — test: token not found → InvalidTokenError; token expired → InvalidTokenError; token already used → InvalidTokenError; success → token marked usedAt, User.emailVerified set true, audit log written, **result contains `{ userId: UserId, isAdmin: boolean }` for session population by the route**; confirm tests FAIL
- [x] T043 [P] [US2] Write unit tests for `ResendVerificationEmailUseCase` in `packages/domain/tests/use-cases/resend-verification-email.test.ts` — test: already verified → no-op (success); unverified → old tokens deleted, new token created, email sent; SMTP failure is non-fatal (logged, no error returned); confirm tests FAIL

### Implementation — User Story 2

- [x] T044 [US2] Refactor `packages/domain/src/use-cases/register-user.ts` — **rename class from `RegisterUserUseCase` to `RegisterUseCase`; update all import sites** (register.ts route, any tests); add `SystemSettingRepository` and `EmailVerificationTokenRepository` and `EmailVerificationNotifier` as constructor deps; branch on `userRepo.hasAny()`: false → existing first-user path (emailVerified=true, isAdmin=true, registrationMethod='SELF_REGISTERED'); true → check `systemSettingRepo.get("openRegistration")`: not "true" → RegistrationClosedError; "true" → validate password, create User with emailVerified=false and registrationMethod='SELF_REGISTERED', **send verification email first** (atomic: if notifier throws, no user saved), create EmailVerificationToken via `tokenGenerator.generateEmailVerificationToken()`, save token; if email already registered: send nothing, return success (anti-enumeration); write audit log `auth.self_registered`; make T041 tests pass
- [x] T045 [US2] Implement `packages/domain/src/use-cases/verify-email.ts` — `VerifyEmailUseCase`: hash raw token; look up `EmailVerificationTokenRepository.findByTokenHash`; validate `isValid`; mark `usedAt = now()` on token, save; load User by token.userId, set `emailVerified = true`, save; write audit log `auth.email_verified`; **return `{ userId: UserId, isAdmin: boolean }` from the loaded user** (enables route handler to create or refresh session without a second DB call); make T042 tests pass
- [x] T046 [US2] Implement `packages/domain/src/use-cases/resend-verification-email.ts` — `ResendVerificationEmailUseCase`: load user by userId from session; if `emailVerified=true` → return success silently; `emailVerificationTokenRepo.deleteByUserId(userId)`; generate new token via `tokenGenerator.generateEmailVerificationToken()`; save token; send resend email via notifier (failure logged but not propagated per FR-010 spec); make T043 tests pass
- [x] T047 [P] [US2] Update `apps/api/src/routes/register.ts` — call refactored `RegisterUseCase` (renamed from `RegisterUserUseCase`) with new constructor deps; **P0 constitution fix: replace `request.body as RegisterDto` with Fastify typed route — change handler signature to `app.post<{ Body: RegisterDto }>('/auth/register', opts, async (request, reply) => {` so `request.body` is inferred as `RegisterDto` without an `as` cast**; first-user (201) path sets `request.session.emailVerified = true` and `request.session.isAdmin = true` (admin is auto-verified and auto-logged-in); self-registration success returns 202 `{ message: 'Check your email to verify your account' }` (no session set — user must verify email before accessing the app); `RegistrationClosedError` → 403 `REGISTRATION_CLOSED`; password validation → 400 (anti-enumeration: duplicate email returns 202, no error)
- [x] T048 [P] [US2] Create `apps/api/src/routes/verify-email.ts` — `GET /auth/verify-email?token=...`: call `VerifyEmailUseCase` (returns `{ userId, isAdmin }`); **always create/overwrite the session** regardless of whether one already exists — set `request.session.userId = result.userId.value`, `request.session.emailVerified = true`, `request.session.isAdmin = result.isAdmin`; this handles both cases: (a) user verifying from a fresh device with no session (self-register flow — user has no session after the 202), and (b) already-logged-in unverified user; 200 `{ message: 'Email verified' }`; `InvalidTokenError` → 400 `INVALID_TOKEN`; no rate limit needed (token is single-use with 256-bit entropy — T045 enforces single-use)
- [x] T049 [P] [US2] Create `apps/api/src/routes/resend-verification.ts` — `POST /auth/resend-verification`: requireAuth only (NOT requireEmailVerified — this endpoint is exempt); call `ResendVerificationEmailUseCase`; always return 202 `{ message: 'Verification email sent' }`; rate-limited
- [x] T050 [US2] Wire new use cases and routes in `apps/api/src/index.ts` — instantiate `PrismaEmailVerificationTokenRepository`, `SmtpEmailVerificationNotifier`; pass new deps to refactored `RegisterUseCase`; register `verify-email.ts` and `resend-verification.ts` routes; ensure `resend-verification` is excluded from `requireEmailVerified` plugin scope
- [x] T051 [US2] Update `apps/web/src/app/(auth)/register/page.tsx` and `register-form.tsx` — on 202 response: replace form with "Check your email" message; on 201 (first user): existing redirect to dashboard; add server-side gate: if setup complete and openRegistration=false → redirect to `/login`; call `GET /auth/open-registration-status` at page load
- [x] T052 [P] [US2] Create `apps/web/src/app/(auth)/verify-email/page.tsx` — reads `?token=` from URL; calls `GET /auth/verify-email?token=...` on mount; success state: "Email verified, redirecting…" + auto-redirect to dashboard after 2s; error states: "invalid/used" and "expired" with resend button that calls `POST /auth/resend-verification`
- [x] T053 [P] [US2] Create `apps/web/src/app/(auth)/verify-email-required/page.tsx` — interstitial shown to authenticated but unverified users; displays user's email address; "Resend verification email" button calls `POST /auth/resend-verification`; feedback on success/failure
- [x] T054 [US2] Create or update `apps/web/src/middleware.ts` — for each non-static, non-public request, call `GET /auth/session-status` on the Fastify API server-side by forwarding the browser's `Cookie` header (use `INTERNAL_API_URL` env var so the call goes to the internal hostname in production, bypassing the public internet); use the response to gate access: if `authenticated=false` and path requires auth → redirect to `/login`; if `authenticated=true` and `emailVerified=false` and path is not in the exemption list (`/verify-email`, `/verify-email-required`) → redirect to `/verify-email-required`; **this is the most secure approach**: the source of truth is the server-side Fastify session — no client-readable cookies that could be tampered with; the Fastify `requireEmailVerified` plugin remains the authoritative API-level gate; this middleware is the frontend defense-in-depth layer; **depends on T087** (session-status endpoint must exist)

### Integration Tests — User Story 2

- [x] T055 [P] [US2] Write Prisma integration tests for `PrismaEmailVerificationTokenRepository` in `packages/infrastructure/tests/persistence/prisma-email-verification-token.repository.test.ts` — test save, findByTokenHash, deleteByUserId; use testcontainers

**Checkpoint**: User Story 2 fully functional. Visitors can self-register and verify email. Unverified users are gated.

---

## Phase 5: User Story 3 — Administrator Views and Manages Users (Priority: P2)

**Goal**: Admin can view all users, change admin status, and remove users (with ownership transfer warning for sole-owned projects; session invalidation on removal).

**Independent Test**: Create multiple users → navigate to `/dashboard/admin/users` → verify all users listed with correct fields → toggle admin status → remove a sole-owner user → verify project transferred → verify removed user's session is invalid.

### Tests — User Story 3

- [x] T056 [P] [US3] Write unit tests for `ListUsersUseCase` in `packages/domain/tests/use-cases/list-users.test.ts` — test: actor not admin → PermissionDeniedError; success → returns all users; confirm tests FAIL
- [x] T057 [P] [US3] Write unit tests for `SetAdminStatusUseCase` in `packages/domain/tests/use-cases/set-admin-status.test.ts` — test: actor not admin → PermissionDeniedError; actor targets self → CannotModifySelfAdminError; target is last admin being demoted → CannotRemoveLastAdminError; success → user.isAdmin updated, audit log written; confirm tests FAIL
- [x] T058 [P] [US3] Write unit tests for `RemoveUserUseCase` in `packages/domain/tests/use-cases/remove-user.test.ts` — test: actor not admin → PermissionDeniedError; actor is target → CannotRemoveSelfError; target is last admin → CannotRemoveLastAdminError; sole-owner projects transferred to actor; sessions deleted before user deletion; hard delete completes; audit log includes transferred project IDs; confirm tests FAIL

### Implementation — User Story 3

- [x] T059 [US3] Add `findSoleOwnerProjects(userId: UserId): Promise<Array<{ id: ProjectId; name: string }>>` to `packages/domain/src/repositories/project-member.repository.ts`; add implementation to `packages/infrastructure/src/persistence/prisma-project-member.repository.ts` (query: projects where user is OWNER role and no other OWNER member exists); update in-memory project-member fake in test suite
- [x] T060 [US3] Implement `packages/domain/src/use-cases/list-users.ts` — `ListUsersUseCase`: verify actor isAdmin; return `userRepo.findAll()`; make T056 tests pass
- [x] T061 [US3] Implement `packages/domain/src/use-cases/set-admin-status.ts` — `SetAdminStatusUseCase`: verify actor isAdmin; verify actorId !== targetId (CannotModifySelfAdminError); if demoting: verify `userRepo.countAdmins() > 1` (CannotRemoveLastAdminError); update User.isAdmin via `userRepo.save(updatedUser)`; write AuditLog `user.admin_granted` or `user.admin_revoked`; make T057 tests pass
- [x] T062 [US3] Implement `packages/domain/src/use-cases/remove-user.ts` — `RemoveUserUseCase`: verify actor isAdmin; verify actorId !== targetId (CannotRemoveSelfError); if target isAdmin verify `countAdmins() > 1` (CannotRemoveLastAdminError); call `projectMemberRepo.findSoleOwnerProjects(targetId)`; for each project add actor as OWNER member; call `sessionRepo.deleteByUserId(targetId)`; call `userRepo.delete(targetId)` (cascades memberships, tokens); write AuditLog `user.removed` with transferred project IDs; make T058 tests pass
- [x] T063 [P] [US3] Create `apps/api/src/routes/admin/users.ts` — `GET /admin/users`: requireAdmin + requireEmailVerified; call `ListUsersUseCase`; return `{ users: AdminUserDto[] }`; `GET /admin/users/:id/removal-preview`: requireAdmin; call `projectMemberRepo.findSoleOwnerProjects(targetId)`; return `UserRemovalPreviewDto`
- [x] T064 [P] [US3] Create `apps/api/src/routes/admin/users-admin-status.ts` — `PATCH /admin/users/:id/admin`: requireAdmin + requireEmailVerified; schema: `{ isAdmin: boolean }`; call `SetAdminStatusUseCase`; map `CannotModifySelfAdminError` → 403 `CANNOT_MODIFY_SELF`; map `CannotRemoveLastAdminError` → 403 `CANNOT_REMOVE_LAST_ADMIN`; map `UserNotFoundError` → 404; 200 `{ message: 'Admin status updated' }`
- [x] T065 [P] [US3] Create `apps/api/src/routes/admin/users-remove.ts` — `DELETE /admin/users/:id`: requireAdmin + requireEmailVerified; call `RemoveUserUseCase`; map `CannotRemoveSelfError` → 403 `CANNOT_REMOVE_SELF`; map `CannotRemoveLastAdminError` → 403 `CANNOT_REMOVE_LAST_ADMIN`; map `UserNotFoundError` → 404; 200 `{ message: 'User removed', projectsTransferred: string[] }`
- [x] T066 [US3] Wire US3 routes and repositories in `apps/api/src/index.ts` — register `admin/users.ts`, `admin/users-admin-status.ts`, `admin/users-remove.ts`; pass `PrismaSessionRepository` to `RemoveUserUseCase`
- [x] T067 [US3] Extend `apps/web/src/app/(dashboard)/dashboard/admin/users/users-client.tsx` with user list table — columns: Display Name, Email, Admin badge, Email Verified badge, Actions; "Make Admin / Remove Admin" toggle (disabled for self; calls `PATCH /admin/users/:id/admin`; optimistic UI update); "Remove" button opens confirmation dialog; extend `apps/web/src/lib/api.ts` with `getAdminUsers()`, `setAdminStatus()`, `getUserRemovalPreview()`, `removeUser()`
- [x] T068 [US3] Implement removal confirmation dialog in `apps/web/src/app/(dashboard)/dashboard/admin/users/users-client.tsx` — on dialog open call `GET /admin/users/:id/removal-preview`; if `projectsToTransfer.length > 0` show warning list; "Confirm removal" button calls `DELETE /admin/users/:id`; on success remove user from local list

### Integration Tests — User Story 3

- [x] T069 [P] [US3] Write Prisma integration tests for `PrismaSessionRepository` in `packages/infrastructure/tests/persistence/prisma-session.repository.test.ts` — test `deleteByUserId` deletes all session rows for that user; use testcontainers

**Checkpoint**: User Story 3 fully functional. Admins can view, promote/demote, and remove users.

---

## Phase 6: User Story 4 — Controlling Open Registration (Priority: P3)

**Goal**: Admin can enable/disable open self-registration at runtime from the user management page; the login page reflects the change immediately.

**Independent Test**: Navigate to `/dashboard/admin/users` as admin → toggle open registration off → sign out → visit `/login` → confirm no "Create an account" link and direct navigation to `/register` is blocked; toggle back on → confirm link reappears.

### Tests — User Story 4

- [x] T070 [P] [US4] Write unit tests for `GetOpenRegistrationUseCase` and `SetOpenRegistrationUseCase` in `packages/domain/tests/use-cases/set-open-registration.test.ts` — test: set to true/false persists; get returns current value; get with no row returns false (default); SetOpenRegistration: actor not admin → PermissionDeniedError; success → audit log written; confirm tests FAIL

### Implementation — User Story 4

- [x] T071 [US4] Implement `packages/domain/src/use-cases/get-open-registration.ts` and `packages/domain/src/use-cases/set-open-registration.ts` — `GetOpenRegistrationUseCase`: calls `systemSettingRepo.get("openRegistration")`; returns `{ enabled: boolean }` (absent key = false); `SetOpenRegistrationUseCase`: verify actor isAdmin; calls `systemSettingRepo.set("openRegistration", value ? "true" : "false")`; write AuditLog `settings.open_registration_changed`; make T070 tests pass
- [x] T072 [P] [US4] Create `apps/api/src/routes/open-registration-status.ts` — `GET /auth/open-registration-status`: no auth required; call `GetOpenRegistrationUseCase`; return `{ openRegistration: boolean }`; rate-limited (prevent scraping)
- [x] T073 [P] [US4] Create `apps/api/src/routes/admin/settings.ts` — `GET /admin/settings`: requireAdmin + requireEmailVerified; call `GetOpenRegistrationUseCase`; return `AdminSettingsDto`; `PATCH /admin/settings`: requireAdmin + requireEmailVerified; schema `{ openRegistration?: boolean }`; call `SetOpenRegistrationUseCase`; return updated `AdminSettingsDto`
- [x] T074 [US4] Wire US4 in `apps/api/src/index.ts` — instantiate `PrismaSystemSettingRepository`; pass to `GetOpenRegistrationUseCase`, `SetOpenRegistrationUseCase`, and the refactored `RegisterUseCase` (already needs it from Phase 4); register `open-registration-status.ts` and `admin/settings.ts` routes; extend `apps/web/src/lib/api.ts` with `getOpenRegistrationStatus()`, `getAdminSettings()`, `updateAdminSettings()`
- [x] T075 [US4] Add open registration toggle to `apps/web/src/app/(dashboard)/dashboard/admin/users/users-client.tsx` — toggle switch bound to `GET/PATCH /admin/settings`; loads current setting on mount; change is persisted immediately via `PATCH /admin/settings`; no page reload needed
- [x] T076 [US4] Update `apps/web/src/app/(auth)/login/login-form.tsx` — fetch `GET /auth/open-registration-status` on component mount; conditionally render "Create an account" link to `/register` only when `openRegistration === true`
- [x] T077 [US4] Enforce open registration gate in `apps/web/src/app/(auth)/register/page.tsx` — if setup is complete and `openRegistration === false`: server-side redirect to `/login`; this prevents direct navigation to `/register` when registration is closed (FR-005a frontend supplement)

### Integration Tests — User Story 4

- [x] T078 [P] [US4] Write Prisma integration tests for `PrismaSystemSettingRepository` in `packages/infrastructure/tests/persistence/prisma-system-setting.repository.test.ts` — test get (absent key → null), set (upsert creates and updates), persists across reconnect; use testcontainers

**Checkpoint**: All four user stories are fully functional.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: E2E tests, rate limiting verification, and quickstart validation.

- [x] T079 [P] Write Playwright E2E spec `apps/web/e2e/registration-invitation.spec.ts` — covers User Story 1 acceptance scenarios (admin sends invite, invitee completes registration, expired link, already-used link, duplicate email rejection)
- [x] T080 [P] Write Playwright E2E spec `apps/web/e2e/self-registration.spec.ts` — covers User Story 2 acceptance scenarios (open registration flow, verification email, unverified user gate, resend verification, anti-enumeration, disabled registration blocking)
- [x] T081 [P] Write Playwright E2E spec `apps/web/e2e/user-management.spec.ts` — covers User Story 3 acceptance scenarios (user list visible, admin toggle, self-demotion/self-removal blocked, last-admin protection, sole-owner project transfer, session invalidation on removal)
- [x] T082 [P] Write Playwright E2E spec `apps/web/e2e/open-registration-toggle.spec.ts` — covers User Story 4 acceptance scenarios (toggle on/off, login page link appears/disappears, direct navigation to /register blocked when disabled, persists across reload)
- [x] T083 Verify rate limiting is applied to all new endpoints — `POST /auth/register` (existing), `POST /auth/resend-verification`, `GET /auth/open-registration-status`, `POST /admin/users/invite`, `POST /auth/accept-invite` — confirm rate limit config in `apps/api/src/config/schema.ts` and route registrations
- [x] T084 Run full test suite and verify all tests pass — `pnpm test` from repo root; `pnpm typecheck`; `pnpm lint`; fix any failures
- [x] T085 Validate quickstart.md flows manually against the running application — follow all 4 flows in `specs/010-user-registration-management/quickstart.md`; confirm each acceptance scenario from spec.md passes

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundational)**: Depends on Phase 1 (T001–T002) — BLOCKS all user stories
- **Phase 3 (US1)**: Depends on Phase 2 completion — can start immediately after
- **Phase 4 (US2)**: Depends on Phase 2 completion — T054 additionally depends on T087 (session-status endpoint)
- **Phase 5 (US3)**: Depends on Phase 2 completion — can run in parallel with Phases 3/4
- **Phase 6 (US4)**: Depends on Phase 2 completion — can run in parallel with Phases 3/4/5
- **Phase 7 (Polish)**: Depends on all desired user story phases being complete

### User Story Dependencies (Within Each Story)

1. Tests (marked in groups above) → written first, must FAIL
2. Domain use cases → written to make tests pass
3. Infrastructure adapters → Prisma repos, SMTP notifiers
4. API routes → wire repositories + use cases
5. Composition root (index.ts wiring) → after routes exist
6. Frontend → after API routes exist
7. Integration tests → can run alongside domain tests

### Within Phase 2 (Foundational)

- T003 (User entity) → T019 (PrismaUserRepository update) → T015 (InMemoryUserRepository update)
- T003 → **T086** (LoginUseCase + login.ts session fields — requires emailVerified/isAdmin on User)
- **T086** → T028 (requireAdmin plugin — session.isAdmin must be typed)
- **T086** → T029 (requireEmailVerified plugin — session.emailVerified must be typed)
- T004–T013 can all run in parallel (different files)
- T015–T018 (fakes) can run in parallel — all depend on T011–T012 interfaces being defined
- T019–T026 (infra) can run in parallel — depend on interfaces (T006–T013)
- T027, T028, T029, T087, T088 can run in parallel (different files) — T028/T029 require T086 to be merged first

### Parallel Opportunities

**Within Phase 2**: T004, T005, T007, T009, T011, T013, T027, T028, T029 can all start simultaneously after T001–T002.

**Within Phase 3 (US1)**: T030 and T031 (test writing) can run in parallel; T032 and T033 (use cases) can run in parallel after their respective tests; T034 and T035 (routes) can run in parallel; T037 (frontend) can start alongside route work.

**Across Phases 3–6**: All four user story phases can proceed in parallel once Phase 2 is complete (if multiple developers are available).

---

## Parallel Example: Phase 3 (User Story 1)

```bash
# Write tests in parallel (both fail):
Task T030: "Write unit tests for SendUserInvitationUseCase"
Task T031: "Write unit tests for AcceptUserInvitationUseCase"

# Implement use cases in parallel after tests exist:
Task T032: "Implement SendUserInvitationUseCase"
Task T033: "Implement AcceptUserInvitationUseCase"

# Build API routes in parallel after use cases pass:
Task T034: "Create admin/users-invite.ts route"
Task T035: "Create accept-invite.ts route"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Schema (T001–T002)
2. Complete Phase 2: Foundational (T003–T029)
3. Complete Phase 3: US1 — Admin Invites (T030–T040)
4. **STOP and VALIDATE**: Run quickstart.md Flow 1; verify invitation flow end-to-end
5. Demo admin invitation to stakeholders if ready

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. US1 (P1) → Admin invitation → test independently → **MVP**
3. US2 (P2) → Self-registration + email verification → test independently
4. US3 (P2) → Admin user management → test independently
5. US4 (P3) → Open registration toggle → test independently
6. Polish (E2E, rate limiting, quickstart) → Production-ready

### Parallel Team Strategy

With multiple developers (after Phase 2 is complete):
- Developer A: User Story 1 (T030–T040)
- Developer B: User Story 2 (T041–T055)
- Developer C: User Story 3 (T056–T069) + User Story 4 (T070–T078)

---

## Notes

- `[P]` tasks touch different files with no cross-task dependency — safe to run in parallel
- `[Story]` label traces each task to its user story for traceability
- TDD is mandatory: always confirm tests FAIL before writing production code
- Commit after each logical group (use case + its tests, or route + integration test)
- Use `pnpm lint && pnpm typecheck` before committing — quality gates from the constitution
- Anti-enumeration behaviour for self-registration (202 for existing emails) is intentional per research.md Decision 7 — do not change to 409
- The `requireEmailVerified` Fastify plugin must NOT apply to: `/auth/resend-verification`, `/auth/logout`, `/auth/verify-email`, `/auth/setup-status`, `/auth/open-registration-status`, `/auth/accept-invite`, `/auth/session-status`
- The Next.js middleware (T054) exempts `/verify-email` and `/verify-email-required` from the emailVerified redirect; all `(auth)` pages are already exempt because they don't require authentication at all
- `INTERNAL_API_URL` env var (added in T087) must point to the non-public internal Fastify URL in production — never expose it in client bundles
- **Fastify body typing**: all routes MUST use the typed generic `app.method<{ Body/Params/Querystring: XxxType }>(...)` pattern — never `request.body as XxxType`, `request.params as XxxType`, or `request.query as XxxType`. All existing route files have been fixed on this branch. T047 and T086 must apply the same pattern when modifying register.ts and login.ts (the two remaining casts, which are in scope for those tasks).
- **Plugin scope**: `requireEmailVerified` and `requireAdmin` preHandlers MUST be registered inside scoped `app.register()` blocks, never as top-level global hooks, to preserve access to exempt routes (`/auth/session-status`, `/auth/resend-verification`, `/auth/verify-email`, `/auth/accept-invite`, `/auth/open-registration-status`, `/auth/setup-status`, `/auth/logout`)
