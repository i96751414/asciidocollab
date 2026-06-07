import { test, expect } from '@playwright/test';
import { ensureTestUser, TEST_USER } from './helpers/test-user';
import { signIn, createProject, cleanupProject, archiveProject } from './helpers/test-project';

test.describe('Project members page', () => {
  test.beforeAll(async () => {
    await ensureTestUser();
  });

  test('unauthenticated visit to members page → redirect to /login', async ({ page, context }) => {
    await context.clearCookies();
    await page.goto('/dashboard/projects/some-id/members');
    await expect(page).toHaveURL(/\/login/);
  });

  test('members page renders the current user in the member list', async ({ page }) => {
    await signIn(page);
    const projectId = await createProject(page, 'Members E2E Test Project');

    try {
      await page.goto(`/dashboard/projects/${projectId}/members`);

      // Scope to the members list to avoid matching the nav header display name.
      const membersSection = page.getByTestId('member-list');
      await expect(membersSection.getByText(TEST_USER.displayName)).toBeVisible();
      await expect(page.getByRole('combobox').first()).toHaveValue('owner');
    } finally {
      await cleanupProject(page, projectId);
    }
  });

  test('sole-owner protection — current user cannot remove themselves', async ({ page }) => {
    await signIn(page);
    const projectId = await createProject(page, 'Sole Owner E2E Test Project');

    try {
      await page.goto(`/dashboard/projects/${projectId}/members`);

      // The sole-owner warning banner should be present
      await expect(
        page.getByText(/you are the sole owner/i),
      ).toBeVisible();

      // The Remove button should be absent for the current user's own row.
      // Find the row containing the test user's display name and assert no
      // enabled Remove button exists within it.
      const userRow = page.locator('div').filter({ hasText: TEST_USER.displayName }).first();
      const removeButton = userRow.getByRole('button', { name: /remove/i });
      // Either the button is absent entirely or it is disabled — both are acceptable.
      const removeCount = await removeButton.count();
      if (removeCount > 0) {
        await expect(removeButton).toBeDisabled();
      }
    } finally {
      await cleanupProject(page, projectId);
    }
  });

  test('archived project shows read-only members page', async ({ page }) => {
    await signIn(page);
    const projectId = await createProject(page, 'Archive Members E2E Test Project');

    try {
      await archiveProject(page, projectId);
      await page.goto(`/dashboard/projects/${projectId}/members`);

      // Archived banner is visible
      await expect(page.getByText(/this project is archived/i)).toBeVisible();

      // Invite member form is hidden (the "Add Member" / "Invite Member" heading/button should not exist)
      await expect(page.getByRole('heading', { name: /invite member/i })).not.toBeVisible();

      // All role dropdowns should be disabled
      const roleSelects = page.locator('select');
      const selectCount = await roleSelects.count();
      for (let index = 0; index < selectCount; index++) {
        await expect(roleSelects.nth(index)).toBeDisabled();
      }
    } finally {
      await cleanupProject(page, projectId);
    }
  });
});
