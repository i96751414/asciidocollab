import { test, expect } from '@playwright/test';
import { ensureTestUser, loginAdminViaApi, TEST_USER } from './helpers/test-user';

test.describe('Dashboard shell', () => {
  test.beforeAll(async () => {
    await ensureTestUser();
  });

  test('dashboard loads without runtime errors or crash screen', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await loginAdminViaApi(page);
    await page.goto('/dashboard');

    await expect(page.locator('text=Something went wrong')).not.toBeVisible();
    // Header brand link is SSR-rendered by the dashboard layout — confirms the layout rendered without crashing.
    await expect(page.getByRole('link', { name: 'AsciiDoCollab' })).toBeVisible({ timeout: 10_000 });
    expect(pageErrors, `Unhandled JS errors: ${pageErrors.join('\n')}`).toHaveLength(0);
  });

  test('user menu shows the authenticated user name', async ({ page }) => {
    await loginAdminViaApi(page);
    await page.goto('/dashboard');

    await expect(page.getByRole('button').filter({ hasText: TEST_USER.displayName })).toBeVisible({ timeout: 10_000 });
  });

  test('user menu Display Name link navigates to account settings (not 404)', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await loginAdminViaApi(page);
    await page.goto('/dashboard');

    await page.getByRole('button').filter({ hasText: TEST_USER.displayName }).click({ timeout: 10_000 });
    await page.getByRole('menuitem', { name: 'Display Name' }).click();

    await expect(page).toHaveURL(/\/dashboard\/account/);
    await expect(page.locator('text=Something went wrong')).not.toBeVisible();
    await expect(page.locator('h1, h2').filter({ hasText: '404' })).not.toBeVisible();
    expect(pageErrors, `Unhandled JS errors: ${pageErrors.join('\n')}`).toHaveLength(0);
  });

  test('user menu Application Theme link navigates to account settings (not 404)', async ({ page }) => {
    await loginAdminViaApi(page);
    await page.goto('/dashboard');

    await page.getByRole('button').filter({ hasText: TEST_USER.displayName }).click({ timeout: 10_000 });
    await page.getByRole('menuitem', { name: 'Application Theme' }).click();

    await expect(page).toHaveURL(/\/dashboard\/account/);
    await expect(page.locator('text=Something went wrong')).not.toBeVisible();
    await expect(page.locator('h1, h2').filter({ hasText: '404' })).not.toBeVisible();
  });
});
