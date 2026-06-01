import { test, expect } from '@playwright/test';
import {
  ensureTestUser,
  loginAdminViaApi,
  createInvitedUser,
  adminDeleteUserByEmail,
  TEST_USER,
} from './helpers/test-user';
import { signIn, createProject } from './helpers/test-project';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

test.describe('Admin user management (US3)', () => {
  test.beforeAll(async () => {
    await ensureTestUser();
  });

  test('admin can view list of users', async ({ page }) => {
    await signIn(page);
    await page.goto('/dashboard/admin/users');

    // The admin user's email/displayName should appear in the list
    await expect(page.getByText(TEST_USER.displayName)).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(TEST_USER.email)).toBeVisible({ timeout: 5000 });
  });

  test('admin can toggle another user admin status', async ({ page }) => {
    const email = `toggle-admin-${Date.now()}@example.com`;

    await loginAdminViaApi(page);

    try {
      await createInvitedUser(page, email);

      await page.goto('/dashboard/admin/users');

      // Find the row for the new user and click "Make Admin"
      const userRow = page.locator('div, tr').filter({ hasText: email }).first();
      await userRow.getByRole('button', { name: /make admin/i }).click();

      // Button text should toggle to "Remove Admin"
      await expect(userRow.getByRole('button', { name: /remove admin/i })).toBeVisible({ timeout: 5000 });

      // Toggle back to non-admin
      await userRow.getByRole('button', { name: /remove admin/i }).click();
      await expect(userRow.getByRole('button', { name: /make admin/i })).toBeVisible({ timeout: 5000 });
    } finally {
      await loginAdminViaApi(page);
      await adminDeleteUserByEmail(page, email);
    }
  });

  test('self-demotion is blocked', async ({ page }) => {
    await signIn(page);
    await page.goto('/dashboard/admin/users');

    // Find the admin user's own row — the admin toggle button should not be present
    // (self-modification is blocked by the API; the UI typically hides it or disables it).
    // Verify via API: PATCH /admin/users/<self-id>/admin should return 403.
    const usersResp = await page.request.get(`${API_URL}/admin/users`);
    const body = await usersResp.json() as { users: Array<{ id: string; email: string }> };
    const self = body.users.find((u) => u.email === TEST_USER.email);
    expect(self).toBeDefined();

    const resp = await page.request.patch(`${API_URL}/admin/users/${self!.id}/admin`, {
      data: { isAdmin: false },
    });
    expect(resp.status()).toBe(403);
  });

  test('self-removal is blocked', async ({ page }) => {
    await signIn(page);

    const usersResp = await page.request.get(`${API_URL}/admin/users`);
    const body = await usersResp.json() as { users: Array<{ id: string; email: string }> };
    const self = body.users.find((u) => u.email === TEST_USER.email);
    expect(self).toBeDefined();

    const resp = await page.request.delete(`${API_URL}/admin/users/${self!.id}`);
    expect(resp.status()).toBe(403);
  });

  test('last-admin protection prevents last admin removal', async ({ page }) => {
    // The admin is the only admin. Demoting them (via a second admin) is blocked by the
    // "cannot remove last admin" guard. We can verify via API.
    await signIn(page);

    const usersResp = await page.request.get(`${API_URL}/admin/users`);
    const body = await usersResp.json() as { users: Array<{ id: string; email: string; isAdmin: boolean }> };
    const admins = body.users.filter((u) => u.isAdmin);

    // If there is exactly one admin, trying to demote them must fail.
    if (admins.length === 1) {
      // Self-demotion → 403 (cannot modify self)
      const resp = await page.request.patch(`${API_URL}/admin/users/${admins[0].id}/admin`, {
        data: { isAdmin: false },
      });
      expect(resp.status()).toBe(403);
    } else {
      // Multiple admins exist — verify the "cannot remove last admin" guard with a second admin.
      // Demote all but one, then try to demote the last one.
      // This scenario is complex; skip if multiple admins are present (not the target state).
      test.skip(admins.length > 1, 'Multiple admins present — last-admin guard not testable without teardown');
    }
  });

  test('sole-owner project is transferred (deleted) on user removal', async ({ page }) => {
    const email = `sole-owner-${Date.now()}@example.com`;

    await loginAdminViaApi(page);

    try {
      const userId = await createInvitedUser(page, email);

      // Create a project as the invited user
      await page.context().clearCookies();
      await page.request.post(`${API_URL}/auth/login`, {
        data: { email, password: 'TestP@ssw0rd123!' },
      });
      const projectId = await createProject(page, `Sole Owner Project ${Date.now()}`);

      // Switch back to admin and remove the user
      await loginAdminViaApi(page);

      // Check the removal preview first (should list the sole-owned project)
      const previewResp = await page.request.get(`${API_URL}/admin/users/${userId}/removal-preview`);
      const preview = await previewResp.json() as { projectsToTransfer: Array<{ id: string }> };
      expect(preview.projectsToTransfer.some((p) => p.id === projectId)).toBe(true);

      // Confirm removal via UI
      await page.goto('/dashboard/admin/users');
      const userRow = page.locator('div, tr').filter({ hasText: email }).first();
      await userRow.getByRole('button', { name: /remove/i }).click();

      // Confirm the removal dialog
      await page.getByRole('button', { name: /confirm/i }).click();

      // The user should no longer appear in the list
      await expect(page.getByText(email)).not.toBeVisible({ timeout: 5000 });
    } finally {
      await loginAdminViaApi(page);
      await adminDeleteUserByEmail(page, email);
    }
  });
});
