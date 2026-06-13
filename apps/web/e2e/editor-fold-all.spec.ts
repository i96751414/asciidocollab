import { test, expect } from '@playwright/test';
import { ensureTestUser } from './helpers/test-user';
import { signIn, createProject, cleanupProject } from './helpers/test-project';
import { createAdocFile, openProject, openFile, foldPlaceholders } from './helpers/editor';

// US10 / FR-042/043: fold-all / unfold-all / fold-to-level, and persisted folds
// restored on reopen.

const DOC = [
  '= Doc',
  '',
  '== One',
  '',
  'body one',
  '',
  '== Two',
  '',
  'body two',
  '',
].join('\n');

test.describe('US10 whole-document fold controls', () => {
  test.beforeAll(async () => {
    await ensureTestUser();
  });

  let projectId: string;

  test.beforeEach(async ({ page }) => {
    await signIn(page);
    projectId = await createProject(page, `Fold All ${Date.now()}`);
  });

  test.afterEach(async ({ page }) => {
    if (projectId) await cleanupProject(page, projectId);
  });

  test('fold-all collapses sections and the state persists across reload', async ({ page }) => {
    await createAdocFile(page, projectId, 'foldall.adoc', DOC);
    await openProject(page, projectId);
    await openFile(page, 'foldall.adoc');

    await page.locator('.cm-editor .cm-content').click();
    await page.keyboard.press('Control+Alt+['); // fold-all
    await expect(foldPlaceholders(page).first()).toBeVisible();
    const foldedCount = await foldPlaceholders(page).count();
    expect(foldedCount).toBeGreaterThan(0);

    // Persisted folds are restored after reload.
    await page.reload();
    await openFile(page, 'foldall.adoc');
    await expect(foldPlaceholders(page).first()).toBeVisible({ timeout: 8000 });
  });
});
