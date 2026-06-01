# Quickstart: Multi-User Registration & User Management

**Feature**: `010-user-registration-management`
**Date**: 2026-06-01

This guide describes how to manually exercise the four primary user flows end-to-end against a local development environment.

---

## Prerequisites

- Local dev stack running: `pnpm dev` (API on port 4000, web on port 3000)
- Freshly migrated database (or a clean DB): `pnpm --filter @asciidocollab/db db:migrate`
- SMTP: configure a local mail catcher (e.g., Mailpit at `localhost:1025`, UI at `localhost:8025`) — set `ASCIIDOCOLLAB_SMTP_HOST=localhost ASCIIDOCOLLAB_SMTP_PORT=1025`
- At least one existing admin account (complete initial setup first)

---

## Flow 1: Admin Invites a New User

**Goal**: Verify that an admin can invite someone who does not yet have an account.

1. Sign in as the existing admin user.
2. Navigate to `/dashboard/admin/users`.
3. In the "Invite User" section, enter a new email address (e.g., `newuser@example.com`) and click "Send Invitation".
4. Confirm the "Invitation sent" message appears in the UI.
5. Open Mailpit (`localhost:8025`) and find the invitation email sent to `newuser@example.com`.
6. Click the invitation link in the email → you should land on `/accept-invite?token=...`.
7. Verify the recipient's email address is pre-filled and read-only.
8. Enter a display name and password, then submit.
9. Confirm you are signed in and redirected to `/dashboard`.
10. Sign out and sign back in as the admin; navigate to `/dashboard/admin/users` and verify `newuser@example.com` appears in the list with `Email Verified: Yes`.

**Security checks**:
- Try the same invitation link a second time → should see "invalid or has already been used" error.
- Try an expired link (manually set `expiresAt` in the past in the DB) → should see the expired error.

---

## Flow 2: Self-Registration with Email Verification

**Goal**: Verify that a new user can self-register when open registration is enabled.

1. Sign in as admin and navigate to `/dashboard/admin/users`.
2. Enable the "Allow users to self-register" toggle.
3. Sign out.
4. Navigate to `/login` → verify a "Create an account" link is now visible.
5. Click it → arrive at `/register`.
6. Fill in email (`selfreguser@example.com`), display name, and password, then submit.
7. Confirm the form is replaced with a "Check your email" message (you are NOT redirected to the dashboard).
8. Open Mailpit and find the verification email.
9. Click the verification link → land on `/verify-email?token=...` → see "Email verified, redirecting…"
10. Confirm redirect to `/dashboard` after 2 seconds.
11. Sign out and sign back in as admin; verify `selfreguser@example.com` appears with `Email Verified: Yes`.

**Security checks**:
- Submit the registration form again with the same email after verifying → should receive the same 202 "Check your email" message (anti-enumeration) but no email is actually sent.
- Log in as `selfreguser@example.com` without clicking the verification link → should be blocked with "Please verify your email" interstitial.
- Click "Resend verification email" from the interstitial and confirm a new email arrives in Mailpit (the old link should then be invalid).

---

## Flow 3: Admin Removes a User (with Project Ownership Transfer)

**Goal**: Verify that removing a sole-owner user transfers their projects to the admin and invalidates their session.

1. Using the invited user from Flow 1, create a new project as that user.
2. Confirm only that user is an owner (do not add other members, or add only viewers/editors).
3. Sign in as admin and navigate to `/dashboard/admin/users`.
4. Click "Remove" next to the Flow 1 user.
5. Confirm the dialog appears listing the project created in step 1.
6. Click "Confirm removal".
7. Verify the user no longer appears in the user list.
8. Navigate to `/dashboard` and confirm the transferred project now appears in the admin's project list with the admin as owner.
9. In a separate browser session (or incognito), confirm that the removed user's session is no longer valid (redirect to login).

---

## Flow 4: Admin Status Management

**Goal**: Verify admin promotion, demotion, and last-admin protection.

1. Invite a second user and accept the invitation (use Flow 1 as reference).
2. As admin, navigate to `/dashboard/admin/users`, find the second user, and click "Make Admin".
3. Confirm the second user's admin badge updates in the list.
4. Sign in as the second user; verify they can access `/dashboard/admin/users`.
5. Back as the original admin, click "Remove Admin" next to the second user → confirm the demotion succeeds.
6. Now try to demote the original admin themselves:
   - Ensure the "Remove Admin" button for your own account is either hidden or disabled.
7. Confirm that if only one admin exists, attempts to remove admin status from that user are blocked with a "cannot remove last admin" error.

---

## Disabling Open Registration

1. With open registration currently enabled (from Flow 2), sign in as admin.
2. Navigate to `/dashboard/admin/users` and disable the "Allow users to self-register" toggle.
3. Sign out.
4. Navigate to `/login` → confirm the "Create an account" link is no longer visible.
5. Navigate directly to `/register` → confirm you are redirected to `/login`.
