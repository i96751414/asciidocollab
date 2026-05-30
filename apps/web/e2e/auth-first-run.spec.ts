import { test, expect } from '@playwright/test';
import { isConfigured, TEST_USER } from './helpers/test-user';

test.describe('First-run setup flow', () => {
  test('empty database → visit / → redirect to /register → fill form → land on /dashboard', async ({ page }) => {
    const configured = await isConfigured();
    test.skip(configured, 'System already configured — first-run flow cannot be tested on a non-empty database');

    await page.goto('/');
    await expect(page).toHaveURL(/\/register/);
    await expect(page.getByText(/set up your account/i)).toBeVisible();

    await page.getByLabel(/display name/i).fill(TEST_USER.displayName);
    await page.getByLabel(/email/i).fill(TEST_USER.email);
    await page.getByLabel(/password/i).fill(TEST_USER.password);
    await page.getByRole('button', { name: /create account/i }).click();

    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('after setup, visiting /register redirects to /login', async ({ page }) => {
    const configured = await isConfigured();
    test.skip(!configured, 'System not yet configured — register page should still be accessible');

    await page.goto('/register');
    await expect(page).toHaveURL(/\/login/);
  });
});
