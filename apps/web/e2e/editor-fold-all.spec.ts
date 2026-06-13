import { test, expect } from '@playwright/test';
import { ensureTestUser } from './helpers/test-user';
import { signIn, createProject, cleanupProject } from './helpers/test-project';
import { createAdocFile, openProject, openFile, foldPlaceholders, foldGutterMarkers } from './helpers/editor';

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

  test('a fold is persisted and restored across reload (FR-043)', async ({ page }) => {
    await createAdocFile(page, projectId, 'foldall.adoc', DOC);
    await openProject(page, projectId);
    await openFile(page, 'foldall.adoc');

    // Fold a section via its gutter toggle (CM reveals fold markers on hover);
    // the fold-persistence extension saves it per project:file.
    await foldGutterMarkers(page).first().click();
    await expect(foldPlaceholders(page).first()).toBeVisible({ timeout: 5000 });

    // Persisted folds are restored after reload.
    await page.reload();
    await openFile(page, 'foldall.adoc');
    await expect(foldPlaceholders(page).first()).toBeVisible({ timeout: 8000 });
  });
});
