# Research: Account Management & Password Forms

**Feature**: 008-account-password-forms
**Date**: 2026-05-31

---

## Decision 1: EmailChangeToken Pattern

**Decision**: `EmailChangeToken` mirrors `PasswordResetToken` exactly, adding one field: `pendingEmail` — the new address to write to the user record upon confirmation.

**Rationale**: The existing token pattern is already production-tested, handles all required security properties (single-use, time-limited, hashed token, cascade delete on user removal), and has a full infrastructure implementation with in-memory fake. Reusing it minimises new code, new attack surface, and review burden.

**Alternatives considered**:
- Store `pendingEmail` as a column on the `User` model: rejected — couples email change state to the user row, complicates supersede logic, and lacks the expiry/used lifecycle that the token table provides naturally.
- A generic "pending action" token table: rejected — premature generalisation; no other pending actions currently exist.

---

## Decision 2: Supersede Policy for Pending Email Changes

**Decision**: When a new `POST /auth/email/change-request` is submitted, any existing unconfirmed `EmailChangeToken` for that user is deleted before the new token is created.

**Rationale**: Simplest mental model. Prevents two confirmation emails being active simultaneously. Standard practice for email change flows (GitHub, GitLab, Linear all supersede).

**Alternatives considered**:
- Allow multiple pending tokens, honour most recent: rejected — users could receive two confirmation emails and be confused about which to use.

---

## Decision 3: Email Enumeration Prevention

**Decision**: `POST /auth/email/change-request` always returns HTTP 200 with `{ message: "If the address is available, a confirmation link has been sent" }`, regardless of whether the new email is already registered to another account. No confirmation email is sent if the address is taken.

**Rationale**: Prevents an authenticated user from probing which email addresses are registered in the system. Mirrors the existing `POST /auth/password/reset/request` behaviour.

**Security note**: This is defence-in-depth; authentication already guards this endpoint, but information leakage via response differences is still undesirable.

---

## Decision 4: Token Expiry

**Decision**: Email change tokens expire after the same duration as password reset tokens, controlled by the existing `auth.passwordReset.tokenExpiryMs` config key (default 1 hour).

**Rationale**: Same urgency and risk profile. Sharing the config key avoids an unnecessary new configuration surface. Can be split into `auth.emailChange.tokenExpiryMs` in a future iteration if different durations are required.

---

## Decision 5: Frontend Shared Utilities Location

**Decision**:
- `apps/web/src/lib/password-schema.ts` — exports `buildPasswordSchema(policy: PasswordPolicyDto): ZodString`
- `apps/web/src/hooks/use-touched-fields.ts` — exports `useTouchedFields<T extends string>(allFields: readonly T[])`

**Rationale**: Follows existing project conventions: pure utility functions in `lib/`, React hooks in `hooks/`. Neither belongs in `packages/domain` (they are frontend delivery concerns). The register form is updated to import `buildPasswordSchema` from this new location; its behaviour is unchanged.

---

## Decision 6: Account Page Route

**Decision**: `/dashboard/account` within the `(dashboard)` route group.

**Rationale**: The `(dashboard)` layout already provides the session guard (`getSession()` → redirect on missing session) and the sidebar/header shell. No new auth middleware is needed. The URL is predictable and consistent with the existing `/dashboard/*` structure.

---

## Decision 7: Email Confirm Page Route

**Decision**: `/email/confirm?token=…` as a Next.js Server Component within the `(auth)` route group.

**Rationale**: A Server Component reads `searchParams`, calls the backend confirm endpoint server-side, and renders a success or error page immediately — no client-side redirect flash. The `(auth)` group is appropriate because the token is the credential; no session is required. The page redirects to `/dashboard/account` on success (if a session is present) or `/login` (if not).

---

## Decision 8: TDD Order and Negative Test Coverage

**Decision**: Tests are written before implementation in this layer order:
1. Domain entity invariants (`EmailChangeToken`)
2. Domain use case behaviour (with in-memory fakes)
3. API integration tests (testcontainers)
4. Frontend utility tests (`password-schema`, `use-touched-fields`)

**Security-focused negative tests required at every layer**:

| Scenario | Layer | Expected |
|----------|-------|----------|
| Expired token submitted to confirm endpoint | Domain + API | `Result.err(InvalidTokenError)` / HTTP 400 `INVALID_TOKEN` |
| Already-used token submitted | Domain + API | `Result.err(InvalidTokenError)` / HTTP 400 `INVALID_TOKEN` |
| Token not found in database | Domain + API | `Result.err(InvalidTokenError)` / HTTP 400 `INVALID_TOKEN` |
| Token belongs to a different user | Domain | `Result.err(InvalidTokenError)` |
| Missing session on `PATCH /auth/profile` | API | HTTP 401 `UNAUTHORIZED` |
| Missing session on `POST /auth/email/change-request` | API | HTTP 401 `UNAUTHORIZED` |
| Rate limit exceeded on any mutating endpoint | API | HTTP 429 with `retryAfter` |
| Wrong current password on change-password | API (existing) | HTTP 400 `INVALID_PASSWORD` |
| New password fails policy on reset/change | Domain + API | HTTP 400 `VALIDATION_ERROR` |
| New email already registered (change-request) | API | HTTP 200, no email sent (enumeration prevention) |
| Empty/whitespace-only `displayName` | Domain + API | `Result.err(ValidationError)` / HTTP 400 |
| `displayName` exceeding 100 characters | Domain + API | `Result.err(ValidationError)` / HTTP 400 |
| `/reset-password` loaded with no token in URL | Frontend | Error message + link to `/forgot-password` |
| Submit button when `newPassword` fails policy | Frontend | Button disabled |
| Submit button when `confirmPassword` doesn't match | Frontend | Button disabled |
| Submit button while request is in-flight | Frontend | Button disabled |
| `GET /auth/me` without session | API | HTTP 401 `UNAUTHORIZED` |

**Note on XSS**: `displayName` containing HTML/script tags is stored as-is and rendered escaped by React — no sanitisation required in the backend, but a test confirming round-trip storage and safe rendering is included.
