# Feature Specification: Configurable Email Sender

**Feature Branch**: `005-configurable-mailer`

**Created**: 2026-05-28

**Status**: Draft

**Input**: User description: "implement the mailer, enabling sending emails must be configurable, check impact of not having emails sent when disabled"

## Clarifications

### Session 2026-05-28

- Q: Should user creation be allowed if password is breached? → A: No, block registration entirely if password is breached (regardless of email enabled/disabled state)
- Q: Should password change be allowed if new password is breached? → A: No, block password change if new password is breached (consistent with registration behavior)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Configurable Email Delivery (Priority: P1)

As a system administrator, I want to enable or disable email sending via configuration so that I can control whether the system sends transactional emails in different environments (development, staging, production).

**Why this priority**: This is the core requirement. Without configurability, the system cannot adapt to different deployment scenarios (e.g., development without a mail server, production with SMTP).

**Independent Test**: Can be fully tested by setting the email enabled/disabled configuration and verifying that emails are or are not sent.

**Acceptance Scenarios**:

1. **Given** email sending is enabled, **When** a user registers with a breached password, **Then** registration is rejected with an error message indicating the password was found in a data breach
2. **Given** email sending is disabled, **When** a user registers with a breached password, **Then** registration is rejected with an error message (breach check is independent of email sending)
3. **Given** email sending is enabled, **When** a user requests a password reset, **Then** a reset email is sent with the token
4. **Given** email sending is disabled, **When** a user requests a password reset, **Then** no email is sent but the token is still generated (user cannot complete reset)
5. **Given** email sending is enabled, **When** a user changes their password to a breached password, **Then** password change is rejected with an error message
6. **Given** email sending is disabled, **When** a user changes their password to a breached password, **Then** password change is rejected with an error message (breach check is independent of email sending)
7. **Given** email sending is enabled, **When** a user changes their password to a non-breached password, **Then** password change succeeds and a notification email is sent
8. **Given** email sending is disabled, **When** a user changes their password to a non-breached password, **Then** password change succeeds without email

---

### User Story 2 - SMTP Configuration (Priority: P1)

As a system administrator, I want to configure SMTP server settings via environment variables so that the system can connect to my email provider.

**Why this priority**: SMTP configuration is essential for real email delivery in production.

**Independent Test**: Can be tested by configuring SMTP settings and verifying connection to the mail server.

**Acceptance Scenarios**:

1. **Given** SMTP host, port, and credentials are configured, **When** the system starts, **Then** it connects to the SMTP server successfully
2. **Given** SMTP configuration is missing or invalid, **When** the system starts, **Then** it logs a warning but does not crash
3. **Given** SMTP credentials are incorrect, **When** an email is sent, **Then** the error is logged and the operation fails gracefully

---

### User Story 3 - Email Sending Logging (Priority: P2)

As a developer, I want email sending attempts to be logged so that I can debug email delivery issues.

**Why this priority**: Logging is important for operational visibility but not blocking core functionality.

**Independent Test**: Can be tested by triggering email sends and verifying log output.

**Acceptance Scenarios**:

1. **Given** email sending is enabled, **When** an email is sent successfully, **Then** a log entry is created with recipient, subject, and status
2. **Given** email sending is enabled, **When** an email fails to send, **Then** an error log entry is created with the failure reason

---

### User Story 4 - Graceful Degradation When Disabled (Priority: P2)

As a user, I want critical flows (registration, password reset) to complete successfully even when email sending is disabled so that the system remains functional in development/testing environments.

**Why this priority**: Ensures the system works in all environments without requiring a working mail server.

**Independent Test**: Can be tested by disabling email and verifying that all auth flows complete successfully.

**Acceptance Scenarios**:

1. **Given** email sending is disabled, **When** a user registers, **Then** the account is created successfully
2. **Given** email sending is disabled, **When** a user requests a password reset, **Then** the token is generated but no email is sent (user must use token directly in testing)
3. **Given** email sending is disabled, **When** a user changes their password, **Then** the password is changed successfully

---

### Edge Cases

- What happens when SMTP server is unreachable? (Log error, do not block user operation)
- What happens when email address is invalid? (Log warning, do not block user operation)
- What happens when email sending is disabled and user tries to reset password? (Token generated, no email sent, user cannot complete flow without token)
- What happens when configuration changes at runtime? (Configuration is read at startup, changes require restart)
- What happens when user tries to register with a breached password? (Registration rejected with error message, regardless of email enabled/disabled state)
- What happens when user tries to change password to a breached password? (Password change rejected with error message, regardless of email enabled/disabled state)

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST support enabling/disabling email sending via environment variable `ASCIIDOCOLLAB_AUTH_EMAIL_ENABLED`
- **FR-002**: System MUST support SMTP configuration via environment variables (`ASCIIDOCOLLAB_AUTH_SMTP_HOST`, `ASCIIDOCOLLAB_AUTH_SMTP_PORT`, `ASCIIDOCOLLAB_AUTH_SMTP_USER`, `ASCIIDOCOLLAB_AUTH_SMTP_PASSWORD`)
- **FR-003**: System MUST support configuring the sender email address via `ASCIIDOCOLLAB_AUTH_EMAIL_FROM`
- **FR-004**: System MUST log email sending attempts (success and failure) with recipient and subject
- **FR-005**: System MUST NOT block user operations when email sending fails
- **FR-006**: System MUST continue to generate password reset tokens even when email is disabled
- **FR-007**: System MUST provide a logging-only email sender for testing/development environments
- **FR-008**: System MUST reject user registration if the password is found in a data breach (regardless of email enabled/disabled state)
- **FR-009**: System MUST perform breach check even when email sending is disabled (breach check is independent of email delivery)
- **FR-010**: System MUST reject password change if the new password is found in a data breach

### Key Entities

- **EmailSender**: Service interface for sending emails (already exists in domain layer)
- **NodemailerEmailSender**: SMTP-based implementation of EmailSender (new)
- **EmailConfiguration**: Settings for SMTP server and email behavior (already exists in config schema)

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: System can send transactional emails via SMTP in under 5 seconds
- **SC-002**: System remains fully functional when email sending is disabled
- **SC-003**: Email configuration changes require only environment variable updates (no code changes)
- **SC-004**: All authentication flows (register, login, password reset, password change) complete successfully regardless of email enabled/disabled state
- **SC-005**: Email sending errors are logged but do not cause user-facing errors
- **SC-006**: Registration with breached passwords is rejected in under 2 seconds

## Assumptions

- SMTP is the only email transport needed (SendGrid, SES are out of scope)
- Email templates are already defined in configuration and do not need modification
- The existing `EmailSender` interface in the domain layer is sufficient
- Configuration is read at application startup (no runtime reconfiguration)
- Development environments may use local SMTP servers (Mailhog, Mailtrap) or disable email entirely
