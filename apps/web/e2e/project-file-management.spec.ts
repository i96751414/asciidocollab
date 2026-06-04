import { test, expect, type Page } from '@playwright/test';
import { ensureTestUser, adminDeleteUserByEmail } from './helpers/test-user';
import {
  signIn,
  createProject,
  cleanupProject,
  createTestFile,
  createTestFolder,
  createViewerInProject,
} from './helpers/test-project';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Navigates to a project page and asserts the file tree has loaded successfully.
 * Fails immediately with a clear message if the tree shows an error state,
 * rather than timing out silently on a downstream assertion.
 */
async function gotoProject(page: Page, projectId: string) {
  await page.goto(`/dashboard/projects/${projectId}`);
  // Wait until the loading spinner is gone
  await expect(page.getByText(/loading\.\.\./i)).not.toBeVisible({ timeout: 8000 });
  // Explicitly assert the tree did NOT fail — this is the assertion that catches
  // missing or broken API routes before any other test step runs.
  await expect(
    page.getByText(/failed to load files/i),
    'File tree returned an error. Check the API GET /projects/:id/files route.',
  ).not.toBeVisible();
}

/** Opens the actions dropdown for the root folder. */
async function openRootActions(page: Page) {
  await page.getByTestId('tree-root-actions').getByRole('button', { name: /actions/i }).click();
}

/**
 * Opens the actions dropdown for a named node.
 * Hovers the row first so the opacity-0 button becomes visible.
 */
async function openNodeActions(page: Page, name: string) {
  const node = page.getByTestId(`tree-node-${name}`);
  await node.hover();
  await node.getByRole('button', { name: /actions/i }).click();
}

/** Fills a name dialog and confirms. */
async function confirmNameDialog(page: Page, value: string) {
  const dialog = page.locator('[role="dialog"]');
  await expect(dialog).toBeVisible();
  const input = dialog.getByRole('textbox');
  await input.fill(value);
  await dialog.getByRole('button', { name: /confirm/i }).click();
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

test.describe('File management — US4/US6', () => {
  test.beforeAll(async () => {
    await ensureTestUser();
  });

  let projectId: string;
  let viewerEmail: string | undefined;

  test.beforeEach(async ({ page }) => {
    await signIn(page);
    projectId = await createProject(page, `File Mgmt E2E ${Date.now()}`);
  });

  test.afterEach(async ({ page }) => {
    if (projectId) await cleanupProject(page, projectId);
    if (viewerEmail) {
      await adminDeleteUserByEmail(page, viewerEmail);
      viewerEmail = undefined;
    }
  });

  // ---------------------------------------------------------------------------
  // Comprehensive workflow (US4-full)
  // ---------------------------------------------------------------------------

  test('full file tree workflow: empty → create → rename → delete via UI', async ({ page }) => {
    await gotoProject(page, projectId);

    // 1. Empty project shows placeholder text
    await expect(page.getByText(/No files yet/i)).toBeVisible({ timeout: 5000 });

    // 2. Create folder "docs" at root level
    await openRootActions(page);
    await page.getByRole('menuitem', { name: /New Folder/i }).click();
    await confirmNameDialog(page, 'docs');
    await expect(page.getByTestId('tree-node-docs')).toBeVisible({ timeout: 5000 });

    // 3. Create file "intro.adoc" at root level
    await openRootActions(page);
    await page.getByRole('menuitem', { name: /New File/i }).click();
    await confirmNameDialog(page, 'intro.adoc');
    await expect(page.getByTestId('tree-node-intro.adoc')).toBeVisible({ timeout: 5000 });

    // 4. Create file "chapter-1.adoc" inside "docs" folder
    await openNodeActions(page, 'docs');
    await page.getByRole('menuitem', { name: /New File/i }).click();
    await confirmNameDialog(page, 'chapter-1.adoc');
    // Expand "docs" to see the child
    await page.getByTestId('tree-node-docs').click();
    await expect(page.getByTestId('tree-node-chapter-1.adoc')).toBeVisible({ timeout: 5000 });

    // 5. Rename "intro.adoc" → "guide.adoc"
    await openNodeActions(page, 'intro.adoc');
    await page.getByRole('menuitem', { name: /Rename/i }).click();
    await confirmNameDialog(page, 'guide.adoc');
    await expect(page.getByTestId('tree-node-guide.adoc')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('tree-node-intro.adoc')).not.toBeVisible();

    // 6. Delete "guide.adoc"
    await openNodeActions(page, 'guide.adoc');
    await page.getByRole('menuitem', { name: /Delete/i }).click();
    const deleteDialog = page.locator('[role="dialog"]');
    await expect(deleteDialog).toBeVisible();
    await deleteDialog.getByRole('button', { name: /delete/i }).click();
    await expect(page.getByTestId('tree-node-guide.adoc')).not.toBeVisible({ timeout: 5000 });

    // 7. Delete "docs" folder (non-empty — contains chapter-1.adoc); must show warning
    await openNodeActions(page, 'docs');
    await page.getByRole('menuitem', { name: /Delete/i }).click();
    const folderDeleteDialog = page.locator('[role="dialog"]');
    await expect(folderDeleteDialog).toBeVisible();
    await expect(folderDeleteDialog.getByText(/also delete all files inside/i)).toBeVisible();
    await folderDeleteDialog.getByRole('button', { name: /delete/i }).click();
    await expect(page.getByTestId('tree-node-docs')).not.toBeVisible({ timeout: 5000 });
  });

  // ---------------------------------------------------------------------------
  // Individual operations (T032–T038) — kept for regression coverage
  // ---------------------------------------------------------------------------

  // T032: owner can create a new file via dialog
  test('owner can create a new file', async ({ page }) => {
    await gotoProject(page, projectId);
    await openRootActions(page);
    await page.getByRole('menuitem', { name: /New File/i }).click();
    await confirmNameDialog(page, 'my-document.adoc');
    await expect(page.getByTestId('tree-node-my-document.adoc')).toBeVisible({ timeout: 5000 });
  });

  // T033: owner can create a new folder via dialog
  test('owner can create a new folder', async ({ page }) => {
    await gotoProject(page, projectId);
    await openRootActions(page);
    await page.getByRole('menuitem', { name: /New Folder/i }).click();
    await confirmNameDialog(page, 'my-folder');
    await expect(page.getByTestId('tree-node-my-folder')).toBeVisible({ timeout: 5000 });
  });

  // T034: owner can rename a file via dialog
  test('owner can rename a file', async ({ page }) => {
    await createTestFile(page, projectId, null, 'original.adoc');
    await gotoProject(page, projectId);
    await expect(page.getByTestId('tree-node-original.adoc')).toBeVisible({ timeout: 5000 });

    await openNodeActions(page, 'original.adoc');
    await page.getByRole('menuitem', { name: /Rename/i }).click();

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog.getByRole('textbox')).toHaveValue('original.adoc');
    await dialog.getByRole('textbox').fill('renamed.adoc');
    await dialog.getByRole('button', { name: /confirm/i }).click();

    await expect(page.getByTestId('tree-node-renamed.adoc')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('tree-node-original.adoc')).not.toBeVisible();
  });

  // T035: owner can rename a folder
  test('owner can rename a folder', async ({ page }) => {
    await createTestFolder(page, projectId, null, 'original-folder');
    await gotoProject(page, projectId);
    await expect(page.getByTestId('tree-node-original-folder')).toBeVisible({ timeout: 5000 });

    await openNodeActions(page, 'original-folder');
    await page.getByRole('menuitem', { name: /Rename/i }).click();
    await confirmNameDialog(page, 'renamed-folder');
    await expect(page.getByTestId('tree-node-renamed-folder')).toBeVisible({ timeout: 5000 });
  });

  // T036: owner can delete a file
  test('owner can delete a file', async ({ page }) => {
    await createTestFile(page, projectId, null, 'to-delete.adoc');
    await gotoProject(page, projectId);
    await expect(page.getByTestId('tree-node-to-delete.adoc')).toBeVisible({ timeout: 5000 });

    await openNodeActions(page, 'to-delete.adoc');
    await page.getByRole('menuitem', { name: /Delete/i }).click();

    const confirmDialog = page.locator('[role="dialog"]');
    await expect(confirmDialog).toBeVisible();
    await confirmDialog.getByRole('button', { name: /delete/i }).click();
    await expect(page.getByTestId('tree-node-to-delete.adoc')).not.toBeVisible({ timeout: 5000 });
  });

  // T037: owner can delete a non-empty folder with warning
  test('owner can delete a non-empty folder with warning', async ({ page }) => {
    const folderId = await createTestFolder(page, projectId, null, 'folder-with-files');
    await createTestFile(page, projectId, folderId, 'child.adoc');
    await gotoProject(page, projectId);
    await expect(page.getByTestId('tree-node-folder-with-files')).toBeVisible({ timeout: 5000 });

    await openNodeActions(page, 'folder-with-files');
    await page.getByRole('menuitem', { name: /Delete/i }).click();

    const confirmDialog = page.locator('[role="dialog"]');
    await expect(confirmDialog).toBeVisible();
    await expect(confirmDialog.getByText(/also delete all files inside/i)).toBeVisible();
    await confirmDialog.getByRole('button', { name: /delete/i }).click();
    await expect(page.getByTestId('tree-node-folder-with-files')).not.toBeVisible({ timeout: 5000 });
  });

  // T038: viewer cannot see file management controls
  test('viewer cannot see file management controls', async ({ page, browser }) => {
    const viewerCredentials = await createViewerInProject(page, projectId);
    viewerEmail = viewerCredentials.email;

    const viewerContext = await browser.newContext();
    const viewerPage = await viewerContext.newPage();

    try {
      await signIn(viewerPage, viewerCredentials.email, viewerCredentials.password);
      await viewerPage.goto(`/dashboard/projects/${projectId}`);

      // Positive anchor 1: the panel itself rendered.
      await expect(viewerPage.getByTestId('file-tree-panel')).toBeVisible({ timeout: 5000 });
      // Positive anchor 2: tree content loaded without error (empty project → "No files yet").
      // This times out and fails if the API route is broken, preventing the negative
      // assertions below from silently passing on a crashed page.
      await expect(viewerPage.getByText(/no files yet/i)).toBeVisible({ timeout: 5000 });
      // Viewers must not see any management controls.
      await expect(viewerPage.getByTestId('tree-root-actions')).not.toBeVisible();
      await expect(viewerPage.getByRole('button', { name: /actions/i })).not.toBeVisible();
    } finally {
      await viewerContext.close();
    }
  });
});
