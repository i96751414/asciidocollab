import { test, expect, type Page } from '@playwright/test';
import { ensureTestUser } from './helpers/test-user';
import {
  signIn,
  createProject,
  cleanupProject,
  createTestFile,
  createViewerInProject,
} from './helpers/test-project';

// US4 / FR-012: a project viewer connects as an observer — the editor is
// read-only, live edits/presence remain visible, and edit attempts are rejected.
// Requires apps/api AND apps/collab running.

async function openFileInEditor(page: Page, projectId: string, fileName: string): Promise<void> {
  await page.goto(`/dashboard/projects/${projectId}`);
  await expect(page.getByText(/loading\.\.\./i)).not.toBeVisible({ timeout: 8000 });
  await page.getByTestId(`tree-node-${fileName}`).click();
  await expect(page.locator('.cm-editor .cm-content')).toBeVisible({ timeout: 15_000 });
}

test.describe('Observer read-only collaboration (US4)', () => {
  test.beforeAll(async () => {
    await ensureTestUser();
  });

  let projectId: string;
  let viewer: { email: string; password: string };

  test.beforeEach(async ({ page }) => {
    await signIn(page);
    projectId = await createProject(page, `Collab Observer ${Date.now()}`);
    viewer = await createViewerInProject(page, projectId);
  });

  test.afterEach(async ({ page }) => {
    if (projectId) await cleanupProject(page, projectId);
  });

  test('a viewer opens the file read-only and still sees live edits', async ({ page, browser }) => {
    const fileName = 'observer.adoc';
    await createTestFile(page, projectId, null, fileName);

    // Editor A opens and types.
    await openFileInEditor(page, projectId, fileName);

    // Viewer B opens the same file in a separate context.
    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    try {
      await signIn(pageB, viewer.email, viewer.password);
      await openFileInEditor(pageB, projectId, fileName);

      // B's editor is read-only (not contenteditable).
      await expect(pageB.locator('.cm-editor .cm-content')).toHaveAttribute('contenteditable', 'false');

      // A types — B (observer) sees the live edit despite being read-only.
      const contentA = page.locator('.cm-editor .cm-content');
      await contentA.click();
      await page.keyboard.type('Editor A is typing');
      await expect(pageB.locator('.cm-editor .cm-content')).toContainText('Editor A is typing', { timeout: 2000 });

      // B attempts to type — the document must not change from B's input.
      const before = await pageB.locator('.cm-editor .cm-content').textContent();
      await pageB.locator('.cm-editor .cm-content').click();
      await pageB.keyboard.type('observer edit attempt');
      await expect(pageB.locator('.cm-editor .cm-content')).not.toContainText('observer edit attempt');
      expect(await pageB.locator('.cm-editor .cm-content').textContent()).toBe(before);
    } finally {
      await contextB.close();
    }
  });
});
