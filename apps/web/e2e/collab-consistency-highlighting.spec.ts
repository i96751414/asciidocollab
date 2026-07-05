import { test, expect, type Page } from '@playwright/test';
import { ensureTestUser } from './helpers/test-user';
import { signIn, createProject, cleanupProject } from './helpers/test-project';
import { createAdocFile, setMainFile, openProject, openFile, editorContent } from './helpers/editor';

// The editor's treatment of an inherited attribute recomputes on a
// collaborator's live change. A known/inherited attribute reference folds to its resolved value
// (.cm-ad-attr-value); an unknown one stays raw. Client B live-adds then removes the parent's
// definition; A's `{flag}` reference flips known↔undefined in the editor. Requires apps/api + collab.

test.describe('Collab consistency — inherited attribute highlighting stays live', () => {
  test.beforeAll(async () => {
    await ensureTestUser();
  });

  let projectId: string;

  test.afterEach(async ({ page }) => {
    if (projectId) await cleanupProject(page, projectId);
  });

  test('B adds/removes an inherited definition → A highlighting flips undefined↔known', async ({ page, browser }) => {
    await signIn(page);
    projectId = await createProject(page, `Collab Consistency Highlight ${Date.now()}`);

    const mainId = await createAdocFile(page, projectId, 'main.adoc', '= Main\n\ninclude::child.adoc[]\n');
    await createAdocFile(page, projectId, 'child.adoc', '= Child\n\nFlag value is {flag} here.\n');
    await setMainFile(page, projectId, mainId);

    // Client A opens the child. `{flag}` is undefined (parent has no :flag:) so it is NOT folded.
    await openProject(page, projectId);
    await openFile(page, 'child.adoc', /Flag value is/);
    const foldedValue = page.locator('.cm-ad-attr-value', { hasText: 'on' });
    await expect(foldedValue).toHaveCount(0);

    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    try {
      await signIn(pageB);
      await openProject(pageB, projectId);
      await openFile(pageB, 'main.adoc', /Main/);

      // B live-adds `:flag: on` to the parent → A's `{flag}` becomes known and folds to its value.
      await liveInsertLineAtTop(pageB, ':flag: on');
      await expect(foldedValue).toBeVisible({ timeout: 20_000 });

      // B removes the definition → A's `{flag}` reverts to undefined (no folded value).
      await liveDeleteLineContaining(pageB, ':flag: on');
      await expect(foldedValue).toHaveCount(0, { timeout: 20_000 });
    } finally {
      await contextB.close();
    }
  });
});

async function editableContent(page: Page) {
  const content = editorContent(page);
  await expect(content).toHaveAttribute('contenteditable', 'true', { timeout: 15_000 });
  return content;
}

/** Live-edit: place the cursor at the very top of the document and insert a new line. */
async function liveInsertLineAtTop(page: Page, line: string): Promise<void> {
  const content = await editableContent(page);
  await content.click();
  await page.keyboard.press('Control+Home');
  await page.keyboard.type(`${line}\n`);
  await expect(content).toContainText(line, { timeout: 10_000 });
}

/** Live-edit: select the whole line containing `text` and delete it (plus its trailing newline). */
async function liveDeleteLineContaining(page: Page, text: string): Promise<void> {
  const content = await editableContent(page);
  await content.getByText(text, { exact: false }).first().click();
  await page.keyboard.press('Home');
  await page.keyboard.down('Shift');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.up('Shift');
  await page.keyboard.press('Delete');
}
