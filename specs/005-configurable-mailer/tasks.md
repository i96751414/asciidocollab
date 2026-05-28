# Tasks: Configurable Email Sender

**Input**: Design documents from `/specs/005-configurable-mailer/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md

**Tests**: Not explicitly requested in spec. Implementation without test tasks.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Add email enabled configuration flag

- [ ] T001 Add `ASCIIDOCOLLAB_AUTH_EMAIL_ENABLED` config field in apps/api/src/config/schema.ts

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Implement NodemailerEmailSender that all user stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T002 [P] Create NodemailerEmailSender class in packages/infrastructure/src/services/nodemailer-email-sender.ts
- [ ] T003 [P] Export NodemailerEmailSender from packages/infrastructure/src/services/index.ts
- [ ] T004 Wire NodemailerEmailSender at composition root in apps/api/src/index.ts (conditionally based on email enabled config)

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Configurable Email Delivery (Priority: P1) 🎯 MVP

**Goal**: System can send transactional emails via SMTP, with configurable enable/disable

**Independent Test**: Set ASCIIDOCOLLAB_AUTH_EMAIL_ENABLED=true/false, verify emails are sent/not sent

### Implementation for User Story 1

- [ ] T005 [US1] Update RegisterUserUseCase to reject registration when password is breached in packages/domain/src/use-cases/register-user.ts
- [ ] T006 [US1] Remove breached field from RegisterUserResult interface in packages/domain/src/use-cases/register-user.ts
- [ ] T007 [US1] Update register route to remove breach alert email logic in apps/api/src/routes/register.ts
- [ ] T008 [US1] Add breach check to ChangePasswordUseCase in packages/domain/src/use-cases/change-password.ts
- [ ] T009 [US1] Update password-change route to handle breach rejection in apps/api/src/routes/password-change.ts

**Checkpoint**: User Story 1 complete - emails configurable, registration/password change blocked on breach

---

## Phase 4: User Story 2 - SMTP Configuration (Priority: P1)

**Goal**: System connects to SMTP server using configured credentials

**Independent Test**: Configure SMTP settings, verify connection succeeds

### Implementation for User Story 2

- [ ] T010 [US2] Add SMTP connection validation in NodemailerEmailSender in packages/infrastructure/src/services/nodemailer-email-sender.ts
- [ ] T011 [US2] Add graceful error handling for SMTP failures in packages/infrastructure/src/services/nodemailer-email-sender.ts
- [ ] T012 [US2] Log SMTP connection events in packages/infrastructure/src/services/nodemailer-email-sender.ts

**Checkpoint**: User Story 2 complete - SMTP configuration works with proper error handling

---

## Phase 5: User Story 3 - Email Sending Logging (Priority: P2)

**Goal**: Email sending attempts are logged for debugging

**Independent Test**: Trigger email sends, verify log output

### Implementation for User Story 3

- [ ] T013 [US3] Add logging to NodemailerEmailSender send method in packages/infrastructure/src/services/nodemailer-email-sender.ts
- [ ] T014 [US3] Log recipient, subject, and status on success in packages/infrastructure/src/services/nodemailer-email-sender.ts
- [ ] T015 [US3] Log error details on failure in packages/infrastructure/src/services/nodemailer-email-sender.ts

**Checkpoint**: User Story 3 complete - all email operations are logged

---

## Phase 6: User Story 4 - Graceful Degradation When Disabled (Priority: P2)

**Goal**: All auth flows complete successfully when email is disabled

**Independent Test**: Set ASCIIDOCOLLAB_AUTH_EMAIL_ENABLED=false, verify all flows work

### Implementation for User Story 4

- [ ] T016 [US4] Add email enabled check in NodemailerEmailSender send method in packages/infrastructure/src/services/nodemailer-email-sender.ts
- [ ] T017 [US4] Skip SMTP connection when email disabled in apps/api/src/index.ts
- [ ] T018 [US4] Verify registration works without email in apps/api/src/routes/register.ts
- [ ] T019 [US4] Verify password reset works without email (token generated, no send) in apps/api/src/routes/password-reset-request.ts
- [ ] T020 [US4] Verify password change works without email in apps/api/src/routes/password-change.ts

**Checkpoint**: User Story 4 complete - system fully functional when email disabled

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Final cleanup and validation

- [ ] T021 Run quickstart.md validation steps
- [ ] T022 Verify all lint, typecheck, and build pass
- [ ] T023 Run full test suite

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

- Implementation follows plan.md structure
- Use cases before routes (domain layer first)
- Services before composition root wiring

### Parallel Opportunities

- T002 and T003 can run in parallel (different files)
- T005, T006, T007 can run in parallel (different files in same story)
- T010, T011, T012 can run in parallel (same file, sequential additions)
- User Stories 1 and 2 can be worked on in parallel
- User Stories 3 and 4 can be worked on in parallel

---

## Parallel Example: User Story 1

```bash
# Launch all User Story 1 tasks together:
Task: "Update RegisterUserUseCase to reject registration when password is breached in packages/domain/src/use-cases/register-user.ts"
Task: "Remove breached field from RegisterUserResult interface in packages/domain/src/use-cases/register-user.ts"
Task: "Update register route to remove breach alert email logic in apps/api/src/routes/register.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 + 2 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1 (breach blocking)
4. Complete Phase 4: User Story 2 (SMTP configuration)
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
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
