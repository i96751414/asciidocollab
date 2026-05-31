# API Contracts: Account Management & Password Forms

**Feature**: 008-account-password-forms
**Date**: 2026-05-31

All routes use JSON request/response bodies. All mutating routes require the `x-csrf-token` header (existing CSRF pattern). Authenticated routes require a valid session cookie.

---

## Extended: GET /auth/me

**Auth**: Session required
**Change**: Response now includes `displayName` and `email`

### Response 200
```json
{
  "userId": "uuid",
  "displayName": "Alice",
  "email": "alice@example.com"
}
```

### Response 401
```json
{ "error": { "code": "UNAUTHORIZED", "message": "Authentication required" } }
```

---

## New: PATCH /auth/profile

**Auth**: Session required
**Rate limit**: Inherits from global default (no separate limit — not a sensitive operation)

### Request
```json
{ "displayName": "New Name" }
```

Fastify schema validation: `displayName` required, string, minLength 1, maxLength 100.

### Response 200
```json
{ "message": "Profile updated" }
```

### Response 400 — Validation failure
```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Display name must be at most 100 characters" } }
```

### Response 401
```json
{ "error": { "code": "UNAUTHORIZED", "message": "Authentication required" } }
```

---

## New: POST /auth/email/change-request

**Auth**: Session required
**Rate limit**: Same as `POST /auth/password/reset/request`

### Request
```json
{ "newEmail": "newalice@example.com" }
```

Fastify schema validation: `newEmail` required, string, format email.

### Response 200 — Always (email enumeration prevention)
```json
{ "message": "If the address is available, a confirmation link has been sent" }
```

**Backend behaviour**:
- If `newEmail` is already registered to another account: return 200, do NOT send email
- If `newEmail` equals the user's current email: return 200, do NOT send email
- Otherwise: invalidate any existing pending token for the user, create new `EmailChangeToken`, send confirmation email to `newEmail`

### Response 401
```json
{ "error": { "code": "UNAUTHORIZED", "message": "Authentication required" } }
```

### Response 429
```json
{ "error": { "code": "RATE_LIMITED", "message": "Too many requests", "retryAfter": 60 } }
```

---

## New: GET /auth/email/confirm

**Auth**: None — token is the credential
**Query parameter**: `token` (required)

### Response 200 — Success
```json
{ "message": "Email address updated successfully" }
```

User's email is updated to `pendingEmail` from the token record.

### Response 400 — Invalid / expired / used token
```json
{ "error": { "code": "INVALID_TOKEN", "message": "This confirmation link is invalid or has expired" } }
```

### Response 400 — Missing token parameter
```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Token is required" } }
```

---

## Existing (frontend now wired): POST /auth/password/reset/request

**Unchanged** — frontend `ForgotPasswordForm` now calls this.

### Request
```json
{ "email": "alice@example.com" }
```

### Response 200 — Always
```json
{ "message": "If the email exists, a reset link has been sent" }
```

---

## Existing (frontend now wired): POST /auth/password/reset

**Unchanged** — frontend `ResetPasswordForm` now calls this.

### Request
```json
{ "token": "raw-token-from-url", "newPassword": "NewP@ssw0rd123!" }
```

### Response 200
```json
{ "message": "Password reset successfully" }
```

### Response 400
```json
{ "error": { "code": "INVALID_TOKEN" | "VALIDATION_ERROR" | "PASSWORD_REUSE", "message": "..." } }
```

---

## Existing (frontend now wired): POST /auth/password/change

**Unchanged** — frontend `PasswordCard` now calls this.

### Request
```json
{ "currentPassword": "OldP@ss123!", "newPassword": "NewP@ss456!" }
```

### Response 200
```json
{ "message": "Password changed successfully" }
```

### Response 400
```json
{ "error": { "code": "INVALID_PASSWORD" | "VALIDATION_ERROR" | "PASSWORD_REUSE", "message": "..." } }
```

### Response 401
```json
{ "error": { "code": "UNAUTHORIZED", "message": "Authentication required" } }
```
