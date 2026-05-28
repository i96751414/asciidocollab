# Tasks: Configurable Email Sender

**Input**: Design documents from `/specs/005-configurable-mailer/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md

**Tests**: Constitution Principle II (TDD) is NON-NEGOTIABLE. All user stories require tests written FIRST.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Add email enabled configuration flag

- [x] T001 Add `ASCIIDOCOLLAB_AUTH_EMAIL_ENABLED` config field in apps/api/src/config/schema.ts

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Implement NodemailerEmailSender that all user stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T002 [P] Create NodemailerEmailSender class in packages/infrastructure/src/services/nodemailer-email-sender.ts
- [x] T003 [P] Export NodemailerEmailSender from packages/infrastructure/src/services/index.ts
- [x] T004 Wire NodemailerEmailSender at composition root in apps/api/src/index.ts (conditionally based on email enabled config)

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Configurable Email Delivery (Priority: P1) 🎯 MVP

**Goal**: System can send transactional emails via SMTP, with configurable enable/disable

**Independent Test**: Set ASCIIDOCOLLAB_AUTH_EMAIL_ENABLED=true/false, verify emails are sent/not sent

### Tests for User Story 1 ⚠️ WRITE THESE FIRST

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T005 [P] [US1] Unit test for RegisterUserUseCase breach blocking in packages/domain/tests/use-cases/register-user.test.ts
- [x] T006 [P] [US1] Unit test for ChangePasswordUseCase breach check in packages/domain/tests/use-cases/change-password.test.ts
- [ ] T007 [P] [US1] Integration test for register route breach rejection in apps/api/tests/register.test.ts
- [ ] T008 [P] [US1] Integration test for password-change route breach rejection in apps/api/tests/password-change.test.ts

### Implementation for User Story 1

- [x] T009 [US1] Update RegisterUserUseCase to reject registration when password is breached in packages/domain/src/use-cases/register-user.ts
- [x] T010 [US1] Remove breached field from RegisterUserResult interface in packages/domain/src/use-cases/register-user.ts
- [ ] T011 [US1] Update register route to remove breach alert email logic in apps/api/src/routes/register.ts
- [ ] T012 [US1] Add breach check to ChangePasswordUseCase in packages/domain/src/use-cases/change-password.ts
- [ ] T013 [US1] Update password-change route to handle breach rejection in apps/api/src/routes/password-change.ts

**Checkpoint**: User Story 1 complete - emails configurable, registration/password change blocked on breach

---

## Phase 4: User Story 2 - SMTP Configuration (Priority: P1)

**Goal**: System connects to SMTP server using configured credentials

**Independent Test**: Configure SMTP settings, verify connection succeeds

### Tests for User Story 2 ⚠️ WRITE THESE FIRST

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T014 [P] [US2] Unit test for NodemailerEmailSender SMTP connection in packages/infrastructure/tests/services/nodemailer-email-sender.test.ts
- [ ] T015 [P] [US2] Integration test for SMTP configuration in apps/api/tests/email-config.test.ts

### Implementation for User Story 2

- [ ] T016 [US2] Add SMTP connection validation in NodemailerEmailSender in packages/infrastructure/src/services/nodemailer-email-sender.ts
- [ ] T017 [US2] Add graceful error handling for SMTP failures in packages/infrastructure/src/services/nodemailer-email-sender.ts
- [ ] T018 [US2] Log SMTP connection events in packages/infrastructure/src/services/nodemailer-email-sender.ts

**Checkpoint**: User Story 2 complete - SMTP configuration works with proper error handling

---

## Phase 5: User Story 3 - Email Sending Logging (Priority: P2)

**Goal**: Email sending attempts are logged for debugging

**Independent Test**: Trigger email sends, verify log output

### Tests for User Story 3 ⚠️ WRITE THESE FIRST

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T019 [P] [US3] Unit test for email logging in packages/infrastructure/tests/services/nodemailer-email-sender.test.ts

### Implementation for User Story 3

- [ ] T020 [US3] Add logging to NodemailerEmailSender send method in packages/infrastructure/src/services/nodemailer-email-sender.ts
- [ ] T021 [US3] Log recipient, subject, and status on success in packages/infrastructure/src/services/nodemailer-email-sender.ts
- [ ] T022 [US3] Log error details on failure in packages/infrastructure/src/services/nodemailer-email-sender.ts

**Checkpoint**: User Story 3 complete - all email operations are logged

---

## Phase 6: User Story 4 - Graceful Degradation When Disabled (Priority: P2)

**Goal**: All auth flows complete successfully when email is disabled

**Independent Test**: Set ASCIIDOCOLLAB_AUTH_EMAIL_ENABLED=false, verify all flows work

### Tests for User Story 4 ⚠️ WRITE THESE FIRST

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T023 [P] [US4] Integration test for registration without email in apps/api/tests/register.test.ts
- [ ] T024 [P] [US4] Integration test for password reset without email in apps/api/tests/password-reset.test.ts
- [ ] T025 [P] [US4] Integration test for password change without email in apps/api/tests/password-change.test.ts

### Implementation for User Story 4

- [ ] T026 [US4] Add email enabled check in NodemailerEmailSender send method in packages/infrastructure/src/services/nodemailer-email-sender.ts
- [ ] T027 [US4] Skip SMTP connection when email disabled in apps/api/src/index.ts
- [ ] T028 [US4] Validate FR-007: StubEmailSender works for testing/development in packages/infrastructure/tests/services/stub-email-sender.test.ts
- [ ] T029 [US4] Verify registration works without email in apps/api/src/routes/register.ts
- [ ] T030 [US4] Verify password reset works without email (token generated, no send) in apps/api/src/routes/password-reset-request.ts
- [ ] T031 [US4] Verify password change works without email in apps/api/src/routes/password-change.ts

**Checkpoint**: User Story 4 complete - system fully functional when email disabled

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Final cleanup and validation

- [ ] T032 Run quickstart.md validation steps
- [ ] T033 Verify all lint, typecheck, and build pass
- [ ] T034 Run full test suite
- [ ] T035 Validate SC-001: Email sending completes in under 5 seconds in apps/api/tests/email-performance.test.ts
- [ ] T036 Validate SC-006: Registration with breached password rejected in under 2 seconds in apps/api/tests/register.test.ts

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-6)**: All depend on Foundational phase completion
  - User Stories 1 and 2 can proceed in parallel
  - User Stories 3 and 4 can proceed in parallel
- **Polish (Phase 7)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P1)**: Can start after Foundational (Phase 2) - Independent of US1
- **User Story 3 (P2)**: Can start after Foundational (Phase 2) - Independent of US1/US2
- **User Story 4 (P2)**: Can start after Foundational (Phase 2) - Depends on US1 (breach blocking) and US2 (email sender)

### Within Each User Story

- Tests FIRST (TDD Red phase)
- Implementation (TDD Green phase)
- Refactor (TDD Refactor phase)
- Use cases before routes (domain layer first)
- Services before composition root wiring

### Parallel Opportunities

- T002 and T003 can run in parallel (different files)
- T005-T008 can run in parallel (US1 tests)
- T014-T015 can run in parallel (US2 tests)
- T023-T025 can run in parallel (US4 tests)
- User Stories 1 and 2 can be worked on in parallel
- User Stories 3 and 4 can be worked on in parallel

---

## Parallel Example: User Story 1

```bash
# Launch all User Story 1 tests together (TDD Red phase):
Task: "Unit test for RegisterUserUseCase breach blocking in packages/domain/tests/use-cases/register-user.test.ts"
Task: "Unit test for ChangePasswordUseCase breach check in packages/domain/tests/use-cases/change-password.test.ts"
Task: "Integration test for register route breach rejection in apps/api/tests/register.test.ts"
Task: "Integration test for password-change route breach rejection in apps/api/tests/password-change.test.ts"

# Then implement (TDD Green phase):
Task: "Update RegisterUserUseCase to reject registration when password is breached in packages/domain/src/use-cases/register-user.ts"
Task: "Remove breached field from RegisterUserResult interface in packages/domain/src/use-cases/register-user.ts"
Task: "Update register route to remove breach alert email logic in apps/api/src/routes/register.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 + 2 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1 (breach blocking) - Tests first, then implement
4. Complete Phase 4: User Story 2 (SMTP configuration) - Tests first, then implement
5. **STOP and VALIDATE**: Test email sending and breach blocking
6. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 + 2 → Test independently → Deploy/Demo (MVP!)
3. Add User Story 3 → Test independently → Deploy/Demo
4. Add User Story 4 → Test independently → Deploy/Demo
5. Each story adds value without breaking previous stories

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- **TDD is NON-NEGOTIABLE**: Write tests FIRST, ensure they FAIL, then implement
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
