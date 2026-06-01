import { test, expect } from '@playwright/test';
import {
  ensureTestUser,
  loginAdminViaApi,
  adminDeleteUserByEmail,
  TEST_USER,
} from './helpers/test-user';
import { clearMailpit, waitForEmail, extractInvitationToken } from './helpers/mailpit';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

test.describe('Registration via invitation (US1)', () => {
  test.beforeAll(async () => {
    await ensureTestUser();
  });

  test('admin can send invitation and invitee completes registration', async ({ page }) => {
    const email = `invitee-${Date.now()}@example.com`;
    const password = 'InviteeP@ssw0rd123!';

    await loginAdminViaApi(page);
    await clearMailpit();

    try {
      // Admin sends invitation
      const inviteResp = await page.request.post(`${API_URL}/admin/users/invite`, {
        data: { email },
      });
      expect(inviteResp.status()).toBe(201);

      // Get invitation token from Mailpit
      const emailMessage = await waitForEmail(email);
      const token = extractInvitationToken(emailMessage.HTML);

      // Clear admin session — invitee registers without being signed in
      await page.context().clearCookies();

      // Visit the accept-invite page
      await page.goto(`/accept-invite?token=${token}`);
      await expect(page.getByText(/complete your registration/i)).toBeVisible({ timeout: 5000 });
      await expect(page.getByDisplayValue(email)).toBeVisible();

      // Fill in the registration form
      await page.getByLabel(/display name/i).fill('New Invitee');
      await page.getByLabel(/password/i).fill(password);
      await page.getByRole('button', { name: /create account/i }).click();

      // Should land on /dashboard (invitation-based accounts are pre-verified)
      await page.waitForURL(/\/dashboard/, { timeout: 8000 });
    } finally {
      await loginAdminViaApi(page);
      await adminDeleteUserByEmail(page, email);
    }
  });

  test('expired invitation link shows error', async ({ page }) => {
    // A syntactically plausible but non-existent token is treated as expired/invalid.
    await page.goto('/accept-invite?token=expired-invalid-token-xyz-000');
    await expect(page.getByText(/invalid|expired/i)).toBeVisible({ timeout: 5000 });
  });

  test('already-used invitation shows error', async ({ page }) => {
    const email = `used-invite-${Date.now()}@example.com`;

    await loginAdminViaApi(page);
    await clearMailpit();

    try {
      await page.request.post(`${API_URL}/admin/users/invite`, { data: { email } });

      const emailMessage = await waitForEmail(email);
      const token = extractInvitationToken(emailMessage.HTML);

      // Accept the invitation once via API
      const acceptResp = await page.request.post(`${API_URL}/auth/accept-invite`, {
        data: { token, displayName: 'First Accept', password: 'TestP@ssw0rd123!' },
      });
      expect(acceptResp.status()).toBe(201);

      // Clear session so we're not authenticated
      await page.context().clearCookies();

      // Attempt to use the same token again via the UI
      await page.goto(`/accept-invite?token=${token}`);
      await expect(page.getByText(/invalid|expired|already been used/i)).toBeVisible({ timeout: 5000 });
    } finally {
      await loginAdminViaApi(page);
      await adminDeleteUserByEmail(page, email);
    }
  });

  test('duplicate email rejection on invite', async ({ page }) => {
    await loginAdminViaApi(page);

    // Try to invite the already-registered admin email — should get 409
    const resp = await page.request.post(`${API_URL}/admin/users/invite`, {
      data: { email: TEST_USER.email },
    });
    expect(resp.status()).toBe(409);
  });

  test('accept-invite page shows invalid state for bad token', async ({ page }) => {
    await page.goto('/accept-invite?token=invalid-token-xyz');
    await expect(page.locator('text=/invalid|expired/i')).toBeVisible({ timeout: 5000 });
  });
});
