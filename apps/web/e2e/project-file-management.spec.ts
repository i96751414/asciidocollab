import { test, expect } from '@playwright/test';
import { ensureTestUser, adminDeleteUserByEmail } from './helpers/test-user';
import {
  signIn,
  createProject,
  cleanupProject,
  createTestFile,
  createTestFolder,
  createViewerInProject,
} from './helpers/test-project';

test.describe('File management — US4/US6', () => {
  test.beforeAll(async () => {
    await ensureTestUser();
  });

  let projectId: string;
  // C7: track the viewer email so we can delete the user account after each test run
  let viewerEmail: string | undefined;

  test.beforeEach(async ({ page }) => {
    await signIn(page);
    projectId = await createProject(page, `File Mgmt E2E ${Date.now()}`);
  });

  test.afterEach(async ({ page }) => {
    if (projectId) {
      await cleanupProject(page, projectId);
    }
    if (viewerEmail) {
      await adminDeleteUserByEmail(page, viewerEmail);
      viewerEmail = undefined;
    }
  });

  // T032: owner can create a new file via dialog
  test('owner can create a new file', async ({ page }) => {
    await page.goto(`/dashboard/projects/${projectId}`);

    // Click the "New File" action — trigger via the root folder's actions button
    const actionsButton = page.getByRole('button', { name: /actions/i }).first();
    await actionsButton.click();
    await page.getByRole('button', { name: /New File/i }).click();

    // Dialog should open with an input
    const dialog = page.getByTestId('dialog-content').or(page.locator('[role="dialog"]'));
    await expect(dialog).toBeVisible();

    const input = dialog.getByRole('textbox');
    await input.fill('my-document.adoc');

    await dialog.getByRole('button', { name: /confirm/i }).click();

    // File appears in the tree
    await expect(page.getByText('my-document.adoc')).toBeVisible({ timeout: 5000 });
  });

  // T033: owner can create a new folder via dialog
  test('owner can create a new folder', async ({ page }) => {
    await page.goto(`/dashboard/projects/${projectId}`);

    const actionsButton = page.getByRole('button', { name: /actions/i }).first();
    await actionsButton.click();
    await page.getByRole('button', { name: /New Folder/i }).click();

    const dialog = page.getByTestId('dialog-content').or(page.locator('[role="dialog"]'));
    await expect(dialog).toBeVisible();

    const input = dialog.getByRole('textbox');
    await input.fill('my-folder');

    await dialog.getByRole('button', { name: /confirm/i }).click();

    await expect(page.getByText('my-folder')).toBeVisible({ timeout: 5000 });
  });

  // T034: owner can rename a file via dialog
  test('owner can rename a file', async ({ page }) => {
    await createTestFile(page, projectId, null, 'original.adoc');
    await page.goto(`/dashboard/projects/${projectId}`);

    await expect(page.getByText('original.adoc')).toBeVisible({ timeout: 5000 });

    const actionsButton = page.getByRole('button', { name: /actions/i }).first();
    await actionsButton.click();
    await page.getByRole('button', { name: /Rename/i }).click();

    const dialog = page.getByTestId('dialog-content').or(page.locator('[role="dialog"]'));
    await expect(dialog).toBeVisible();

    const input = dialog.getByRole('textbox');
    await expect(input).toHaveValue('original.adoc');

    await input.fill('renamed.adoc');
    await dialog.getByRole('button', { name: /confirm/i }).click();

    await expect(page.getByText('renamed.adoc')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('original.adoc')).not.toBeVisible();
  });

  // T035: owner can rename a folder
  test('owner can rename a folder', async ({ page }) => {
    await createTestFolder(page, projectId, null, 'original-folder');
    await page.goto(`/dashboard/projects/${projectId}`);

    await expect(page.getByText('original-folder')).toBeVisible({ timeout: 5000 });

    const actionsButton = page.getByRole('button', { name: /actions/i }).first();
    await actionsButton.click();
    await page.getByRole('button', { name: /Rename/i }).click();

    const dialog = page.getByTestId('dialog-content').or(page.locator('[role="dialog"]'));
    await expect(dialog).toBeVisible();

    const input = dialog.getByRole('textbox');
    await input.fill('renamed-folder');
    await dialog.getByRole('button', { name: /confirm/i }).click();

    await expect(page.getByText('renamed-folder')).toBeVisible({ timeout: 5000 });
  });

  // T036: owner can delete a file
  test('owner can delete a file', async ({ page }) => {
    await createTestFile(page, projectId, null, 'to-delete.adoc');
    await page.goto(`/dashboard/projects/${projectId}`);

    await expect(page.getByText('to-delete.adoc')).toBeVisible({ timeout: 5000 });

    const actionsButton = page.getByRole('button', { name: /actions/i }).first();
    await actionsButton.click();
    await page.getByRole('button', { name: /Delete/i }).click();

    // ConfirmationDialog should appear
    const confirmDialog = page.locator('[data-testid="confirmation-dialog"]')
      .or(page.locator('[role="dialog"]'));
    await expect(confirmDialog).toBeVisible();

    await confirmDialog.getByRole('button', { name: /confirm|delete/i }).click();

    await expect(page.getByText('to-delete.adoc')).not.toBeVisible({ timeout: 5000 });
  });

  // T037: owner can delete a non-empty folder with warning
  test('owner can delete a non-empty folder with warning', async ({ page }) => {
    const folderId = await createTestFolder(page, projectId, null, 'folder-with-files');
    await createTestFile(page, projectId, folderId, 'child.adoc');
    await page.goto(`/dashboard/projects/${projectId}`);

    await expect(page.getByText('folder-with-files')).toBeVisible({ timeout: 5000 });

    const actionsButton = page.getByRole('button', { name: /actions/i }).first();
    await actionsButton.click();
    await page.getByRole('button', { name: /Delete/i }).click();

    const confirmDialog = page.locator('[role="dialog"]');
    await expect(confirmDialog).toBeVisible();
    await expect(confirmDialog.getByText(/also delete all files inside/i)).toBeVisible();

    await confirmDialog.getByRole('button', { name: /confirm|delete/i }).click();

    await expect(page.getByText('folder-with-files')).not.toBeVisible({ timeout: 5000 });
  });

  // T038: viewer cannot see file management controls
  test('viewer cannot see file management controls', async ({ page, browser }) => {
    const viewerCredentials = await createViewerInProject(page, projectId);
    viewerEmail = viewerCredentials.email; // C7: captured for afterEach cleanup

    // Open a new browser context for the viewer
    const viewerContext = await browser.newContext();
    const viewerPage = await viewerContext.newPage();

    try {
      await signIn(viewerPage, viewerCredentials.email, viewerCredentials.password);
      await viewerPage.goto(`/dashboard/projects/${projectId}`);

      // Wait for the file tree to load
      await expect(viewerPage.getByTestId('file-tree-panel')).toBeVisible({ timeout: 5000 });

      // No actions buttons should be visible
      await expect(viewerPage.getByRole('button', { name: /actions/i })).not.toBeVisible();
      await expect(viewerPage.getByText(/New File/i)).not.toBeVisible();
      await expect(viewerPage.getByText(/New Folder/i)).not.toBeVisible();
      await expect(viewerPage.getByText(/Rename/i)).not.toBeVisible();
      await expect(viewerPage.getByText(/Delete/i)).not.toBeVisible();
    } finally {
      await viewerContext.close();
    }
  });
});
