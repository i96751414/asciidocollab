import { test, expect } from '@playwright/test';
import { ensureTestUser, ensureRegistrationClosed, TEST_USER } from './helpers/test-user';

test.describe('Security edge cases', () => {
  test.beforeAll(async () => {
    await ensureTestUser();
  });

  test.beforeEach(async () => {
    // Concurrent open-registration tests may enable open-reg; reset it so
    // /register reliably redirects to /login in the tests below.
    await ensureRegistrationClosed();
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
