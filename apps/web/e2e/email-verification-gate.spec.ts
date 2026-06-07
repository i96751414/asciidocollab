/**
 * Tests for the email-verification gate and cross-device verification UX.
 *
 * Bug #1: authenticated but unverified users must be blocked from protected endpoints.
 * Bug #3+5: verifying from a different device (no session) must prompt to log in,
 *           not blindly redirect to /dashboard (which would loop through /verify-email-required).
 */
import { test, expect } from '@playwright/test';
import {
  ensureTestUser,
  loginAdminViaApi,
  adminSetOpenRegistration,
  adminDeleteUserByEmail,
} from './helpers/test-user';
import { waitForEmail, extractVerificationToken } from './helpers/mailpit';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const TEST_PASSWORD = 'TestP@ssw0rd123!';

test.describe('Email verification gate (Bug #1)', () => {
  test.beforeAll(async () => {
    await ensureTestUser();
  });

  test('authenticated unverified user is blocked (403) from protected API endpoints', async ({ page }) => {
    const email = `unverf-gate-${Date.now()}@example.com`;

    await loginAdminViaApi(page);
    await adminSetOpenRegistration(page, true);

    try {
      // Register a new user via open registration — they will be unverified.
      // A concurrent test may have disabled open-reg between the enable and the register call;
      // re-enable once and retry to handle that race.
      let regResp = await page.request.post(`${API_URL}/auth/register`, {
        data: { email, displayName: 'Unverified Gate User', password: TEST_PASSWORD },
      });
      if (regResp.status() === 403) {
        await adminSetOpenRegistration(page, true);
        regResp = await page.request.post(`${API_URL}/auth/register`, {
          data: { email, displayName: 'Unverified Gate User', password: TEST_PASSWORD },
        });
      }
      expect(regResp.status()).toBe(202);

      // Log in as the unverified user
      await page.context().clearCookies();
      const loginResp = await page.request.post(`${API_URL}/auth/login`, {
        data: { email, password: TEST_PASSWORD },
      });
      expect(loginResp.status()).toBe(200);

      // Attempt to call a protected mutation endpoint (profile update)
      // Before fix: 200 (no email-verification gate)
      // After fix:  403 EMAIL_NOT_VERIFIED
      const profileResp = await page.request.patch(`${API_URL}/auth/profile`, {
        data: { displayName: 'Should Not Work' },
      });
      expect(profileResp.status()).toBe(403);

      const body = await profileResp.json() as { error: { code: string } };
      expect(body.error.code).toBe('EMAIL_NOT_VERIFIED');
    } finally {
      await loginAdminViaApi(page);
      await adminSetOpenRegistration(page, false);
      await adminDeleteUserByEmail(page, email);
    }
  });

  test('verified user can access protected endpoints normally', async ({ page }) => {
    // Admin user is verified — ensure they can still access their profile
    await loginAdminViaApi(page);
    const resp = await page.request.patch(`${API_URL}/auth/profile`, {
      data: { displayName: 'Admin User' },
    });
    expect(resp.status()).toBe(200);
  });

  test('unverified user can still call /auth/resend-verification (exempt route)', async ({ page }) => {
    const email = `resend-exempt-${Date.now()}@example.com`;

    await loginAdminViaApi(page);
    await adminSetOpenRegistration(page, true);

    try {
      await page.request.post(`${API_URL}/auth/register`, {
        data: { email, displayName: 'Resend Exempt', password: TEST_PASSWORD },
      });

      await page.context().clearCookies();
      await page.request.post(`${API_URL}/auth/login`, { data: { email, password: TEST_PASSWORD } });

      // /auth/resend-verification must be accessible even without email verification.
      // 202 = sent successfully; 429 = rate-limited (also means the gate let them through).
      // Both prove the endpoint was reached, not blocked with 403 EMAIL_NOT_VERIFIED.
      const resp = await page.request.post(`${API_URL}/auth/resend-verification`);
      expect([202, 429]).toContain(resp.status());
    } finally {
      await loginAdminViaApi(page);
      await adminSetOpenRegistration(page, false);
      await adminDeleteUserByEmail(page, email);
    }
  });
});

test.describe('Cross-device verify-email UX (Bug #3+5)', () => {
  test.beforeAll(async () => {
    await ensureTestUser();
  });

  test('verify-email without a session shows log-in prompt instead of dashboard redirect', async ({ page }) => {
    const email = `crossdev-${Date.now()}@example.com`;

    await loginAdminViaApi(page);
    await adminSetOpenRegistration(page, true);

    try {
      // Register — user is unverified
      await page.request.post(`${API_URL}/auth/register`, {
        data: { email, displayName: 'Cross Device User', password: TEST_PASSWORD },
      });

      // Get verification token from Mailpit
      const emailMessage = await waitForEmail(email);
      const token = extractVerificationToken(emailMessage.HTML);

      // Simulate opening the link on a DIFFERENT device — no session cookie
      await page.context().clearCookies();

      await page.goto(`/verify-email?token=${token}`);
      await expect(page.getByText(/email verified/i)).toBeVisible({ timeout: 5000 });

      // After fix: page must offer a "Log in" action — NOT blindly redirect to /dashboard
      // Before fix: shows "Redirecting to your dashboard…" then navigates (which loops to /verify-email-required)
      await expect(page.getByRole('link', { name: /log in|sign in/i })).toBeVisible({ timeout: 3000 });
      await expect(page.getByText(/redirecting to your dashboard/i)).not.toBeVisible();
    } finally {
      await loginAdminViaApi(page);
      await adminSetOpenRegistration(page, false);
      await adminDeleteUserByEmail(page, email);
    }
  });

  test('verify-email WITH an active session upgrades the session and redirects to dashboard', async ({ page }) => {
    const email = `samedev-${Date.now()}@example.com`;

    await loginAdminViaApi(page);
    await adminSetOpenRegistration(page, true);

    try {
      await page.request.post(`${API_URL}/auth/register`, {
        data: { email, displayName: 'Same Device User', password: TEST_PASSWORD },
      });

      // Log in as the new user (same device — session exists but emailVerified=false)
      await page.context().clearCookies();
      await page.request.post(`${API_URL}/auth/login`, { data: { email, password: TEST_PASSWORD } });

      const emailMessage = await waitForEmail(email);
      const token = extractVerificationToken(emailMessage.HTML);

      // Visit verify-email with the active session
      await page.goto(`/verify-email?token=${token}`);
      await expect(page.getByText(/email verified/i)).toBeVisible({ timeout: 5000 });

      // Should redirect to /dashboard (session was upgraded)
      await page.waitForURL(/\/dashboard/, { timeout: 6000 });
    } finally {
      await loginAdminViaApi(page);
      await adminSetOpenRegistration(page, false);
      await adminDeleteUserByEmail(page, email);
    }
  });
});
