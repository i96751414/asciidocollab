# Feature Specification: Account Management & Password Forms

**Feature Branch**: `008-account-password-forms`

**Created**: 2026-05-31

**Status**: Draft

**Input**: Password management web forms matching account creation (field validation, button enable/disable), plus an account management page allowing users to update display name, email (with confirmation), and password independently.

---

## Clarifications

### Session 2026-05-31

- Q: Where should the account management entry point be placed in the dashboard UI? → A: In the dashboard header, next to the Sign Out button (not in the sidebar)
- Q: What label should the account management button carry? → A: "Account"

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Forgot Password Request (Priority: P1)

A logged-out user who has forgotten their password can request a reset link by entering their email address. The system sends a reset email without revealing whether the address is registered.

**Why this priority**: Unlocks access recovery — a blocking flow for users who cannot log in at all.

**Independent Test**: Navigate to `/forgot-password`, enter any email, submit. The page confirms the email was sent regardless of whether the address exists. Can be tested end-to-end without building any other new form.

**Acceptance Scenarios**:

1. **Given** a user on `/forgot-password`, **When** they enter a valid email and submit, **Then** the button is disabled during submission and a confirmation message appears stating a reset link was sent (regardless of whether the email exists).
2. **Given** a user on `/forgot-password`, **When** they enter an invalid email format, **Then** the submit button is disabled and an inline field error appears after the field is blurred.
3. **Given** a user on `/forgot-password`, **When** the request is rate-limited, **Then** an error message explains when they may try again.

---

### User Story 2 - Reset Password via Token (Priority: P1)

A user who received a reset email can follow the link and set a new password. The new password is validated against the same policy as account creation before submission is allowed.

**Why this priority**: Completes the account recovery flow started in User Story 1 — neither is useful without the other.

**Independent Test**: Visit `/reset-password?token=<valid-token>`, enter a new password and confirmation, submit. Verify the user can subsequently log in with the new password.

**Acceptance Scenarios**:

1. **Given** a user on `/reset-password` with a valid token, **When** they enter a valid new password and matching confirmation, **Then** the submit button is enabled and submission succeeds with a redirect to the login page.
2. **Given** a user on `/reset-password`, **When** the new password does not meet policy requirements, **Then** inline errors appear after the field is blurred and the submit button remains disabled.
3. **Given** a user on `/reset-password`, **When** the confirmation password does not match, **Then** an inline error appears on the confirmation field and the submit button remains disabled.
4. **Given** a user on `/reset-password` with an expired or already-used token, **Then** the page shows an error explaining the link is invalid and offers a link back to `/forgot-password`.

---

### User Story 3 - Change Password (Priority: P2)

A logged-in user can change their password from the account management page by providing their current password and a new password that meets the site's policy.

**Why this priority**: Important security feature for authenticated users; depends on the account page being built.

**Independent Test**: Navigate to `/dashboard/account`, fill in the Password card, submit. Verify the user can log in with the new password and that the old password no longer works.

**Acceptance Scenarios**:

1. **Given** a logged-in user on `/dashboard/account`, **When** they fill in current password, a policy-compliant new password, and a matching confirmation, **Then** the Save button is enabled and submission shows an inline success confirmation.
2. **Given** the password card, **When** any of the three fields is empty, **Then** the Save button is disabled.
3. **Given** the password card, **When** the new password does not meet policy, **Then** inline field errors appear after blur and the Save button is disabled.
4. **Given** the password card, **When** the submitted current password is incorrect, **Then** an error message appears and the fields are not cleared.
5. **Given** the password card, **When** submission succeeds, **Then** all three password fields are cleared and an inline "Password updated" message appears briefly.

---

### User Story 4 - Change Display Name (Priority: P2)

A logged-in user can update their display name from the account management page independently of other account fields.

**Why this priority**: Basic account self-service; completes the account page alongside User Stories 3 and 5.

**Independent Test**: Navigate to `/dashboard/account`, change the display name, save. Verify the updated name appears in the UI.

**Acceptance Scenarios**:

1. **Given** a logged-in user on `/dashboard/account`, **When** they change the display name to a non-empty value (max 100 characters) and save, **Then** the Save button is enabled and an inline "Saved" confirmation appears briefly.
2. **Given** the Display Name card, **When** the name is the same as the current value or is empty, **Then** the Save button is disabled.
3. **Given** the Display Name card, **When** the name exceeds 100 characters, **Then** an inline error appears and the Save button is disabled.

---

### User Story 5 - Request Email Change (Priority: P3)

A logged-in user can request an email address change. The system sends a confirmation link to the new address; the current email remains active until the change is confirmed.

**Why this priority**: More complex than name/password changes due to the two-step confirmation; lower priority than other account card features.

**Independent Test**: Navigate to `/dashboard/account`, enter a new email in the Email card, save. Verify a banner appears explaining a confirmation email was sent to the new address. Verify the displayed current email has not changed.

**Acceptance Scenarios**:

1. **Given** a logged-in user on `/dashboard/account`, **When** they enter a valid, different email and save, **Then** the form is replaced with a banner: "Check your email at `<newEmail>` to confirm the change."
2. **Given** the Email card, **When** the entered email is the same as the current email or is invalid, **Then** the Save button is disabled.
3. **Given** a user who clicks the confirmation link in the email, **Then** their account email is updated, they are redirected to `/dashboard/account`, and a one-time success message is displayed on the account page confirming the email has been updated.
4. **Given** a user who clicks an expired or already-used confirmation link, **Then** an error page explains the link is invalid and offers a link back to the account page.

---

### Edge Cases

- What happens when a user submits a reset or email-confirm token that is expired? The page shows a clear error and a link to restart the flow.
- What happens when a user requests multiple password resets? Each new request invalidates prior tokens (or the most recent is used — system follows existing password reset token behavior).
- What happens when a user requests an email change to an address already in use by another account? The system responds with the same success banner to avoid email enumeration.
- What happens when a user navigates to `/reset-password` without a token in the URL? The page shows an error and links back to `/forgot-password`.
- What happens when the server password policy changes between when the form was loaded and when the user submits? The server returns a validation error and the form displays the updated policy requirement.

---

## Requirements *(mandatory)*

### Functional Requirements

**Forgot Password Form**

- **FR-001**: The system MUST provide a `/forgot-password` page accessible to unauthenticated users.
- **FR-002**: The forgot-password form MUST disable the submit button while the email field contains an invalid email format.
- **FR-003**: The forgot-password form MUST disable the submit button while a submission is in progress.
- **FR-004**: The system MUST send a password reset email when the submitted address matches an existing account, and return the same success response when it does not (email enumeration prevention).

**Reset Password Form**

- **FR-005**: The system MUST provide a `/reset-password` page that reads the reset token from the URL.
- **FR-006**: The reset-password form MUST validate the new password against the server-provided policy using the same rules and error messages as the registration form.
- **FR-007**: The reset-password form MUST validate that the confirmation password matches the new password.
- **FR-008**: The reset-password form MUST disable the submit button when validation fails or a submission is in progress.
- **FR-009**: The system MUST display a clear error when the token is missing, expired, or already used, with a link back to `/forgot-password`.
- **FR-010**: On successful reset, the system MUST redirect the user to the login page.

**Account Management Page**

- **FR-011**: The system MUST provide a `/dashboard/account` page accessible only to authenticated users.
- **FR-011a**: The dashboard header MUST include an "Account" button placed adjacent to the Sign Out button, linking to `/dashboard/account`.
- **FR-012**: The account page MUST display three independent cards: Display Name, Email, and Password.
- **FR-013**: Each card MUST have its own Save button, pending state, and success/error feedback, fully isolated from the other cards.
- **FR-014**: The account page MUST pre-populate the Display Name and Email cards with the user's current values on load.

**Display Name Card**

- **FR-015**: The Display Name card MUST disable the Save button when the value is unchanged from the current name, is empty, exceeds 100 characters, or a submission is in progress.
- **FR-016**: On successful save, the Display Name card MUST show an inline confirmation that clears after a short delay.

**Email Card**

- **FR-017**: The Email card MUST disable the Save button when the entered email is the same as the current email, is not a valid email format, or a submission is in progress.
- **FR-018**: On submission, the system MUST send a confirmation link to the new email address; the user's current email MUST remain unchanged until the link is clicked.
- **FR-019**: The new email address MUST be stored server-side alongside the confirmation token — it MUST NOT appear in the confirmation link URL.
- **FR-020**: On submission, the Email card MUST hide the form and show a persistent banner indicating a confirmation email was sent to the new address.
- **FR-021**: The email confirmation link MUST show a clear error page when the token is expired or already used, with a link back to `/dashboard/account`.

**Password Card**

- **FR-022**: The Password card MUST require current password, new password, and confirmation password fields.
- **FR-023**: The Password card MUST validate the new password against the server-provided policy using the same rules and error messages as the registration form.
- **FR-024**: The Password card MUST disable the Save button when any field is empty, validation fails, or a submission is in progress.
- **FR-025**: On successful save, all three password fields MUST be cleared and an inline confirmation shown briefly.

**Shared Form Behaviour**

- **FR-026**: All new forms MUST show field validation errors only after the user has blurred (left) the field or attempted to submit.
- **FR-027**: On attempted submit with invalid fields, all fields MUST be marked as touched so their errors become visible.
- **FR-028**: The password schema utility MUST be shared across the registration form, reset-password form, and password card to ensure policy rules are applied consistently.

### Key Entities

- **EmailChangeToken**: A server-side record linking a user to a pending new email address, identified by a securely hashed one-time token, with an expiry time and a used flag. Mirrors the existing PasswordResetToken pattern.
- **UserProfile**: The user's current `displayName` and `email`, served from the authenticated profile endpoint and pre-populated into the account page.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user who has forgotten their password can regain access to their account in under 5 minutes, including receiving and following the reset email.
- **SC-002**: All new forms disable the submit button under the same conditions as the existing registration form (invalid state or pending submission), with no regression to the registration form behaviour.
- **SC-003**: The password validation rules shown on the reset and change-password forms are always consistent with those enforced by the registration form — no divergence is possible.
- **SC-004**: A user can update their display name, initiate an email change, and change their password each independently from the account page without triggering validation or state from the other cards.
- **SC-005**: The email change flow does not expose the new email address in any URL — the confirmation link contains only an opaque token.
- **SC-006**: All new forms display field-level error messages in the same style and at the same timing as the registration form.

---

## Assumptions

- The password policy is fetched from the server at page load for all forms that need it (consistent with the existing registration form approach).
- The login form already has a "Forgot password?" link location — if not, one will be added to link to `/forgot-password`.
- Email sending infrastructure is already in place (used by the existing password reset request flow).
- The email change confirmation token uses the same secure hashing and expiry model as the existing password reset token.
- Only one pending email change per user is active at a time; a new request supersedes any prior unconfirmed request.
- The account management page is linked from the dashboard header, via a button placed next to the Sign Out button. It is not in the sidebar navigation.
- Mobile responsiveness follows the existing card-based UI patterns already used in the dashboard.
- The "Saved" / "Password updated" inline success confirmation auto-dismisses after approximately 3 seconds.
