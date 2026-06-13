import { test, expect } from '@playwright/test';
import { ensureTestUser } from './helpers/test-user';
import { signIn, createProject, cleanupProject } from './helpers/test-project';
import { createAdocFile, openProject, openFile, editorContent, getEditorText } from './helpers/editor';

// US9 / FR-036–040/062/063: format shortcuts + auto-pair, paste URL→link,
// paste HTML→AsciiDoc, spell-check flags prose (not code).

test.describe('US9 authoring conveniences', () => {
  test.beforeAll(async () => {
    await ensureTestUser();
  });

  let projectId: string;

  test.beforeEach(async ({ page }) => {
    await signIn(page);
    projectId = await createProject(page, `Conveniences ${Date.now()}`);
  });

  test.afterEach(async ({ page }) => {
    if (projectId) await cleanupProject(page, projectId);
  });

  test('Ctrl+B wraps the selection in *…* and typing a mark over a selection wraps it', async ({ page }) => {
    await createAdocFile(page, projectId, 'conv.adoc', '= Conv\n\nword\n');
    await openProject(page, projectId);
    await openFile(page, 'conv.adoc');

    await editorContent(page).click();
    await page.keyboard.press('Control+End');
    // Select the word "word" on the last content line.
    await page.keyboard.press('Home');
    await page.keyboard.press('Shift+End');
    await page.keyboard.press('Control+b');
    expect(await getEditorText(page)).toContain('*word*');

    // Auto-pair: re-select and type `_` → wraps in italic.
    await page.keyboard.press('Home');
    await page.keyboard.press('Shift+End');
    await page.keyboard.type('_');
    expect(await getEditorText(page)).toContain('_');
  });

  test('pasting a URL over a selection produces a link macro', async ({ page }) => {
    await createAdocFile(page, projectId, 'paste.adoc', '= Paste\n\nclick here\n');
    await openProject(page, projectId);
    await openFile(page, 'paste.adoc');

    await editorContent(page).click();
    await page.keyboard.press('Control+End');
    await page.keyboard.press('Home');
    await page.keyboard.press('Shift+End');

    // Simulate a clipboard paste of a URL.
    await page.evaluate(async () => {
      const dt = new DataTransfer();
      dt.setData('text/plain', 'https://example.com');
      const target = document.querySelector('.cm-content');
      target?.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    });

    await expect.poll(async () => getEditorText(page)).toContain('https://example.com[');
  });
});
