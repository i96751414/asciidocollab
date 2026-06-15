import { test, expect } from '@playwright/test';
import { ensureTestUser } from './helpers/test-user';
import { signIn, createProject, cleanupProject } from './helpers/test-project';
import { createAdocFile, openProject, openFile, getEditorText } from './helpers/editor';

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

  test('Ctrl+B wraps the selected word in *…*', async ({ page }) => {
    await createAdocFile(page, projectId, 'conv-bold.adoc', '= Conv\n\nword\n');
    await openProject(page, projectId);
    await openFile(page, 'conv-bold.adoc');

    await page.locator('.cm-line', { hasText: 'word' }).dblclick(); // selects "word"
    await page.keyboard.press('Control+b');
    await expect.poll(async () => getEditorText(page)).toContain('*word*');
  });

  test('typing an emphasis mark over a selection auto-wraps it (FR-037)', async ({ page }) => {
    await createAdocFile(page, projectId, 'conv-wrap.adoc', '= Conv\n\nterm\n');
    await openProject(page, projectId);
    await openFile(page, 'conv-wrap.adoc');

    await page.locator('.cm-line', { hasText: 'term' }).dblclick(); // selects "term"
    await page.keyboard.type('_');
    await expect.poll(async () => getEditorText(page)).toContain('_term_');
  });

  test('pasting a URL over a selection produces a link macro', async ({ page }) => {
    await createAdocFile(page, projectId, 'paste.adoc', '= Paste\n\nclick here\n');
    await openProject(page, projectId);
    await openFile(page, 'paste.adoc');

    // Select the whole "click here" line, then simulate pasting a URL over it.
    await page.locator('.cm-line', { hasText: 'click here' }).click();
    await page.keyboard.press('Home');
    await page.keyboard.press('Shift+End');

    await page.evaluate(() => {
      const dt = new DataTransfer();
      dt.setData('text/plain', 'https://example.com');
      const target = document.querySelector('.cm-content');
      target?.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    });

    await expect.poll(async () => getEditorText(page)).toContain('https://example.com[');
  });
});
