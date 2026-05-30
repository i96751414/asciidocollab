# Feature Specification: Authentication UI & Session Flows

**Feature Branch**: `007-phase5-auth-ui`

**Created**: 2026-05-30

**Status**: Draft

**Input**: User description: "lets move to phase 5, also include creating login page, redirecting the the login page when there is no registered user, and when the user logs in moving to the next page, it should also be possible to have users authenticate directly without SAML or entra ID (make it easy to trial out the application)"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Sign in with email and password (Priority: P1)

A registered user visits any protected page. If they do not have an active session, they are automatically redirected to the login page. They type their email address and password, click "Sign In", and are taken directly to the dashboard — or back to the page they originally tried to visit.

**Why this priority**: Everything in the authenticated area depends on the sign-in flow working. Without it, no other feature can be exercised by a real user.

**Independent Test**: Can be fully tested by starting the app with at least one existing account, visiting the dashboard while signed out, completing the login form, and confirming the redirect to the dashboard.

**Acceptance Scenarios**:

1. **Given** a user is not signed in, **When** they navigate to any dashboard page, **Then** they are redirected to the login page with the original URL preserved
2. **Given** a user is on the login page and enters valid credentials, **When** they submit the form, **Then** they are redirected to the dashboard (or the original destination if one was stored)
3. **Given** a user is on the login page and enters invalid credentials, **When** they submit the form, **Then** the form shows a single generic error ("Invalid email or password") without indicating which field was wrong, and the password field is cleared
4. **Given** a user is already signed in, **When** they navigate to the login page directly, **Then** they are immediately redirected to the dashboard

---

### User Story 2 - First-run setup for a new deployment (Priority: P1)

When no user accounts exist in the system — as is the case for a fresh installation or a trial run — any visitor landing on the application is redirected to a setup screen. There they create the first administrator account (name, email, password). On completion they are logged in and taken straight to the dashboard.

**Why this priority**: Without a first-run path, a brand-new deployment is entirely inaccessible. It is also the primary entry point for trialling the application without any external identity service.

**Independent Test**: Can be fully tested by starting the app against an empty database, visiting the root URL, and verifying the automatic redirect to the setup screen. Completing the form creates the account and lands on the dashboard.

**Acceptance Scenarios**:

1. **Given** the system has zero registered users, **When** any page is visited, **Then** the visitor is redirected to the first-run setup screen
2. **Given** the visitor is on the setup screen, **When** they submit a valid name, email, and password, **Then** an administrator account is created, the user is signed in, and they are redirected to the dashboard
3. **Given** the visitor is on the setup screen, **When** they submit an invalid email or a password that does not meet minimum strength, **Then** they see specific, actionable error messages without losing their other input
4. **Given** the system already has at least one registered user, **When** someone navigates to the setup screen URL directly, **Then** they are redirected to the login page

---

### User Story 3 - Sign out (Priority: P2)

A signed-in user can end their session at any time from the navigation bar. After signing out their session is destroyed and they are taken to the login page.

**Why this priority**: Sign-out completes the session lifecycle. Without it, shared-device use is insecure and trial evaluators cannot switch accounts.

**Independent Test**: Can be fully tested by signing in, clicking "Sign Out" in the nav bar, and confirming the redirect to the login page and that protected pages are no longer accessible.

**Acceptance Scenarios**:

1. **Given** a user is signed in, **When** they click "Sign Out", **Then** their session is ended and they are redirected to the login page
2. **Given** a user has just signed out, **When** they use the browser back button to reach a dashboard page, **Then** the page redirects them back to the login page
3. **Given** a user is signed in, **When** their session expires due to inactivity, **Then** the next page navigation sends them to the login page with a brief notice that their session has expired

---

### User Story 4 - Rate limit and lockout feedback (Priority: P3)

A user who submits the login form too many times in quick succession sees a clear message explaining that their account is temporarily locked and approximately how long to wait. The message appears in the UI rather than as a raw error.

**Why this priority**: The lockout protection is already enforced by the API. This story adds the user-visible layer so that legitimate users who mistype their password are not confused by opaque failures.

**Independent Test**: Can be tested by submitting incorrect credentials enough times to trigger the lockout threshold and verifying the UI displays a human-readable lockout message.

**Acceptance Scenarios**:

1. **Given** a user has exceeded the failed-login threshold, **When** they attempt to sign in again, **Then** the form shows a message such as "Too many failed attempts — please try again in 15 minutes"
2. **Given** a user's account is locked out, **When** the lockout period elapses and they enter correct credentials, **Then** they can sign in successfully

---

### Edge Cases

- What happens when the API is unreachable during a login attempt? → The form shows a general "Something went wrong, please try again" message; the user can retry without losing their email input.
- What happens when the session cookie is present but the server-side session has expired or been invalidated? → The server returns an unauthenticated response; the web app redirects to the login page as though the user were freshly signed out.
- What happens if the first-run setup form is submitted twice in rapid succession (double-click)? → The form is disabled on first submission to prevent duplicate account creation.
- What happens if an attacker calls `POST /auth/register` directly after setup is complete? → The API returns `403 Forbidden` — `RegisterUserUseCase` checks `userRepo.hasAny()` before any other logic and rejects the request; no account is created.
- What happens if two concurrent first-run registration requests race on an empty database? → Both pass the `hasAny()` check simultaneously; whichever INSERT arrives second hits a unique-constraint violation. `RegisterUserUseCase` catches that violation, re-checks `hasAny()` (now `true`), and returns `RegistrationClosedError` — surfaced as `403 Forbidden`. No duplicate accounts are created.
- What happens if the stored redirect target is an external URL? → The redirect value is validated server-side: only values that start with `/` and do not start with `//` are accepted; anything else falls back to `/dashboard`. This prevents open-redirect attacks while keeping the rule simple and testable.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Every route in the authenticated area MUST verify the presence of a valid session before rendering; unauthenticated requests MUST be redirected to the login page
- **FR-002**: The login page MUST accept an email address and a password as the only required inputs
- **FR-003**: On successful login, the user MUST be sent to the originally requested path if one was stored, otherwise to the dashboard
- **FR-004**: On failed login, the response MUST display a single generic message that does not indicate whether the email or the password was wrong
- **FR-005**: When the system has no registered users, all routes MUST redirect to the first-run setup screen
- **FR-006**: The first-run setup screen MUST accept a display name, email address, and password to create an administrator account
- **FR-007**: On successful first-run setup, the system MUST automatically sign in the new account and redirect to the dashboard
- **FR-008**: Once at least one user exists, the first-run setup screen MUST be inaccessible — the `/register` page MUST redirect unauthenticated visitors to `/login`, and `POST /auth/register` MUST return `403 Forbidden` at the API level when `userRepo.hasAny()` is true; both layers enforce this independently so no UI bypass is possible
- **FR-009**: The login page MUST redirect already-authenticated users to the dashboard
- **FR-010**: A "Sign Out" action MUST be available from the navigation bar on every authenticated page and MUST redirect to the login page after destroying the session
- **FR-011**: When the API reports a rate-limit or account-lockout response, the login form MUST display a human-readable explanation and an approximate wait time
- **FR-012**: All authentication flows MUST work with email and password alone — no external identity provider, SSO service, or enterprise directory is required
- **FR-013**: `POST /auth/register` MUST return `201 Created` for both new and already-registered email addresses — the response MUST NOT distinguish between the two cases to prevent email enumeration
- **FR-014**: `POST /auth/login`, `POST /auth/register`, and `POST /auth/logout` MUST enforce CSRF token validation — integration tests MUST assert that requests without a valid CSRF token receive `403 Forbidden`
- **FR-015**: The session cookie MUST be set with `SameSite=Strict` — this is the required value for this self-hosted, single-origin deployment; `Lax` is explicitly rejected

### Key Entities

- **Session**: An active authentication token associated with a user account; has an expiry time and is destroyed on sign-out
- **Redirect Target**: A temporary record of the URL the user attempted to visit before being sent to the login page; consumed after the post-login redirect
- **First-run State**: A derived system state indicating whether any user accounts exist; gates access to the setup screen vs. the login page

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An unauthenticated user attempting to access any protected page is redirected to the login page within a single navigation event — no protected content is rendered first
- **SC-002**: A user with valid credentials completes sign-in and reaches the dashboard in under 10 seconds on a standard connection
- **SC-003**: A person starting a fresh trial installation can create an account and reach the dashboard in under 2 minutes with no prior documentation
- **SC-004**: 100% of routes in the authenticated area enforce the session check — verified by visiting each route without a session
- **SC-005**: Login error messages appear within 1 second of form submission without a full page reload
- **SC-006**: After signing out, any attempt to access a protected route redirects to the login page — the previous session produces no authenticated responses

## Assumptions

- The API already enforces authentication, session management, rate limiting, and account lockout; this feature adds the UI layer and route-level session checks in the web app only
- Password strength rules and lockout thresholds are configured server-side; the UI surfaces errors returned by the API but does not define its own rules
- "Protected routes" means all routes under the dashboard layout group and any future authenticated layout groups
- First-run setup creates one administrator account; bulk import and invitation-based onboarding are separate features not in scope here
- The SAML / Entra ID authentication path is intentionally deferred to a later phase
- Session expiry duration is controlled by existing server configuration and is not changed by this feature; however, the session cookie's `SameSite` attribute MUST be updated to `Strict` as part of this feature (see FR-015)

## Clarifications

### Session 2026-05-30

- Q: Should `POST /auth/register` be blocked at the API level once the system has at least one user? → A: Yes — `RegisterUserUseCase` checks `userRepo.hasAny()` first and returns a `RegistrationClosedError` (surfaced as `403 Forbidden`) when true; registration is closed after setup and new accounts require a future admin invitation flow
- Q: What should the `/register` page do when the system is configured and the visitor has no session? → A: Redirect to `/login` — closes the FR-008 gap; the server component checks setup status and redirects unauthenticated visitors away from the register page when users already exist
- Q: Should `POST /auth/register` return different status codes for new vs. already-registered emails? → A: No — always return `201 Created` regardless of whether the email existed; collapsing the response removes the email enumeration signal without any functional impact on the UI
- Q: How should the `?redirect=` post-login parameter be validated? → A: Accept only values that start with `/` and do not start with `//`; anything else falls back to `/dashboard` — prevents open-redirect while keeping the rule simple and testable
- Q: Should CSRF token enforcement on POST auth routes be verified by integration tests? → A: Yes — `POST /auth/login`, `POST /auth/register`, and `POST /auth/logout` must return `403` when the CSRF token header is absent; this confirms `@fastify/csrf-protection` is active and not silently bypassed
- Q: How should concurrent first-run registration races be handled? → A: Catch unique-constraint violations in `RegisterUserUseCase`, re-check `hasAny()`, and return `RegistrationClosedError` if `true` — relies on the DB unique constraint as the final arbiter without needing a serializable transaction
- Q: Should the session cookie use `SameSite=Strict` or `SameSite=Lax`? → A: `SameSite=Strict` — this is a self-hosted single-origin app; Strict prevents all cross-site cookie sending with no practical downside; Lax is explicitly rejected
