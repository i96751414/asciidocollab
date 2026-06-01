# API Contracts: Multi-User Registration & User Management

**Feature**: `010-user-registration-management`
**Date**: 2026-06-01

All endpoints follow existing conventions: JSON bodies, Fastify schema validation, `Result<T,E>` domain errors mapped to HTTP status codes by the error handler plugin.

---

## Public Auth Endpoints (no session required)

### `POST /auth/register` *(modified)*

Handles both initial-admin setup (first user) and open self-registration (subsequent users, when enabled).

**Request**:
```json
{ "email": "string", "password": "string", "displayName": "string" }
```

**Responses**:

| Scenario | Status | Body |
|----------|--------|------|
| First-user admin created | `201` | `{ "message": "Account created" }` |
| Self-registration accepted (verification email sent) | `202` | `{ "message": "Check your email to verify your account" }` |
| Email already registered (anti-enumeration) | `202` | `{ "message": "Check your email to verify your account" }` |
| Registration closed | `403` | `{ "error": { "code": "REGISTRATION_CLOSED" } }` |
| Password policy violation | `400` | `{ "error": { "code": "VALIDATION_ERROR", "message": "..." } }` |

**Security**: Rate-limited (inherits existing limit). Returns identical 202 response for existing vs. new email.

---

### `GET /auth/setup-status` *(unchanged)*

---

### `GET /auth/session-status`

Lightweight endpoint consumed by the Next.js middleware server-side. Reads `request.session` without an additional DB query (session already decrypted by the Fastify session middleware). Used to gate page navigation — not for user-facing auth flows.

**Responses**:

| Scenario | Status | Body |
|----------|--------|------|
| Authenticated | `200` | `{ "authenticated": true, "emailVerified": boolean, "isAdmin": boolean }` |
| Not authenticated | `200` | `{ "authenticated": false }` |

**Security**: No `requireAuth` prehandler — intentionally public (returns the caller's own session state). No rate limit needed (called server-side from the Next.js process, not from browsers). The `INTERNAL_API_URL` env var routes this call through the non-public internal network in production.

---

### `GET /auth/open-registration-status`

Reports whether self-registration is currently enabled (used by the login page to conditionally show the register link).

**Response** `200`:
```json
{ "openRegistration": true }
```

No authentication required. Returns only a boolean — does not expose any other system state.

---

### `GET /auth/verify-email?token=<raw_token>`

Verifies a self-registration email address.

**Responses**:

| Scenario | Status | Body |
|----------|--------|------|
| Verified successfully | `200` | `{ "message": "Email verified" }` + session cookie set |
| Token invalid or already used | `400` | `{ "error": { "code": "INVALID_TOKEN" } }` |
| Token expired | `400` | `{ "error": { "code": "TOKEN_EXPIRED" } }` |

**Security**: No rate limit needed (token is unguessable; repeated calls with an invalid token are harmless after the valid token is consumed).

---

### `GET /auth/accept-invite?token=<raw_token>`

Validates an invitation token and returns the recipient's email (for pre-filling the registration form). Does **not** consume the token.

**Responses**:

| Scenario | Status | Body |
|----------|--------|------|
| Token valid | `200` | `{ "email": "invited@example.com" }` |
| Token invalid / expired / already accepted | `400` | `{ "error": { "code": "INVALID_TOKEN" } }` |

---

### `POST /auth/accept-invite`

Completes registration from an invitation.

**Request**:
```json
{ "token": "string", "displayName": "string", "password": "string" }
```

**Responses**:

| Scenario | Status | Body |
|----------|--------|------|
| Account created, signed in | `201` | `{ "message": "Account created" }` + session cookie set |
| Token invalid / expired / already accepted | `400` | `{ "error": { "code": "INVALID_TOKEN" } }` |
| Password policy violation | `400` | `{ "error": { "code": "VALIDATION_ERROR", "message": "..." } }` |
| Email already registered (race condition) | `409` | `{ "error": { "code": "DUPLICATE_EMAIL" } }` |

**Security**: Rate-limited. Session is started immediately after acceptance (no separate login step).

---

## Authenticated Endpoints (session + emailVerified required)

### `POST /auth/resend-verification`

Resends the email verification link for the currently authenticated, unverified user.

**Security exception**: This endpoint is excluded from the `requireEmailVerified` gate (otherwise an unverified user could never reach it).

**Responses**:

| Scenario | Status | Body |
|----------|--------|------|
| New email sent | `202` | `{ "message": "Verification email sent" }` |
| Already verified | `202` | `{ "message": "Verification email sent" }` (silent no-op) |

**Security**: Rate-limited (prevent email flooding). Same 202 response regardless of current verification state.

---

## Admin Endpoints (session + emailVerified + isAdmin required)

All admin endpoints are protected by a `requireAdmin` plugin that checks `session.isAdmin`. Domain use cases perform a second authorization check internally (defense-in-depth).

---

### `GET /admin/users`

Lists all registered users.

**Response** `200`:
```json
{
  "users": [
    {
      "id": "uuid",
      "email": "string",
      "displayName": "string",
      "isAdmin": true,
      "emailVerified": true,
      "createdAt": "ISO8601"
    }
  ]
}
```

---

### `POST /admin/users/invite`

Sends an application-level registration invitation.

**Request**:
```json
{ "email": "string" }
```

**Responses**:

| Scenario | Status | Body |
|----------|--------|------|
| Invitation sent | `202` | `{ "message": "Invitation sent" }` |
| Email already registered | `409` | `{ "error": { "code": "DUPLICATE_EMAIL" } }` |
| Invitation already pending | `409` | `{ "error": { "code": "INVITATION_ALREADY_PENDING" } }` |

**Security**: Rate-limited. Admin can see if the email is already registered (no enumeration protection here — admin is trusted).

---

### `PATCH /admin/users/:id/admin`

Grants or revokes administrator status.

**Request**:
```json
{ "isAdmin": true }
```

**Responses**:

| Scenario | Status | Body |
|----------|--------|------|
| Status updated | `200` | `{ "message": "Admin status updated" }` |
| Target is self | `403` | `{ "error": { "code": "CANNOT_MODIFY_SELF" } }` |
| Last admin demotion | `403` | `{ "error": { "code": "CANNOT_REMOVE_LAST_ADMIN" } }` |
| User not found | `404` | `{ "error": { "code": "USER_NOT_FOUND" } }` |

---

### `DELETE /admin/users/:id`

Removes a user. Returns the list of projects whose ownership was transferred (if any), so the frontend can show the warning confirmation.

**Pre-flight** — `GET /admin/users/:id/removal-preview`:

Returns what would happen if the user were removed, without performing the action:

```json
{
  "projectsToTransfer": [
    { "id": "uuid", "name": "My Project" }
  ]
}
```

Frontend uses this to show the warning dialog before the admin confirms.

**Delete request** — `DELETE /admin/users/:id`:

**Request**: empty body (or `{}`)

**Responses**:

| Scenario | Status | Body |
|----------|--------|------|
| User removed | `200` | `{ "message": "User removed", "projectsTransferred": ["uuid", ...] }` |
| Target is self | `403` | `{ "error": { "code": "CANNOT_REMOVE_SELF" } }` |
| Target is last admin | `403` | `{ "error": { "code": "CANNOT_REMOVE_LAST_ADMIN" } }` |
| User not found | `404` | `{ "error": { "code": "USER_NOT_FOUND" } }` |

---

### `GET /admin/settings`

Returns current admin-configurable settings.

**Response** `200`:
```json
{
  "openRegistration": false
}
```

---

### `PATCH /admin/settings`

Updates one or more admin-configurable settings.

**Request**:
```json
{ "openRegistration": true }
```

**Response** `200`:
```json
{ "openRegistration": true }
```

---

## Shared DTOs (packages/shared)

New DTOs to add:

```typescript
// User list item (admin view)
interface AdminUserDto {
  id: string;
  email: string;
  displayName: string;
  isAdmin: boolean;
  emailVerified: boolean;
  registrationMethod: 'SELF_REGISTERED' | 'INVITED';
  createdAt: string; // ISO8601
}

// Admin settings
interface AdminSettingsDto {
  openRegistration: boolean;
}

// Registration invitation request
interface InviteUserDto {
  email: string;
}

// Accept invitation request
interface AcceptInviteDto {
  token: string;
  displayName: string;
  password: string;
}

// Removal preview response
interface UserRemovalPreviewDto {
  projectsToTransfer: Array<{ id: string; name: string }>;
}
```
