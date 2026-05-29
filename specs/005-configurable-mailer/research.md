# Research: Configurable Email Sender

**Feature**: 005-configurable-mailer
**Date**: 2026-05-28

## Research Questions

### 1. Nodemailer SMTP Transport Configuration

**Decision**: Use `nodemailer.createTransport()` with SMTP options

**Rationale**:
- nodemailer is already a dependency in apps/api/package.json
- SMTP is the most common and widely supported email protocol
- Simple configuration via environment variables (host, port, user, pass)

**Alternatives considered**:
- SendGrid API transport: Rejected per user decision (SMTP only)
- AWS SES transport: Rejected per user decision (SMTP only)

**Best Practices**:
- Use connection pooling for production (pool: true)
- Set secure: true for port 465, false for port 587 (STARTTLS)
- Implement retry logic with exponential backoff
- Log connection events for debugging

### 2. Email Enabled/Disabled Configuration

**Decision**: Add `ASCIIDOCOLLAB_AUTH_EMAIL_ENABLED` environment variable (boolean)

**Rationale**:
- Follows existing naming convention: `ASCIIDOCOLLAB_AUTH_*`
- Boolean flag is simple and clear
- Default to `true` for production, `false` for development

**Alternatives considered**:
- Provider-based config (smtp/sendgrid/ses): Rejected, SMTP only
- Runtime toggle: Rejected, configuration read at startup per spec

### 3. Breach Check Independence from Email

**Decision**: Breach check runs regardless of email enabled/disabled state

**Rationale**:
- User requirement: "do not allow user creation if password is breached"
- Security check is independent of notification delivery
- Registration/password change should be blocked even if email is disabled

**Alternatives considered**:
- Tie breach check to email config: Rejected, security risk
- Make breach check optional: Rejected, contradicts user requirement

### 4. Error Handling Strategy

**Decision**: Email failures are logged but do not block user operations

**Rationale**:
- FR-005: "System MUST NOT block user operations when email sending fails"
- Email is a notification, not a critical path
- Users should not be prevented from registering/changing password due to email issues

**Exceptions**:
- Breach check failure: Should block registration (security critical)
- SMTP connection failure at startup: Log warning, continue

### 5. In-Memory Fake for Testing

**Decision**: Create `InMemoryEmailSender` for unit tests

**Rationale**:
- Constitution Principle III: "Repository interfaces defined in domain MUST be testable via in-memory implementations"
- EmailSender is a domain interface, needs in-memory fake
- Tracks sent emails for assertion in tests

**Implementation**:
- Store sent emails in array
- Provide methods to get sent emails, clear history
- Simulate failures for error testing

## Summary

All technical unknowns resolved. No NEEDS CLARIFICATION items remain.

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Transport | SMTP via nodemailer | Already a dependency, simple config |
| Config | ASCIIDOCOLLAB_AUTH_EMAIL_ENABLED (boolean) | Follows naming convention |
| Breach check | Independent of email config | Security requirement |
| Error handling | Log but don't block | Email is notification, not critical |
| Testing | InMemoryEmailSender | Constitution compliance |
