# Research: Multi-User Registration & User Management

**Feature**: `010-user-registration-management`
**Date**: 2026-06-01

---

## Decision 1: Token Design for Invitations and Email Verification

**Decision**: SHA-256 hash of a cryptographically-random 32-byte token stored in the database; raw token sent to the user via email only.

**Rationale**: Consistent with the existing `PasswordResetToken` pattern already in the codebase. If the database is ever breached, stored hashes cannot be reversed to recover the raw token — preventing account takeover. The 32-byte random seed provides 256 bits of entropy, far above the brute-force threshold.

**Alternatives considered**:
- JWT-signed tokens: would avoid a DB lookup but cannot be revoked server-side (a removed or expired invitation could still be "valid" mathematically); rejected on security grounds.
- UUID v4 tokens stored in plaintext: simpler but leaks the token value if the DB is read by an attacker; rejected.

---

## Decision 2: Invitation Token Expiry

**Decision**: Invitation tokens expire after **72 hours**; email verification tokens expire after **24 hours**.

**Rationale**: 72h gives invited users a realistic window to act on the email. 24h for verification is a common industry standard (balance between UX and token exposure window). Both values must be enforced server-side. Admins can always resend an invitation.

**Alternatives considered**:
- 7-day invitation: wider window = longer attack surface if the invite email is intercepted; rejected.
- 1-hour verification: too short for users in different time zones or with infrequent email checks; rejected.

---

## Decision 3: Registration Use Case Refactor vs. New Use Case

**Decision**: Refactor the existing `RegisterUserUseCase` into a unified `RegisterUseCase` that handles both initial-admin registration and open self-registration, routing based on `UserRepository.hasAny()` and `SystemSettingRepository`.

**Rationale**: Avoids duplicating the password policy, breach checking, and hashing logic. Keeps the route handler clean (one use case call, one `Result<T,E>` response). Constitution forbids business logic in route handlers.

**Alternatives considered**:
- Two separate use cases (`RegisterFirstUserUseCase`, `SelfRegisterUseCase`): clean separation, but the API route would have to inspect repository state to decide which to call — which is business logic leaking into the delivery layer; rejected.
- Route-level branching: explicit constitution violation; rejected immediately.

---

## Decision 4: User Account Status (emailVerified Field)

**Decision**: Add `emailVerified: boolean` to the `User` entity and Prisma schema. Default `true` for existing users (migration safety) and for invited users (inbox access proven). Default `false` for self-registered users until verification link is clicked.

**Rationale**: A boolean is the simplest representation. The middleware check (`requireVerifiedEmail`) needs a single flag to gate access. No "pending" intermediate states are needed beyond this.

**Alternatives considered**:
- Separate `status` enum (`active | pending | removed`): more expressive but adds complexity; "removed" is handled by hard-delete (user record disappears), not a status; rejected for over-engineering.
- Separate `EmailVerificationRequest` queue: unnecessary indirection; rejected.

---

## Decision 5: User Removal — Hard Delete with SetNull on AuditLog

**Decision**: Removing a user performs a hard delete of the `User` record. Sessions and memberships cascade-delete via existing foreign keys. Ownership of sole-owned projects is transferred to the removing admin before deletion. `AuditLog.userId` is made nullable with `onDelete: SetNull` so historical audit records are preserved.

**Rationale**: Hard delete is the cleanest: no orphaned "ghost" users, no `removedAt` queries scattered across the codebase. Historical audit logs are preserved (legally/operationally important) with `userId = NULL` indicating a former user.

**Alternatives considered**:
- Soft delete (`removedAt` timestamp): adds a filter to every query that involves users; every future repository must remember to exclude removed users; rejected for maintenance burden.
- Cascade-delete audit logs: destroys historical record of admin actions; rejected on compliance/security grounds.

---

## Decision 6: System Setting Storage

**Decision**: New `SystemSetting` Prisma model — a simple key-value table (`key String @id, value String, updatedAt DateTime @updatedAt`). The open registration flag is stored as `key = "openRegistration"`, `value = "true"|"false"`. Default (when row absent) is `false` (closed).

**Rationale**: Minimal schema addition; extensible for future runtime settings without new migrations. The domain layer exposes a typed `SystemSettingRepository` interface that hides the string encoding.

**Alternatives considered**:
- Config file + env var: requires a server restart to change; rejected (spec requires runtime toggle).
- Dedicated boolean column on a singleton "AppConfig" record: less extensible; rejected.

---

## Decision 7: Anti-Enumeration on Self-Registration

**Decision**: When a self-registration attempt uses an already-registered email address, the API returns HTTP 202 with a message like "If that address is not yet registered, a verification email has been sent" — same response as a successful registration.

**Rationale**: Returning a different error for "email taken" leaks whether an email is in the system (user enumeration). The Security Constitution mandates that typed errors must not expose internal state. The user receives a verification email only if the address was not already registered; otherwise nothing is sent.

**Security note**: This is a deliberate deviation from the common "this email is already taken" message.

**Alternatives considered**:
- Return 409 Conflict with "email already registered": directly leaks user presence; rejected.
- Return 400 with vague error: inconsistent with existing API error shapes; rejected.

---

## Decision 8: Unverified User Gate Implementation

**Decision**: A Fastify plugin (`requireEmailVerified`) runs after session authentication and checks `session.emailVerified` (set at login time). If false, all protected routes return HTTP 403 with code `EMAIL_NOT_VERIFIED`. The setup-status and resend-verification endpoints are excluded from this gate.

**Rationale**: Checking at the session level (not per-request DB lookup) avoids a database round-trip on every request. `session.emailVerified` is set to the current DB value at login and updated when verification completes (new session data written). A just-verified user gets the updated flag on next login or explicit session refresh.

**Alternatives considered**:
- Per-request DB lookup: correct but adds latency on every authenticated request; rejected.
- Storing `emailVerified` in a JWT: tokens are not used for auth in this project (session-based); moot.

---

## Decision 9: Session Invalidation on User Removal

**Decision**: The `RemoveUserUseCase` deletes all `Session` records for the removed user via the `SessionRepository` before deleting the user record. The `Session` table's `onDelete: Cascade` on `User → Session` would also handle this automatically on the hard delete, but the use case performs it explicitly for auditability.

**Rationale**: The Security Constitution requires session termination on unauthorized access. Explicit deletion in the use case makes the intent clear in code and allows the audit log entry to be written before the user record disappears.

**Alternatives considered**:
- Rely solely on cascade delete: works, but the use case has no explicit signal that sessions were invalidated; harder to test in isolation; rejected.

---

## Security Controls Summary (User Directive: "Focus on Security")

| Control | Where Enforced | Mechanism |
|---------|---------------|-----------|
| Token brute-force resistance | Domain | 32-byte crypto-random seed; SHA-256 hash stored |
| Token expiry | Domain (use case) | Server-side `expiresAt` check |
| Single-use tokens | Domain (use case) | `usedAt` timestamp set on first use; subsequent use rejected |
| Anti-enumeration (registration) | Domain (use case) | Same 202 response regardless of email existence |
| Admin-only routes | API (plugin) | `requireAdmin` Fastify plugin; domain use cases also verify `isAdmin` |
| Unverified user gate | API (plugin) | `requireEmailVerified` Fastify plugin on all protected routes |
| Session invalidation on removal | Domain (use case) | Explicit `SessionRepository.deleteByUserId()` before hard delete |
| Audit logging | Domain (use case) | All admin actions logged with actor, target, action, timestamp |
| Rate limiting | API (Fastify plugin) | All registration/invitation/verification endpoints rate-limited |
| CSRF | API (existing plugin) | SameSite + Origin header check (existing mechanism) |
| Last-admin protection | Domain (use case) | `RemoveUserUseCase` and `SetAdminStatusUseCase` check admin count |
