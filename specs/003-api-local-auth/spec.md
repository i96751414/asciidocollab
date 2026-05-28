# Feature Specification: API Server + Local Authentication

**Feature Branch**: `003-api-local-auth`

**Created**: 2026-05-27

**Status**: Draft

**Input**: User description: "move to phase 3"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - API Server Foundation (Priority: P1)

As the system, I want a running API server with health check, structured error handling, and request logging so that the platform has an entry point for all HTTP traffic and operational monitoring.

**Why this priority**: Every other Phase 3-15 feature depends on a running API server. This is the foundational layer.

**Independent Test**: A health check endpoint returns HTTP 200 with an `ok` status. An unhandled error returns a structured JSON error response instead of crashing.

**Acceptance Scenarios**:

1. **Given** the server is running, **When** a client sends a GET request to `/health`, **Then** a 200 response is returned with a JSON body containing status `ok`.
2. **Given** the server is running, **When** a client sends a request to a non-existent route, **Then** a 404 response is returned with a structured JSON error body.
3. **Given** the server is running, **When** a route throws a domain error, **Then** the error handler maps it to the appropriate HTTP status code and a safe JSON body (no stack traces or internal paths).
4. **Given** the server is running, **When** a request arrives, **Then** a structured log entry is produced containing method, path, status code, and duration.

---

### User Story 2 - User Registration (Priority: P1)

As a new visitor, I want to create an account with my email address and a password so that I can access the platform's features.

**Why this priority**: User accounts are a prerequisite for authentication and all subsequent Phase 4+ features (project management, collaboration).

**Independent Test**: Submit a registration form with a valid email and password. Confirm the account is persisted and a confirmation response is returned. Attempt to register with the same email again and receive the same success message (no account created).

**Acceptance Scenarios**:

1. **Given** I am a visitor with no account, **When** I submit a registration with a valid email and a password meeting the minimum requirements, **Then** my account is created and I receive a success response.
2. **Given** I have already registered with an email, **When** I attempt to register again with the same email, **Then** I receive the same success response (no duplicate error) to prevent account enumeration.
3. **Given** I submit a registration with an invalid email format, **When** I submit the form, **Then** I receive a validation error.
4. **Given** I submit a registration with a password that does not meet minimum requirements, **When** I submit the form, **Then** I receive a validation error.

---

### User Story 3 - Login and Session Management (Priority: P1)

As a registered user, I want to log in with my email and password and maintain my session across requests so that I can access protected resources without re-authenticating on every interaction.

**Why this priority**: Login is the primary authentication flow. Session management enables a seamless user experience across page loads and API calls.

**Independent Test**: Login with valid credentials, receive a session cookie, access a protected endpoint successfully, log out, and confirm the protected endpoint is no longer accessible.

**Acceptance Scenarios**:

1. **Given** I am a registered user, **When** I submit my email and correct password to the login endpoint, **Then** I receive a new session cookie (distinct from any pre-login session ID) and a success response.
2. **Given** I am a registered user, **When** I submit my email with an incorrect password, **Then** I receive an authentication error and no session is created.
3. **Given** I have an active session, **When** I access a protected route, **Then** the route handler can identify me via the session.
4. **Given** I have an active session, **When** I call the logout endpoint, **Then** my session is destroyed and subsequent requests to protected routes are denied.
5. **Given** a session has been idle beyond the configured timeout, **When** I make a request to a protected route, **Then** I receive an authentication error and must re-login.

### User Story 4 - Password Change (Priority: P1)

As a logged-in user, I want to change my password so that I can maintain account security if I suspect my current password is compromised or as a routine security practice.

**Why this priority**: Password change completes the local auth lifecycle alongside register, login, and logout. Without it, users have no self-service way to respond to a compromise.

**Independent Test**: Log in, submit a valid password change request, confirm the old password no longer works for login, confirm the new password works, confirm other sessions are invalidated.

**Acceptance Scenarios**:

1. **Given** I am logged in, **When** I submit my current password and a new password meeting all policy requirements, **Then** my password is updated and I receive a success response.
2. **Given** I am logged in, **When** I submit an incorrect current password, **Then** I receive an authentication error and my password is not changed.
3. **Given** I am logged in, **When** I submit a new password that does not meet minimum requirements, **Then** I receive a validation error and my password is not changed.
4. **Given** I am logged in, **When** I submit a new password that matches one of my last 5 passwords, **Then** I receive an error and my password is not changed.
5. **Given** I have other active sessions, **When** I change my password, **Then** only my current session remains valid (all other sessions are invalidated).
6. **Given** I am not logged in, **When** I attempt to access the password change endpoint, **Then** I receive a 401 response.

---

### User Story 5 - Password Reset (Priority: P1)

As a user who has forgotten my password, I want to reset it via my email so that I can regain access to my account without needing help from an administrator.

**Why this priority**: Password reset completes the auth lifecycle. Without it, users who forget their password have no self-service recovery path, creating support burden and potential account lockout.

**Independent Test**: Request a password reset for a registered email, receive a reset token, use it to set a new password, confirm the old password no longer works, confirm login succeeds with the new password, confirm the token cannot be reused.

**Acceptance Scenarios**:

1. **Given** I have a registered account, **When** I submit a password reset request with my email, **Then** I receive a confirmation message and a reset link is sent to my email.
2. **Given** I submit a password reset request for an unregistered email, **Then** I receive the same confirmation message (no email sent) to prevent account enumeration.
3. **Given** I have a valid reset token, **When** I submit it with a new password meeting policy requirements, **Then** my password is updated and all existing sessions are invalidated.
4. **Given** I have a valid reset token, **When** I submit it with an expired or incorrect token, **Then** I receive an error and my password is not changed.
5. **Given** I have already used a reset token, **When** I attempt to use it again, **Then** I receive an error and my password is not changed.
6. **Given** I submit a password reset request, **When** I submit another request within the rate-limit window, **Then** a new token is generated and the previous token is invalidated.

---

### Edge Cases

- What happens when the database is unreachable during login or registration?
- How does the system handle concurrent registration attempts with the same email?
- What happens when a session cookie is tampered with or replayed?
- How does the system behave under high-frequency failed login attempts?
- What happens when a user submits a login request with a session ID that was issued before their own login (session fixation attempt)?
- How does the system behave when a dependency with a known vulnerability is detected during the build scan?
- What happens when a user attempts to change their password while another session is actively being used by an attacker?
- How does the system handle a password change request when the user's account is currently rate-limited due to failed login attempts?
- What happens when a password reset token is intercepted or leaked before use?
- How does the system handle a password reset request for an email that does not exist in the system?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST expose a health check endpoint that returns HTTP 200 and a JSON status body.
- **FR-002**: System MUST return structured JSON error responses for all error conditions (validation errors, authentication failures, not found, internal errors). All error responses MUST follow the envelope `{ error: { code: string, message: string, details?: unknown } }`. The `code` field MUST be a machine-readable error code (e.g., `VALIDATION_ERROR`, `AUTHENTICATION_ERROR`, `NOT_FOUND`, `INTERNAL_ERROR`). The `message` field MUST be a human-readable description safe for client display — no stack traces, file paths, or internal identifiers. The `details` field, when present, MAY contain additional context such as per-field validation errors.
- **FR-003**: System MUST log every request with method, path, status code, and duration.
- **FR-004**: Users MUST be able to register with a valid email and password.
- **FR-005**: System MUST validate email format on registration.
- **FR-006**: System MUST enforce minimum password requirements: at least 12 characters, containing uppercase letters, lowercase letters, digits, and symbols. System MUST reject common/breached passwords via a local blocklist of common passwords (fast path, no network dependency) AND an async Have I Been Pwned API check (for broader breach coverage). The blocklist MUST contain at least the 10,000 most common passwords from the SecLists repository. If the HIBP API is unreachable, registration MUST proceed and the check MUST be retried asynchronously.
- **FR-006a**: If, during the async breach check (FR-006), a password is found to be breached after registration has already completed, the system MUST flag the user's account for mandatory password change on next login and send a security notification email. The account MUST remain accessible (login with new password) during this period.
- **FR-007**: Registration with a duplicate email MUST return the same generic success response as a successful registration to prevent account enumeration.
- **FR-008**: System MUST hash passwords using argon2id before persisting them to the database, with a minimum memory cost of 64MB, time cost of 3, and parallelism of 1. Each password MUST use a unique salt.
- **FR-009**: Registered users MUST be able to log in with email and password.
- **FR-010**: System MUST create a server-side session upon successful login.
- **FR-011**: System MUST destroy the session upon logout.
- **FR-012**: Session MUST expire after 30 minutes of inactivity with sliding expiration (each request resets the timer). Absolute maximum session lifetime MUST NOT exceed 24 hours.
- **FR-013**: System MUST rate-limit failed login attempts to 5 failures per account within a 15-minute sliding window before a 15-minute lockout. Rate limiting MUST be per-account (not per-IP) to prevent IP-based denial-of-service.
- **FR-014**: System MUST store session data encrypted at rest in the database using AES-256-GCM. The encryption key MUST be provided via an environment variable (`ASCIIDOCOLLAB_AUTH_SESSION_ENCRYPTION_KEY`) and MUST be 256-bit when decoded.
- **FR-015**: System MUST protect routes that require authentication; unauthenticated requests to protected routes MUST receive a 401 response.
- **FR-016**: All request bodies and query parameters MUST be validated at the route boundary before reaching business logic.
- **FR-017**: System MUST regenerate the session ID upon successful login to prevent session fixation attacks.
- **FR-018**: State-changing endpoints (logout, password change, password reset) MUST validate a CSRF token to prevent cross-site request forgery. Login and password-reset-request are excluded — the client has no session before authentication, so no CSRF token can be issued. These endpoints are protected by the CORS preflight mechanism (see CORS FR) and the required `Content-Type: application/json` header. Registration is likewise excluded for the same reason.
- **FR-019**: Login error responses MUST NOT distinguish between "email not found" and "incorrect password" — both MUST return the same generic error message to prevent account enumeration.
- **FR-019a**: To prevent timing-based account enumeration, the system MUST apply a consistent artificial delay to login responses for unknown email addresses, matching the response time of a full password hash verification.
- **FR-020**: System MUST NOT log passwords, session tokens, password hashes, or password reset tokens in any log output. Request body logging MUST redact any field containing password or token data.
- **FR-020a**: All password, token, and hash comparisons MUST use timing-safe comparison (`crypto.timingSafeEqual`) to prevent timing side-channel attacks.
- **FR-021**: All runtime dependencies MUST be scanned for known vulnerabilities as part of the build pipeline before deployment.
- **FR-022**: Authenticated users MUST be able to change their password by providing their current password and a new password.
- **FR-023**: System MUST verify the current password against the stored hash before accepting the new password.
- **FR-024**: System MUST invalidate all sessions for the user upon password change, except the session that initiated the change.
- **FR-024a**: System MUST send a security notification email to the user's email address when their password is changed, including timestamp and IP address of the change request.
- **FR-025**: System MUST apply the same per-account rate limiting (FR-013) to current-password verification during password changes.
- **FR-026**: System MUST apply the same password policy (FR-006) to new passwords during password changes.
- **FR-027**: System MUST reject the new password if it matches any of the user's last 5 passwords (password history).
- **FR-028**: Unauthenticated users MUST be able to request a password reset by providing their email address.
- **FR-029**: System MUST generate a cryptographically random reset token upon password reset request and send it to the user's email.
- **FR-030**: Reset token MUST expire after 1 hour and MUST be single-use (invalidated after successful use).
- **FR-031**: System MUST accept a valid reset token and a new password, validate the new password against FR-006, and update the user's password hash.
- **FR-032**: System MUST invalidate all sessions for the user upon successful password reset.
- **FR-033**: System MUST rate-limit password reset requests to 3 per IP address per hour to prevent email flooding. Rate-limited requests MUST return the same success message as non-rate-limited requests to prevent account enumeration.
- **FR-034**: Password reset request for an unregistered email MUST return the same success message as a registered email to prevent account enumeration.
- **FR-035**: Reset tokens MUST be hashed before storage using the same algorithm and cost parameters as passwords (FR-008).
- **FR-036**: Registration attempts MUST be rate-limited to 3 per IP address per hour.
- **FR-037**: All rate limits, timeouts (session inactivity, token expiry, lockout duration), password history depth, and password policy parameters (minimum length, character requirements) MUST be configurable via environment variables with sensible defaults as defined in this specification.

- **FR-020b**: System MUST enforce HTTPS in production. Plain HTTP requests MUST be redirected to HTTPS with a 301 Moved Permanently response. In development mode, the `secure` flag on session cookies MUST be configurable via environment variable (`ASCIIDOCOLLAB_AUTH_COOKIE_SECURE`).
- **FR-038**: System MUST support CORS configuration via environment variables. In production, the allowed origin list MUST be restricted to the configured origins. In development, all origins MAY be allowed. The CORS configuration MUST support credentials (cookies) for authenticated requests. Preflight requests (OPTIONS) MUST be handled correctly.

- **User**: Represents a registered platform user. Created during registration. Authenticated during login. Key attributes: email, password hash, display name.
- **Session**: Represents an authenticated user's session. Created on login, destroyed on logout or expiry. Key attributes: user ID, creation time, expiry time.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A new user can complete registration in under 3 seconds (p95).
- **SC-002**: An existing user can complete login in under 2 seconds (p95).
- **SC-003**: Registration with a duplicate email returns a success response in under 1 second (no account created).
- **SC-004**: All API endpoints return structured JSON error responses; no HTML error pages or stack traces are exposed to clients.
- **SC-005**: The server starts and accepts requests within 5 seconds of startup.
- **SC-006**: All existing Phase 1 and Phase 2 tests continue to pass.
- **SC-007**: The health check endpoint responds in under 100ms (p99).
- **SC-008**: Dependency scan produces zero known-vulnerability alerts for all runtime dependencies before deployment.
- **SC-009**: A password change completes in under 2 seconds (p95) and immediately invalidates all other sessions.
- **SC-010**: A password reset request is processed and the email dispatch is initiated in under 1 second.
- **SC-011**: A password reset using a valid token completes in under 2 seconds (p95) and invalidates all sessions.

## Assumptions

- Existing domain entities and repository implementations from prior phases are fully functional. The User entity requires a `passwordHistory` field (string array) to support FR-027 (password history check). The `User` entity, `UserRepository` interface, and its in-memory fake must be updated accordingly.
- CORS is configured via environment variables. The default development configuration allows all origins; production requires an explicit origin whitelist. The frontend origin (set in a later phase) is the primary consumer.
- Server-side sessions are stored in the same database used for application data.
- Password hashing parameters (argon2id memory/time/parallelism) are baseline minimums; higher values may be used in production.
- Integration with the frontend application is handled in a later phase.
- Rate limiting is per-server-instance and resets on restart; distributed rate limiting is deferred.
- Default rate limits, timeouts, and password policy values are defined by this specification; deployment-specific tuning via environment variables is expected.
- Session cookies use standard security flags (`httpOnly`, `secure` in production, `sameSite`).
- Error responses follow a consistent JSON envelope structure.
- CSRF tokens are issued per-session and validated via a custom header (`x-csrf-token`). This is the standard pattern for JSON APIs and avoids double-submit cookie complexity. Pre-authentication endpoints (login, password-reset-request, registration) are CSRF-excluded and rely on CORS preflight + `Content-Type: application/json` enforcement.
- Password reset tokens sent via email links may be exposed through Referer headers when the user navigates from their email client. Single-use tokens with a 1-hour expiry (FR-030) mitigate this risk; no additional countermeasures are taken in Phase 3.
- Dependency scanning is integrated into the CI/CD pipeline (e.g., `pnpm audit`, Snyk, or GitHub Dependabot).
- Email delivery for password reset tokens is handled via an external transactional email service; the API delegates sending but does not implement an SMTP server.
- Email verification (confirming ownership of the email address during registration) is deferred to a later phase — Phase 3 assumes the provided email is valid.
- Password reset is the only recovery path. Account recovery via security questions or administrator intervention is out of scope.
- The session data encryption key (`ASCIIDOCOLLAB_AUTH_SESSION_ENCRYPTION_KEY`) is static for the lifetime of the database. Rotation requires re-encrypting all session `data` fields and is out of scope for Phase 3.
- `passwordHistory` on the User entity stores the last N password hashes in a PostgreSQL `TEXT[]` column. Migration when `N` increases requires no data migration — only the comparison logic limit changes.
