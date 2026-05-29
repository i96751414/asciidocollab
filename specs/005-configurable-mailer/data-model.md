# Data Model: Configurable Email Sender

**Feature**: 005-configurable-mailer
**Date**: 2026-05-28

## Overview

This feature does not introduce new database entities. It adds configuration and implements an existing domain interface.

## Existing Entities

### EmailSender Interface (Domain Layer)

**Location**: `packages/domain/src/services/email-sender.ts`

```typescript
interface EmailSender {
  send(to: string, subject: string, html: string): Promise<void>;
}
```

**Methods**:
- `send(to, subject, html)`: Sends an email message
  - `to`: Recipient email address
  - `subject`: Email subject line
  - `html`: Email body in HTML format

### EmailConfiguration (Config Schema)

**Location**: `apps/api/src/config/schema.ts`

**Fields**:
- `auth.email.provider`: Email provider type (smtp, sendgrid, ses) - default: 'smtp'
- `auth.email.smtpHost`: SMTP server host
- `auth.email.smtpPort`: SMTP server port - default: 587
- `auth.email.smtpUser`: SMTP authentication user
- `auth.email.smtpPassword`: SMTP authentication password (sensitive)
- `auth.email.from`: Sender email address

**New Field** (this feature):
- `auth.email.enabled`: Enable/disable email sending - default: true

## State Transitions

### Email Sending Flow

```
[User Action] → [Breach Check] → [Email Enabled?] → [Send Email] → [Log Result]
                                      ↓ (No)
                                 [Skip Email]
```

### Registration with Breached Password

```
[User Registers] → [Breach Check] → [Breached?]
                                      ↓ (Yes)
                                 [Reject Registration]
                                      ↓ (No)
                                 [Continue Registration]
```

## Validation Rules

### Email Configuration

- `smtpHost`: Required if email enabled
- `smtpPort`: Must be 1-65535
- `smtpUser`: Required if email enabled
- `smtpPassword`: Required if email enabled
- `from`: Must be valid email address

### Breach Check

- Password is checked against HIBP API before registration
- Password is checked against HIBP API before password change
- Breach check is independent of email enabled/disabled state
