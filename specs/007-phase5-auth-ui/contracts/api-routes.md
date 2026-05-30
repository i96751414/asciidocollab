# API Contracts: Authentication UI & Session Flows

All existing auth routes below are **already implemented** but must be registered
in `apps/api/src/index.ts` `buildServer()`. Only `GET /auth/setup-status` is new.

---

## New endpoint

### GET /auth/setup-status

**Purpose**: Allows the frontend to determine whether the system has been initialised
(at least one user account exists).

**Auth required**: No — must be callable before any accounts exist.

**Rate limit**: Same global limit as health check (not a sensitive operation).

**Response** `200 OK`:
```json
{ "configured": true }
```
or
```json
{ "configured": false }
```

**Use case**: `CheckSystemSetupUseCase`

---

## Existing routes to register

### POST /auth/login

**Body**:
```json
{ "email": "string", "password": "string" }
```

**Success** `200 OK`:
```json
{ "message": "Authenticated" }
```
Sets `Set-Cookie: sessionId=<token>; HttpOnly; Secure; SameSite=Strict`

**Failure** `401 Unauthorized`:
```json
{ "error": { "code": "INVALID_CREDENTIALS", "message": "Invalid email or password" } }
```

**Rate limit exceeded** `429 Too Many Requests`:
```json
{ "error": { "code": "RATE_LIMITED", "message": "Too many failed attempts", "retryAfter": 900 } }
```
`retryAfter` is in seconds. The UI converts this to a human-readable string (e.g., 900 → "15 minutes").

**Rate limit**: 5 attempts per 15 minutes per IP (configurable via env vars).

---

### POST /auth/register

**Body**:
```json
{ "email": "string", "password": "string", "displayName": "string" }
```

**Success** `201 Created` (always — both new account and already-registered email return the same status to prevent email enumeration):
```json
{ "message": "Account created" }
```

**Failure** `400 Bad Request`:
```json
{ "error": { "code": "VALIDATION_ERROR", "message": "<reason>" } }
```

**Failure** `403 Forbidden` (system already has at least one user — registration is closed):
```json
{ "error": { "code": "REGISTRATION_CLOSED", "message": "Registration is closed" } }
```

**Rate limit**: 3 attempts per hour per IP.

---

### POST /auth/logout

**Auth required**: No (safe to call even with no session — idempotent).

**Success** `200 OK`:
```json
{ "message": "Logged out" }
```
Clears `sessionId` cookie.

---

### GET /auth/me

**Auth required**: Yes (valid session cookie).

**Success** `200 OK`:
```json
{ "userId": "uuid" }
```

**Failure** `401 Unauthorized`:
```json
{ "error": { "code": "UNAUTHORIZED", "message": "Authentication required" } }
```

Used by dashboard server components to validate the session on every SSR render.

---

## Frontend route contracts

### /login

| Condition | Behaviour |
|---|---|
| User has valid session | Redirect to `/dashboard` |
| System not configured (`configured: false`) | Redirect to `/register` |
| `?reason=expired` present | Show "Your session has expired" notice |
| `?redirect=<path>` present | After login, redirect to `<path>` (internal paths only) |

### /register

| Condition | Behaviour |
|---|---|
| System not configured | Show "Set up your account" (first-run messaging) |
| System configured + user has session | Redirect to `/dashboard` |
| System configured + user has **no** session | Redirect to `/login` |
| Successful registration (first-run) | Auto-login + redirect to `/dashboard` |

### /dashboard (and all dashboard sub-routes)

| Condition | Behaviour |
|---|---|
| No `sessionId` cookie (edge middleware) | Redirect to `/login?redirect=<original-path>` |
| `sessionId` cookie present but session invalid (server component `GET /auth/me` returns 401) | Redirect to `/login?reason=expired` |
