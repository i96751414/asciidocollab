# Feature Specification: Multi-User Registration & User Management

**Feature Branch**: `010-user-registration-management`

**Created**: 2026-06-01

**Status**: Draft

**Input**: User description: "allow other users to register after the initial setup, new users need to validate their email, only after email validation they will be able to use the application, registering can be achieved through the login page (if enabled through an option) or by an admin sending an invitation (always allowed), administrators have a page to manage users (users can be seen, added through an invite, removed, admin status changed)"

## Clarifications

### Session 2026-06-01

- Q: Is the open registration setting enforced at the server/API level, or only in the frontend? → A: The backend API endpoint must reject self-registration requests when open registration is disabled, regardless of how the request is made (UI or direct API call). Frontend hiding of the link is supplementary only.
- Q: Should email verification status be visible to admins in the user management list? → A: Yes — already specified in FR-012 (confirmed, no spec change required).
- Q: Can unverified users log in and receive a session, or are they blocked at the login step? → A: Unverified users can log in and receive a session; all protected pages redirect them to a verification-required interstitial; the resend-verification endpoint is accessible while authenticated but unverified.
- Q: If SMTP is unavailable when sending an invitation or verification email, should the operation fail atomically or succeed with a background delivery attempt? → A: Fail atomically — if the email cannot be sent, no invitation record is saved and the caller receives an error. Applies to both invitation emails and initial verification emails.
- Q: Should revoking admin status invalidate the target user's active sessions? → A: No — sessions are preserved; the domain layer re-checks isAdmin against the live DB on every admin operation, so the demoted user is immediately blocked from admin actions without a forced logout.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Admin Invites a New User (Priority: P1)

An administrator navigates to the user management page, enters a new user's email address, and sends an invitation. The invited person receives an email with a time-limited registration link. They click the link, provide a display name and password, and their account is created and immediately active — no separate email verification step is needed, since clicking the invitation link from their inbox already confirms ownership of that address.

**Why this priority**: Admin-driven invitation is always available regardless of any system setting. It is the only registration path guaranteed to work in all configurations, and it directly enables multi-user collaboration — the core value of this platform.

**Independent Test**: Can be fully tested by logging in as an admin, sending an invitation, opening the invitation email, completing the registration form, logging in as the new user, and confirming access to the dashboard.

**Acceptance Scenarios**:

1. **Given** an administrator is on the user management page, **When** they enter a valid email address and send an invitation, **Then** the system sends an invitation email to that address and shows a confirmation.
2. **Given** an invitation email has been sent, **When** the recipient clicks the registration link before it expires, **Then** they are taken to a registration completion page where they can set a display name and password.
3. **Given** the invited user submits the registration form with valid data, **When** the form is submitted, **Then** their account is created, they are signed in, and they can access the application.
4. **Given** an invitation link, **When** it is accessed after its expiry period, **Then** the system displays a clear message that the invitation has expired and prompts the user to request a new one.
5. **Given** an invitation has already been accepted, **When** the same link is used again, **Then** the system rejects it with a clear message that the invitation has already been used.
6. **Given** an administrator sends an invitation to an email already registered in the system, **When** they submit the form, **Then** the system displays an error indicating that the email is already in use.

---

### User Story 2 - New User Self-Registers via Login Page (Priority: P2)

When open registration is enabled, a person who does not have an account visits the login page and sees a link to register. They fill in their email, display name, and password, and submit the form. The system creates their account in a pending state and immediately sends a verification email. The user must click the link in that email before they can access any part of the application.

**Why this priority**: Self-registration reduces friction for onboarding users at scale and removes the dependency on admin action for every new member. However, it only works when the feature is enabled and requires email verification as a security gate.

**Independent Test**: Can be fully tested by enabling open registration, visiting the login page as an unauthenticated user, completing the registration form, opening the verification email, clicking the link, and confirming access to the dashboard.

**Acceptance Scenarios**:

1. **Given** open registration is enabled, **When** an unauthenticated user visits the login page, **Then** a registration link is visible.
2. **Given** open registration is disabled, **When** an unauthenticated user visits the login page, **Then** no registration link is shown.
3. **Given** the registration form is submitted with a valid email, display name, and password, **When** the form is submitted, **Then** the account is created in an unverified state and a verification email is sent.
4. **Given** a user with an unverified email attempts to access any protected page, **When** they try to navigate, **Then** they are blocked and shown a message explaining that they must verify their email first.
5. **Given** the verification email has been received, **When** the user clicks the verification link before it expires, **Then** their account is activated and they are redirected to the application.
6. **Given** a verification link has expired, **When** the user clicks it, **Then** they see a clear message and are offered the option to request a new verification email.
7. **Given** a user submits the registration form with an email already registered, **When** the form is submitted, **Then** the system displays an error without revealing whether the email is in use (to prevent user enumeration).
8. **Given** a self-registered user whose email is not yet verified, **When** they submit valid credentials on the login page, **Then** they receive a session and are immediately redirected to the email verification interstitial rather than the dashboard; from there they can request a new verification email without logging out.

---

### User Story 3 - Administrator Views and Manages Users (Priority: P2)

An administrator navigates to a dedicated user management page. They can see a list of all users in the system — their display name, email address, admin status, and whether they have verified their email. From this page, the admin can promote or demote other users to/from administrator status, remove users from the system, and toggle whether open self-registration is available on the login page.

**Why this priority**: Without this page, administrators have no way to oversee who has access to the platform or to respond to departures, policy changes, or mis-registrations.

**Independent Test**: Can be fully tested by creating several users (via invitation and self-registration), navigating to the management page as admin, verifying all users appear, changing a user's admin status, and removing a user.

**Acceptance Scenarios**:

1. **Given** an administrator is authenticated, **When** they navigate to the user management page, **Then** all registered users are displayed with their display name, email, admin status, and email verification status.
2. **Given** a non-administrator is authenticated, **When** they attempt to access the user management page, **Then** they are denied access with a clear error.
3. **Given** an administrator is viewing the user list, **When** they toggle admin status for another user, **Then** the change takes effect immediately and the updated status is reflected in the list.
4. **Given** an administrator attempts to remove their own account, **When** the action is triggered, **Then** the system prevents it with a clear explanation.
5. **Given** the last administrator account exists, **When** an attempt is made to revoke its admin status, **Then** the system prevents the action to avoid lockout.
6. **Given** an administrator removes a user who is the sole owner of one or more projects, **When** they initiate the removal, **Then** the system shows a warning listing those projects and requires explicit confirmation before proceeding.
7. **Given** the administrator confirms removal of a sole-owner user, **When** the action completes, **Then** ownership of the affected projects is transferred to the removing administrator, the user's account is deactivated, active sessions are invalidated, and the user no longer appears in the list.
8. **Given** an administrator removes a user who is not the sole owner of any project, **When** the removal is confirmed, **Then** the account is deactivated and sessions are invalidated immediately without a project-ownership warning.
9. **Given** a removed user attempts to log in, **When** they submit credentials, **Then** they are denied access with a generic authentication error.
10. **Given** an administrator is on the user management page, **When** they toggle the open registration setting, **Then** the change takes effect immediately and is persisted across server restarts.

---

### User Story 4 - Controlling Open Registration (Priority: P3)

An administrator can enable or disable open self-registration directly from the user management page without any server changes. When disabled, only invitation-based registration is available. When enabled, anyone with the application URL can self-register.

**Why this priority**: Controlling who can register is essential for private or closed deployments. This setting does not affect the core collaboration features and can be addressed after the primary registration flows are working.

**Independent Test**: Can be fully tested by navigating to the user management page as admin, toggling the open registration setting, then visiting the login page as an unauthenticated user and confirming that the registration link appears or disappears accordingly.

**Acceptance Scenarios**:

1. **Given** open registration is currently disabled, **When** an administrator enables it from the user management page, **Then** the login page displays a registration link immediately on next page load.
2. **Given** open registration is currently enabled, **When** an administrator disables it, **Then** the registration link is no longer shown on the login page, direct navigation to the registration UI is blocked, and any direct API call to the self-registration endpoint returns an error indicating registration is closed.
3. **Given** the open registration toggle has been changed, **When** the server restarts, **Then** the setting is preserved.

---

### Edge Cases

- What happens if the email server is unavailable when sending an invitation or verification email? (The operation fails atomically — no invitation record or user account is saved; the caller receives an error and may retry once the issue is resolved.)
- What happens if an invitation email is sent successfully but later bounces (e.g., full inbox)? (The invitation record exists; the token is still valid until it expires. Admin may send a new invitation if the recipient reports not receiving it.)
- What if an admin is removed while they are the sole admin? (System prevents removal of the last admin account.)
- What if a user verifies their email but then the admin removes their account before they log in? (Account is removed; verification link becomes invalid.)
- What if open registration is enabled and someone registers with a disposable email? (Out of scope — no domain filtering in this feature.)
- What if a user's invitation has expired and they have no way to re-register? (They contact an admin who can send a new invitation; no self-service re-invite flow in this feature.)

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow administrators to invite new users by entering an email address on the user management page.
- **FR-002**: System MUST send invitation emails containing a time-limited, single-use registration link. If the email cannot be delivered (e.g., SMTP unavailable), the invitation MUST NOT be saved and the administrator MUST receive an error; they may retry the invitation once the issue is resolved.
- **FR-003**: Invited users MUST be required to set a display name and password upon accepting the invitation; accepting the invitation is sufficient email verification.
- **FR-004**: System MUST support self-registration via a form accessible from the login page when open registration is enabled.
- **FR-005**: Open registration MUST be controllable via a toggle that administrators can enable or disable at runtime from the user management page; no server restart is required to change the setting; the toggle state persists across restarts.
- **FR-005a**: When open registration is disabled, the self-registration endpoint MUST reject requests at the server (API) level regardless of how the request is made — whether through the frontend UI or by calling the endpoint directly (e.g., via a script or API client). Frontend hiding of the registration link is supplementary, not the primary enforcement mechanism.
- **FR-006**: All self-registered users MUST verify their email address before accessing any part of the application.
- **FR-007**: System MUST send a verification email immediately after self-registration. If the email cannot be delivered, the account MUST NOT be created and the user MUST receive an error so they can retry. The resend-verification flow (FR-010) is exempt from this atomicity requirement — delivery failure there is logged but does not block the resend action from being retried.
- **FR-008**: Unverified users MAY log in and receive a session; however, they MUST be blocked from all application pages and redirected to a verification-required interstitial. The resend-verification endpoint MUST remain accessible to authenticated-but-unverified users so they can request a new link without admin intervention.
- **FR-009**: Email verification links MUST be time-limited and single-use.
- **FR-010**: System MUST allow users to request a new verification email if their link has expired.
- **FR-011**: Administrators MUST have access to a dedicated user management page listing all users.
- **FR-012**: The user list MUST display each user's display name, email address, admin status, and email verification status.
- **FR-013**: Administrators MUST be able to grant and revoke admin status for other users (not their own account). Admin status changes take effect immediately at the API level via a live database check on every admin operation; active sessions are NOT invalidated — the affected user remains logged in but loses (or gains) the ability to perform admin operations on the next request.
- **FR-014**: System MUST prevent the last administrator from being demoted or removed, to avoid total administrator lockout.
- **FR-015**: Administrators MUST be able to remove users; removal MUST invalidate any active sessions for the removed user.
- **FR-016**: Administrators MUST NOT be able to remove their own account through the user management page.
- **FR-017**: When a user is removed, if they are the sole owner of one or more projects, ownership of those projects MUST be transferred to the administrator performing the removal.
- **FR-018a**: Before confirming a removal that would trigger project ownership transfer, the system MUST warn the administrator, listing the affected projects, and require explicit confirmation.
- **FR-018**: Only administrators MUST be able to access the user management page; non-admin users MUST be denied access.

### Key Entities

- **User**: email address, display name, password credential, admin status (boolean), email verification status (boolean; false for self-registered until verified, true for invited), registration method (self-registered / invited), created at timestamp. Removal is a hard-delete — there is no "removed" status; the record ceases to exist.
- **Invitation**: recipient email address, issuing administrator, registration token, expiry timestamp, status (pending / accepted / expired / revoked).
- **System Setting**: persisted key-value store for application-wide toggles, including the open registration enabled flag; changes take effect immediately and survive restarts.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An administrator can invite a new user and send the invitation in under 60 seconds.
- **SC-002**: A new user can complete self-registration (form submission through email verification) in under 5 minutes, assuming the verification email arrives promptly.
- **SC-003**: Verification and invitation emails are delivered to the recipient's inbox within 2 minutes of the triggering action under normal conditions.
- **SC-004**: Unverified users are blocked from all protected pages with 100% consistency — no authenticated content is accessible before verification.
- **SC-005**: Administrators can view, change roles, and remove users entirely from a single page without navigating away.
- **SC-006**: There is zero path by which the system can be left without at least one administrator (system enforces last-admin protection).

## Assumptions

- Only the first registered user (created during initial setup) is automatically an administrator; all subsequently registered users start with no admin privileges.
- Accepting an invitation link constitutes email verification — invited users do not go through a separate email verification step after completing their registration form.
- Invitation links expire after 72 hours (industry standard); a new invitation must be sent by an admin if the original expires.
- Email verification links for self-registered users expire after 24 hours; users can request a new one from the verification prompt.
- Removing a user deactivates their account immediately and invalidates active sessions; if the removed user is the sole owner of any projects, ownership transfers to the removing administrator.
- If the removed user is a co-owner (member with owner role) alongside other owners, no project ownership transfer occurs — those projects remain with the other owners.
- The user management page is only accessible to users with administrator status; there is no separate "user admin" role.
- The open registration toggle is a runtime setting managed through the user management page; no environment variable or config file override is provided in this feature.
- No bulk operations (bulk invite, bulk remove) are required in this version.
- Password strength requirements follow the same policy already in place for the initial registration flow.
- No email domain allowlist or blocklist is included in this feature.
- Mobile responsiveness for the user management page follows the existing UI conventions of the application.
