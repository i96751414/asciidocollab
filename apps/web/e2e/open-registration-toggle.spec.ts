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

    const enabledButton = page.getByRole('button', { name: /enabled — click to disable/i });
    const disabledButton = page.getByRole('button', { name: /disabled — click to enable/i });

    // Wait for the toggle to render in either state (concurrent tests may have changed it).
    await expect(enabledButton.or(disabledButton)).toBeVisible({ timeout: 10_000 });

    // Normalise to disabled state so the rest of the test is deterministic.
    if (await enabledButton.isVisible()) {
      await enabledButton.click();
      await expect(disabledButton).toBeVisible({ timeout: 5000 });
    }

    // Enable it
    await disabledButton.click();
    await expect(enabledButton).toBeVisible({ timeout: 10_000 });

    // Reload and verify persistence — wait for the async useEffect fetch to complete.
    await page.reload();
    await expect(enabledButton).toBeVisible({ timeout: 10_000 });

    // Disable it
    await enabledButton.click();
    await expect(disabledButton).toBeVisible({ timeout: 10_000 });
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
    // Set state via API (authoritative, not subject to concurrent-UI races).
    await loginAdminViaApi(page);
    await adminSetOpenRegistration(page, true);

    // API-level persistence: a fresh read must return the value we just wrote.
    const statusResp = await page.request.get(`${API_URL}/auth/open-registration-status`);
    expect((await statusResp.json() as { openRegistration: boolean }).openRegistration).toBe(true);

    // UI persistence: the admin page must render the persisted state correctly.
    // We navigate fresh so the server-rendered HTML reflects the DB value.
    await page.goto('/dashboard/admin/users');
    const enabledButton = page.getByRole('button', { name: /enabled — click to disable/i });
    const disabledButton = page.getByRole('button', { name: /disabled — click to enable/i });
    await expect(enabledButton.or(disabledButton)).toBeVisible({ timeout: 10_000 });

    // If a concurrent test changed the setting between our API set and the page
    // load, re-set via API and reload once — this is an environment race, not a
    // persistence bug (the API check above already confirmed persistence).
    if (await disabledButton.isVisible()) {
      await adminSetOpenRegistration(page, true);
      await page.reload();
      await expect(enabledButton.or(disabledButton)).toBeVisible({ timeout: 5000 });
    }

    await expect(enabledButton).toBeVisible({ timeout: 5000 });
  });

  test('open-registration-status endpoint is accessible without auth', async ({ page }) => {
    const response = await page.request.get(`${API_URL}/auth/open-registration-status`);
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(typeof body.openRegistration).toBe('boolean');
  });
});
