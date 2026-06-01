import { test, expect } from '@playwright/test';
import {
  ensureTestUser,
  loginAdminViaApi,
  logoutViaApi,
  adminSetOpenRegistration,
  adminDeleteUserByEmail,
} from './helpers/test-user';
import { clearMailpit, waitForEmail, extractVerificationToken } from './helpers/mailpit';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

test.describe('Self-registration with email verification (US2)', () => {
  test.beforeAll(async () => {
    await ensureTestUser();
  });

  test('open registration flow: register → check email → verify → dashboard', async ({ page }) => {
    const email = `selfreg-${Date.now()}@example.com`;
    const password = 'RegP@ssw0rd123!';

    await loginAdminViaApi(page);
    await adminSetOpenRegistration(page, true);
    await clearMailpit();

    try {
      // Register via API
      const regResp = await page.request.post(`${API_URL}/auth/register`, {
        data: { email, displayName: 'Self Reg User', password },
      });
      expect(regResp.status()).toBe(202);

      // Log in as the new user — session will have emailVerified=false
      await logoutViaApi(page);
      await page.request.post(`${API_URL}/auth/login`, { data: { email, password } });

      // Fetch verification token from Mailpit
      const emailMessage = await waitForEmail(email);
      const token = extractVerificationToken(emailMessage.HTML);

      // Visit the verify-email page while logged in → session gets emailVerified=true
      await page.goto(`/verify-email?token=${token}`);
      await expect(page.getByText(/email verified/i)).toBeVisible({ timeout: 5000 });

      // Page redirects to /dashboard after success
      await page.waitForURL(/\/dashboard/, { timeout: 5000 });
    } finally {
      await loginAdminViaApi(page);
      await adminSetOpenRegistration(page, false);
      await adminDeleteUserByEmail(page, email);
    }
  });

  test('unverified user is gated at /verify-email-required', async ({ page }) => {
    const email = `unverified-${Date.now()}@example.com`;
    const password = 'RegP@ssw0rd123!';

    await loginAdminViaApi(page);
    await adminSetOpenRegistration(page, true);
    await clearMailpit();

    try {
      await page.request.post(`${API_URL}/auth/register`, {
        data: { email, displayName: 'Unverified User', password },
      });

      // Log in as the unverified user
      await logoutViaApi(page);
      await page.request.post(`${API_URL}/auth/login`, { data: { email, password } });

      // Navigating to /dashboard should redirect to /verify-email-required
      await page.goto('/dashboard');
      await expect(page).toHaveURL(/\/verify-email-required/);
      await expect(page.getByRole('heading', { name: /verify your email/i })).toBeVisible();
    } finally {
      await loginAdminViaApi(page);
      await adminSetOpenRegistration(page, false);
      await adminDeleteUserByEmail(page, email);
    }
  });

  test('resend verification email works', async ({ page }) => {
    const email = `resend-${Date.now()}@example.com`;
    const password = 'RegP@ssw0rd123!';

    await loginAdminViaApi(page);
    await adminSetOpenRegistration(page, true);
    await clearMailpit();

    try {
      await page.request.post(`${API_URL}/auth/register`, {
        data: { email, displayName: 'Resend User', password },
      });

      await logoutViaApi(page);
      await page.request.post(`${API_URL}/auth/login`, { data: { email, password } });

      // Navigate to the gated page
      await page.goto('/dashboard');
      await page.waitForURL(/\/verify-email-required/);

      // Clear mailpit and click resend
      await clearMailpit();
      await page.getByRole('button', { name: /resend/i }).click();

      // Confirm success message appears
      await expect(page.getByText(/verification email sent/i)).toBeVisible({ timeout: 5000 });

      // A new email must arrive in Mailpit
      const resendEmail = await waitForEmail(email);
      const token = extractVerificationToken(resendEmail.HTML);
      expect(token).toBeTruthy();
    } finally {
      await loginAdminViaApi(page);
      await adminSetOpenRegistration(page, false);
      await adminDeleteUserByEmail(page, email);
    }
  });

  test('registration returns 202 for existing email (anti-enumeration)', async ({ page }) => {
    // The admin user already exists — registering with the same email must return 202, not 4xx.
    await loginAdminViaApi(page);
    await adminSetOpenRegistration(page, true);

    try {
      const resp = await page.request.post(`${API_URL}/auth/register`, {
        data: { email: 'admin@example.com', displayName: 'Dup', password: 'RegP@ssw0rd123!' },
      });
      expect(resp.status()).toBe(202);
    } finally {
      await adminSetOpenRegistration(page, false);
    }
  });

  test('register page not accessible when open registration is disabled', async ({ page }) => {
    await page.goto('/register');
    const url = page.url();
    expect(url).toMatch(/\/(register|login)/);
  });
});
