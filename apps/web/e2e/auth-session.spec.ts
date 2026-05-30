import { test, expect } from '@playwright/test';
import { ensureTestUser, TEST_USER } from './helpers/test-user';

test.describe('Security edge cases', () => {
  test.beforeAll(async () => {
    await ensureTestUser();
  });

  test('open-redirect: /login?redirect=https://evil.com → after login lands on /dashboard', async ({ page }) => {
    await page.goto('/login?redirect=https://evil.com');
    await page.getByLabel(/email/i).fill(TEST_USER.email);
    await page.getByLabel(/password/i).fill(TEST_USER.password);
    await page.getByRole('button', { name: /sign in/i }).click();

    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page).not.toHaveURL(/evil\.com/);
  });

  test('post-setup register block: visit /register after setup → redirect to /login', async ({ page }) => {
    await page.goto('/register');
    await expect(page).toHaveURL(/\/login/);
  });
});
