import { test, expect } from '@playwright/test';
import { ensureTestUser, TEST_USER } from './helpers/test-user';

test.describe('Sign-out and session protection', () => {
  test.beforeAll(async () => {
    await ensureTestUser();
  });

  test('sign in → click Sign Out → redirect to /login → /dashboard redirects back to /login', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill(TEST_USER.email);
    await page.getByLabel(/password/i).fill(TEST_USER.password);
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/dashboard/);

    // Open the user menu then click Log Out (previously a standalone button, now in the dropdown).
    await page.getByRole('button').filter({ hasText: TEST_USER.displayName }).click({ timeout: 10_000 });
    await page.getByRole('menuitem', { name: /log out/i }).click();
    await expect(page).toHaveURL(/\/login/);

    // Back button: try to reach dashboard — should redirect to login
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
  });
});
