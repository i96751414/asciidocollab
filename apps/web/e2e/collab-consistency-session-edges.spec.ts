import { test, expect, type Page } from '@playwright/test';
import { ensureTestUser } from './helpers/test-user';
import { signIn, createProject, cleanupProject } from './helpers/test-project';
import { createAdocFile, setMainFile, openProject, openFile, expandPreview, editorContent } from './helpers/editor';

// US7 / SC-008 (FR-003): related files with no active session resolve from persisted content and
// switch to live automatically on session start, then back to persisted on session end — with no
// stale intermediate. Requires apps/api AND apps/collab running.

test.describe('Collab consistency — graceful live↔persisted session edges', () => {
  test.beforeAll(async () => {
    await ensureTestUser();
  });

  let projectId: string;

  test.afterEach(async ({ page }) => {
    if (projectId) await cleanupProject(page, projectId);
  });

  test('session start switches A to live; session end reverts A to persisted', async ({ page, browser }) => {
    test.setTimeout(120_000);
    await signIn(page);
    projectId = await createProject(page, `Collab Consistency Session ${Date.now()}`);

    const mainId = await createAdocFile(page, projectId, 'main.adoc', ':productName: Acme\n\ninclude::child.adoc[]\n');
    await createAdocFile(page, projectId, 'child.adoc', '= Child\n\nProduct is {productName}.\n');
    await setMainFile(page, projectId, mainId);

    // Client A opens the child. With no session on the parent, it resolves from persisted content.
    await openProject(page, projectId);
    await openFile(page, 'child.adoc', /Product is/);
    await expandPreview(page);
    const previewA = page.getByTestId('asciidoc-output');
    await expect(previewA).toContainText('Product is Acme.', { timeout: 15_000 });

    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    try {
      // Session start: B opens the parent (a live session) and live-edits the attribute.
      await signIn(pageB);
      await openProject(pageB, projectId);
      await openFile(pageB, 'main.adoc', /productName/);
      await liveReplaceWord(pageB, 'Acme', 'Live');
      await expect(previewA).toContainText('Product is Live.', { timeout: 20_000 }); // switched to live

      // Session end: B closes without saving → A reverts to the persisted value with no manual refresh.
      await pageB.close();
      await expect(previewA).toContainText('Product is Acme.', { timeout: 30_000 });
      await expect(previewA).not.toContainText('Product is Live.');
    } finally {
      await contextB.close();
    }
  });
});

/** Live-edit: double-click a word to select it and type over it, past the Yjs sync race. */
async function liveReplaceWord(page: Page, word: string, replacement: string): Promise<void> {
  const content = editorContent(page);
  await expect(content).toHaveAttribute('contenteditable', 'true', { timeout: 15_000 });
  await content.getByText(word, { exact: false }).first().dblclick();
  await page.keyboard.type(replacement);
  await expect(content).toContainText(replacement, { timeout: 10_000 });
}
