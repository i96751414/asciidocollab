import { test, expect } from '@playwright/test';
import { ensureTestUser, TEST_USER } from './helpers/test-user';

test.describe('Sign-in and redirect flow', () => {
  test.beforeAll(async () => {
    await ensureTestUser();
  });

  test('visit /dashboard while signed out → redirect to /login?redirect=/dashboard → login → land on /dashboard', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login\?redirect=%2Fdashboard/);

    await page.getByLabel(/email/i).fill(TEST_USER.email);
    await page.getByLabel(/password/i).fill(TEST_USER.password);
    await page.getByRole('button', { name: /sign in/i }).click();

    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('already-authenticated user visiting /login redirects to /dashboard', async ({ page }) => {
    // Sign in first
    await page.goto('/login');
    await page.getByLabel(/email/i).fill(TEST_USER.email);
    await page.getByLabel(/password/i).fill(TEST_USER.password);
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/dashboard/);

    // Revisit /login — should redirect to dashboard
    await page.goto('/login');
    await expect(page).toHaveURL(/\/dashboard/);
  });
});
