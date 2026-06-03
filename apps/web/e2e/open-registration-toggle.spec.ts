import { test, expect, request } from '@playwright/test';
import {
  ensureTestUser,
  loginAdminViaApi,
  adminSetOpenRegistration,
  TEST_USER,
} from './helpers/test-user';
import { signIn } from './helpers/test-project';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/**
 * Resets open registration to false via a standalone context that does not
 * contaminate the page's cookie jar.
 */
async function resetOpenRegistration(): Promise<void> {
  const context = await request.newContext({ baseURL: API_URL });
  try {
    await context.post('/auth/login', { data: { email: TEST_USER.email, password: TEST_USER.password } });
    await context.patch('/admin/settings', { data: { openRegistration: false } });
  } finally {
    await context.dispose();
  }
}

test.describe('Open registration toggle (US4)', () => {
  test.beforeAll(async () => {
    await ensureTestUser();
  });

  test.beforeEach(async () => {
    // Ensure a clean baseline regardless of state left by other test files.
    // Uses a separate context so the page's own cookie jar stays clean.
    await resetOpenRegistration();
  });

  test.afterEach(async () => {
    await resetOpenRegistration();
  });

  test('admin can enable/disable open registration', async ({ page }) => {
    await signIn(page);
    await page.goto('/dashboard/admin/users');

    const toggleButton = page.getByRole('button', { name: /disabled — click to enable|enabled — click to disable/i });

    // Enable it
    await toggleButton.filter({ hasText: /disabled/i }).click();
    await expect(page.getByRole('button', { name: /enabled — click to disable/i })).toBeVisible();

    // Reload and verify persistence
    await page.reload();
    await expect(page.getByRole('button', { name: /enabled — click to disable/i })).toBeVisible();

    // Disable it
    await page.getByRole('button', { name: /enabled — click to disable/i }).click();
    await expect(page.getByRole('button', { name: /disabled — click to enable/i })).toBeVisible();
  });

  test('login page shows "Create an account" when open registration is enabled', async ({ page }) => {
    await loginAdminViaApi(page);
    await adminSetOpenRegistration(page, true);

    // Sign out, then visit /login
    await page.context().clearCookies();
    await page.goto('/login');
    await expect(page.getByRole('link', { name: /create an account/i })).toBeVisible();
  });

  test('login page hides "Create an account" when open registration is disabled', async ({ page }) => {
    await loginAdminViaApi(page);
    await adminSetOpenRegistration(page, false);

    await page.context().clearCookies();
    await page.goto('/login');
    // Positive anchor — proves the login form rendered before checking the link is absent.
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /create an account/i })).not.toBeVisible();
  });

  test('direct navigation to /register is blocked when registration is disabled', async ({ page }) => {
    await loginAdminViaApi(page);
    await adminSetOpenRegistration(page, false);
    await page.context().clearCookies();

    await page.goto('/register');
    // Should redirect to /login (registration closed + users exist)
    await expect(page).toHaveURL(/\/login/);
  });

  test('open registration setting persists across page reload', async ({ page }) => {
    await signIn(page);
    await adminSetOpenRegistration(page, true);

    await page.goto('/dashboard/admin/users');
    await expect(page.getByRole('button', { name: /enabled — click to disable/i })).toBeVisible();

    await page.reload();
    await expect(page.getByRole('button', { name: /enabled — click to disable/i })).toBeVisible();
  });

  test('open-registration-status endpoint is accessible without auth', async ({ page }) => {
    const response = await page.request.get(`${API_URL}/auth/open-registration-status`);
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(typeof body.openRegistration).toBe('boolean');
  });
});
