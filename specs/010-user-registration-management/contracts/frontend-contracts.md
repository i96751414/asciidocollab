# Frontend Contracts: Multi-User Registration & User Management

**Feature**: `010-user-registration-management`
**Date**: 2026-06-01

---

## New Pages

### `/register` *(modified)*

**Current behaviour**: Only accessible during initial setup (first user).
**New behaviour**: Also accessible when `openRegistration = true`; blocked (redirect to login) when `openRegistration = false` and setup is complete.

**Gate logic** (server-side via middleware or page-level check):
- If setup not complete → show registration form (initial admin path, existing behaviour).
- If setup complete AND `openRegistration = true` → show registration form (self-registration path).
- If setup complete AND `openRegistration = false` → redirect to `/login`.

**UX changes**:
- On successful self-registration (202 response): replace the form with a "Check your email" message. Do not redirect to the dashboard — the account is unverified.
- Form fields: email, display name, password (unchanged from current).

---

### `/verify-email` *(new)*

Route: `/verify-email?token=<raw_token>`

**On mount**: Immediately calls `GET /auth/verify-email?token=...`

| API result | UI |
|------------|-----|
| Success | "Your email has been verified. Redirecting to dashboard…" → redirect after 2s |
| Invalid / used token | "This verification link is invalid or has already been used." + link to request a new one |
| Expired token | "This verification link has expired." + button "Resend verification email" |

**Post-login gate**: If the authenticated user is unverified, all dashboard redirects land on a "Verify your email" interstitial page. The interstitial shows:
- "We sent a verification email to [email]. Please check your inbox."
- "Didn't receive it?" → button calls `POST /auth/resend-verification` (rate-limited feedback).

---

### `/accept-invite` *(new)*

Route: `/accept-invite?token=<raw_token>`

**On mount**: Calls `GET /auth/accept-invite?token=...` to validate the token and retrieve the recipient email.

| Validation result | UI |
|------------------|-----|
| Token valid | Show registration completion form (display name + password, email pre-filled and read-only) |
| Token invalid / expired / used | "This invitation link is invalid or has expired. Please ask an administrator to send a new invitation." |

**On form submit**: Calls `POST /auth/accept-invite`. On success (201), redirect to `/dashboard`.

---

### `/dashboard/admin/users` *(new)*

Admin-only page. Redirects to `/403` if the current user is not an admin.

**Sections**:

1. **Open Registration Toggle**
   - Label: "Allow users to self-register from the login page"
   - Toggle switch bound to `GET/PATCH /admin/settings`
   - Change takes effect immediately; no page reload needed.

2. **User List**
   - Table columns: Display Name, Email, Admin, Email Verified, Registration Method (Invited / Self-registered), Actions
   - Per-row actions:
     - **Make Admin / Remove Admin** toggle (disabled for self, disabled if target is last admin)
     - **Remove** button (opens confirmation dialog; shows project ownership transfer warning when applicable)

3. **Invite User**
   - Inline form: email input + "Send Invitation" button
   - On success: show "Invitation sent to [email]"
   - On 409 (already registered): "This email is already registered"
   - On 409 (already pending): "An invitation has already been sent to this email"

**Removal confirmation dialog**:
- Calls `GET /admin/users/:id/removal-preview` when dialog opens.
- If `projectsToTransfer.length > 0`: warns "The following projects are solely owned by this user and will be transferred to you: [list]"
- Requires clicking a "Confirm removal" button (no typing required, but explicit click on the destructive action).

---

## Modified Components

### Login page (`/login`)

- Add conditional "Create an account" link below the sign-in form.
- Link is shown only when `openRegistration = true` (fetched from `GET /auth/open-registration-status` on page load).
- Link navigates to `/register`.

---

### Dashboard layout / middleware

- After authentication check, add `emailVerified` check.
- If `session.emailVerified === false`: redirect to `/verify-email-required` interstitial (see `/verify-email` above).
- Exempt routes from this check: `/verify-email`, `/verify-email-required`, `/auth/resend-verification` (API).

---

### Nav / sidebar

- Add "Users" link under admin section (visible only to `isAdmin` users).
- Route: `/dashboard/admin/users`

---

## API Client additions (`apps/web/src/lib/api.ts`)

```typescript
// Admin
getAdminUsers(): Promise<AdminUserDto[]>
inviteUser(email: string): Promise<void>
setAdminStatus(userId: string, isAdmin: boolean): Promise<void>
getUserRemovalPreview(userId: string): Promise<UserRemovalPreviewDto>
removeUser(userId: string): Promise<void>
getAdminSettings(): Promise<AdminSettingsDto>
updateAdminSettings(settings: Partial<AdminSettingsDto>): Promise<AdminSettingsDto>

// Auth
getOpenRegistrationStatus(): Promise<{ openRegistration: boolean }>
verifyEmail(token: string): Promise<void>
acceptInvite(token: string, displayName: string, password: string): Promise<void>
getInvitePreview(token: string): Promise<{ email: string }>
resendVerification(): Promise<void>
```
