import { test, expect } from '@playwright/test';
import { ensureTestUser } from './helpers/test-user';
import { signIn, createProject, cleanupProject } from './helpers/test-project';
import { createAdocFile, openProject, openFile, editorContent } from './helpers/editor';

// US11 / FR-044: word count + reading time appear in the status bar and update on edit.

test.describe('US11 document metrics', () => {
  test.beforeAll(async () => {
    await ensureTestUser();
  });

  let projectId: string;

  test.beforeEach(async ({ page }) => {
    await signIn(page);
    projectId = await createProject(page, `Metrics ${Date.now()}`);
  });

  test.afterEach(async ({ page }) => {
    if (projectId) await cleanupProject(page, projectId);
  });

  test('word count + reading time are shown and update on edit', async ({ page }) => {
    await createAdocFile(page, projectId, 'metrics.adoc', '= Metrics\n\nThree little words.\n');
    await openProject(page, projectId);
    await openFile(page, 'metrics.adoc');

    const wordCount = page.getByTestId('editor-word-count');
    await expect(wordCount).toBeVisible();
    await expect(page.getByTestId('editor-reading-time')).toBeVisible();
    const initial = await wordCount.textContent();

    await editorContent(page).click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type('\n\nMany additional words appended to grow the count.');

    await expect(wordCount).not.toHaveText(initial ?? '');
  });
});
