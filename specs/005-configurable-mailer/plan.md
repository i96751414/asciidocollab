# Implementation Plan: Configurable Email Sender

**Branch**: `005-configurable-mailer` | **Date**: 2026-05-28 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/005-configurable-mailer/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Implement a real SMTP-based email sender using nodemailer, with configurable enable/disable via environment variable. Block user registration and password changes if the password is found in a data breach, regardless of email enabled/disabled state. Breach check is independent of email delivery.

**Key Changes Required**:
1. Add `NodemailerEmailSender` in infrastructure package
2. Add `ASCIIDOCOLLAB_AUTH_EMAIL_ENABLED` config flag
3. Update `RegisterUserUseCase` to reject registration when password is breached (FR-008)
4. Update `ChangePasswordUseCase` to reject password change when new password is breached (FR-010)
5. Wire new email sender at composition root

## Technical Context

**Language/Version**: TypeScript (ES2025, CommonJS)

**Primary Dependencies**: nodemailer (already in package.json), @types/nodemailer

**Storage**: N/A (no new database entities)

**Testing**: Jest with in-memory fakes for unit tests, testcontainers for integration tests

**Target Platform**: Node.js server (Linux)

**Project Type**: Web service (Fastify API)

**Performance Goals**: Email sending in under 5 seconds, breach check in under 2 seconds

**Constraints**: SMTP-only (SendGrid/SES out of scope), configuration read at startup

**Scale/Scope**: Single API server, transactional emails only

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Clean Code | ✅ Pass | NodemailerEmailSender follows existing patterns |
| II. TDD | ✅ Pass | Will write failing tests first |
| III. In-Memory Fakes | ✅ Pass | EmailSender interface already exists, will create InMemoryEmailSender for tests |
| Phased Delivery | ✅ Pass | Single phase, independent feature |
| Commit Discipline | ✅ Pass | Will follow conventional commits |
| Quality Gates | ✅ Pass | Will run lint, typecheck, tests before commit |

No violations detected. Plan is constitution-compliant.

## Project Structure

### Documentation (this feature)

```text
specs/005-configurable-mailer/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output (NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
packages/
├── domain/
│   └── src/
│       ├── services/
│       │   ├── email-sender.ts          # Existing interface
│       │   └── index.ts                 # Export
│       └── use-cases/
│           ├── register-user.ts         # MODIFY: Add breach blocking (FR-008)
│           └── change-password.ts       # MODIFY: Add breach check (FR-010)
├── infrastructure/
│   └── src/
│       └── services/
│           ├── nodemailer-email-sender.ts   # NEW: SMTP implementation
│           ├── stub-email-sender.ts         # Existing: logging stub
│           └── index.ts                     # Export
apps/api/
└── src/
    ├── config/
    │   └── schema.ts                    # Add ASCIIDOCOLLAB_AUTH_EMAIL_ENABLED
    └── index.ts                         # Wire NodemailerEmailSender
```

**Structure Decision**: Existing monorepo structure. New code goes in infrastructure package (NodemailerEmailSender) and API config (email enabled flag). Use cases in domain package require modification to implement breach blocking behavior.

## Use Case Modifications

### RegisterUserUseCase Changes (FR-008)

**Current Behavior**: Returns `breached: true` flag but allows registration to continue.

**Required Behavior**: Reject registration entirely if password is breached.

**Implementation**:
```typescript
// After breach check
const breached = await this.breachChecker.isBreached(password);
if (breached) {
  return {
    success: false,
    error: new ValidationError('Password has been found in a data breach'),
  };
}
```

**Impact**:
- Remove `breached` field from `RegisterUserResult` interface
- Route handler no longer needs to check `result.value.breached`
- Email alert on breach is no longer sent (registration is blocked instead)
- Remove breach alert email logic from `apps/api/src/routes/register.ts` (lines 75-81)

### ChangePasswordUseCase Changes (FR-010)

**Current Behavior**: No breach check for new password.

**Required Behavior**: Reject password change if new password is breached.

**Implementation**:
```typescript
// After password reuse check
const breached = await this.breachChecker.isBreached(newPassword);
if (breached) {
  return {
    success: false,
    error: new ValidationError('New password has been found in a data breach'),
  };
}
```

**Impact**:
- Add `breachChecker: BreachChecker` dependency to constructor
- Add breach check after reuse check, before hashing new password

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| None | N/A | N/A |
