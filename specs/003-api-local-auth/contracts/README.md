# API Contracts: Phase 3

## Routes

All routes are prefixed under the Fastify server. Request/response validation uses Fastify schema (JSON Schema) at the route boundary (FR-016).

### Health Check

```
GET /health → 200 { status: "ok" }
```

### Registration

```
POST /auth/register
Body: { email: string, password: string, displayName: string }
Success: 201 { message: "Account created" }
Duplicate: 200 { message: "Account created" }  ← same response, no enumeration (FR-007)
Validation error: 400 { error: { code, message } }
```

### Login

```
POST /auth/login
Body: { email: string, password: string }
Success: 200 { message: "Authenticated" }  + Set-Cookie: sessionId (FR-010, FR-017)
Failure: 401 { error: { code: "INVALID_CREDENTIALS", message } }  ← same for wrong pw and unknown email (FR-019)
Rate-limited: 429 { error: { code: "RATE_LIMITED", message } }
```

### Logout

```
POST /auth/logout
Headers: Cookie: sessionId=...
Success: 200 { message: "Logged out" }  + Clear-Cookie (FR-011)
Unauthenticated: 401 (FR-015)
```

### Password Change

```
POST /auth/password/change
Headers: Cookie: sessionId=...
Body: { currentPassword: string, newPassword: string }
Success: 200 { message: "Password updated" }  + other sessions invalidated (FR-024)
Failure (wrong current): 401
Failure (weak new pw): 400
Failure (history match): 400
Rate-limited: 429 (FR-025)
Unauthenticated: 401
```

### Password Reset Request

```
POST /auth/password/reset/request
Body: { email: string }
Success: 200 { message: "If the email exists, a reset link has been sent" }  ← same for registered, unregistered, and rate-limited (FR-033, FR-034)
```

### Password Reset

```
POST /auth/password/reset
Body: { token: string, newPassword: string }
Success: 200 { message: "Password updated" }  + all sessions invalidated (FR-032)
Failure (invalid/expired token): 400
Failure (weak new pw): 400
```

## Error Envelope

All error responses follow a consistent structure (FR-002):

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message (no stack traces, no internal paths)"
  }
}
```

Error codes: `VALIDATION_ERROR`, `INVALID_CREDENTIALS`, `RATE_LIMITED`, `NOT_FOUND`, `INTERNAL_ERROR`, `UNAUTHORIZED`, `CSRF_INVALID`.
