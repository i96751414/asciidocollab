import { test, expect } from '@playwright/test';
import { ensureTestUser } from './helpers/test-user';
import { signIn, createProject, cleanupProject } from './helpers/test-project';
import { createAdocFile, openProject, openFile, getEditorText } from './helpers/editor';

// US6 / FR-020–022: the Code Block toolbar action inserts a [source,<lang>]
// declaration + listing delimiters, with the cursor on the language placeholder.

test.describe('US6 insert source block', () => {
  test.beforeAll(async () => {
    await ensureTestUser();
  });

  let projectId: string;

  test.beforeEach(async ({ page }) => {
    await signIn(page);
    projectId = await createProject(page, `Insert Source ${Date.now()}`);
  });

  test.afterEach(async ({ page }) => {
    if (projectId) await cleanupProject(page, projectId);
  });

  test('Code Block inserts [source,…] + ---- and selects the language placeholder', async ({ page }) => {
    await createAdocFile(page, projectId, 'insert.adoc', '= Insert\n\n');
    await openProject(page, projectId);
    await openFile(page, 'insert.adoc');

    await page.locator('.cm-editor .cm-content').click();
    await page.keyboard.press('Control+End');
    await page.getByRole('button', { name: /code block/i }).click();

    const text = await getEditorText(page);
    expect(text).toContain('[source,');
    expect(text).toContain('----');

    // The language placeholder is selected — typing replaces it.
    await page.keyboard.type('ruby');
    expect(await getEditorText(page)).toContain('[source,ruby]');
  });
});
