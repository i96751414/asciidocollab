import { test, expect } from '@playwright/test';
import { ensureTestUser } from './helpers/test-user';
import {
  signIn,
  createProject,
  cleanupProject,
  archiveProject,
} from './helpers/test-project';

test.describe('Project settings page — T067', () => {
  test.beforeAll(async () => {
    await ensureTestUser();
  });

  // Tests that need a real project share state via these variables.
  // Each test that needs them must sign in + create a project in beforeEach
  // and clean up in afterEach.
  let projectId: string;

  test.beforeEach(async ({ page }, testInfo) => {
    // The unauthenticated test handles its own setup — skip sign-in there.
    if (testInfo.title.startsWith('unauthenticated')) return;

    await signIn(page);
    projectId = await createProject(page, `Settings E2E ${Date.now()}`);
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.title.startsWith('unauthenticated')) return;
    if (projectId) {
      await cleanupProject(page, projectId);
    }
  });

  test('unauthenticated visit to project settings → redirect to /login', async ({
    page,
    context,
  }) => {
    await context.clearCookies();
    await page.goto('/dashboard/projects/some-fake-id/settings');
    await expect(page).toHaveURL(/\/login/);
  });

  test('navigating to a non-existent project settings page → redirect to /404', async ({
    page,
  }) => {
    await page.goto(
      '/dashboard/projects/00000000-0000-4000-8000-000000000000/settings',
    );
    await expect(page).toHaveURL(/\/404/);
  });

  test('owner can update project name', async ({ page }) => {
    await page.goto(`/dashboard/projects/${projectId}/settings`);

    const nameInput = page.getByLabel(/name/i);
    await nameInput.clear();
    await nameInput.fill('Updated Project Name');

    await page.getByRole('button', { name: /save changes/i }).click();

    await expect(
      page.getByText(/project settings updated successfully/i),
    ).toBeVisible();
  });

  test('archived project shows disabled fields and archive banner', async ({ page }) => {
    await archiveProject(page, projectId);

    await page.goto(`/dashboard/projects/${projectId}/settings`);

    // Banner indicating the project is archived
    await expect(page.getByText(/this project is archived/i)).toBeVisible();

    // Name input must be disabled
    const nameInput = page.getByLabel(/name/i);
    await expect(nameInput).toBeDisabled();
  });
});
