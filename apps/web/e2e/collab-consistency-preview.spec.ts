import { test, expect, type Page } from '@playwright/test';
import { ensureTestUser } from './helpers/test-user';
import { signIn, createProject, cleanupProject } from './helpers/test-project';
import { createAdocFile, setMainFile, openProject, openFile, expandPreview, editorContent, liveReplaceLine } from './helpers/editor';

// A collaborator's UNSAVED live edit to a parent's inherited
// attribute re-renders the open child's preview. Requires apps/api AND apps/collab running.
//
// Client A opens the child and shows its preview (the child references {productName}, inherited from
// the main file). Client B live-edits the parent's :productName: value; A's preview converges to it
// with no save. Then B removes the definition and A's preview reflects the now-unresolved reference.

test.describe('Collab consistency — inherited attribute in the preview stays live', () => {
  test.beforeAll(async () => {
    await ensureTestUser();
  });

  let projectId: string;

  test.afterEach(async ({ page }) => {
    if (projectId) await cleanupProject(page, projectId);
  });

  test('B live-edits the parent attribute → A preview converges, then removal → unresolved', async ({ page, browser }) => {
    await signIn(page);
    projectId = await createProject(page, `Collab Consistency Preview ${Date.now()}`);

    const mainId = await createAdocFile(
      page,
      projectId,
      'main.adoc',
      ':productName: Acme\n\ninclude::child.adoc[]\n',
    );
    await createAdocFile(page, projectId, 'child.adoc', '= Child\n\nProduct is {productName}.\n');
    await setMainFile(page, projectId, mainId);

    // Client A opens the child and shows its preview: it inherits productName=Acme from the main file.
    await openProject(page, projectId);
    await openFile(page, 'child.adoc', /Product is/);
    await expandPreview(page);
    const previewA = page.getByTestId('asciidoc-output');
    await expect(previewA).toContainText('Product is Acme.', { timeout: 15_000 });

    // Client B opens the parent and live-edits the attribute value (no save).
    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    try {
      await signIn(pageB);
      await openProject(pageB, projectId);
      await openFile(pageB, 'main.adoc', /productName/);

      await liveReplaceLine(pageB, 'productName', ':productName: Globex');

      // A's preview converges to the new inherited value with no reload, save, or structural event.
      await expect(previewA).toContainText('Product is Globex.', { timeout: 20_000 });

      // B deletes the whole definition line → A's reference is now unresolved.
      await liveDeleteLineContaining(pageB, 'productName');
      await expect(previewA).not.toContainText('Product is Globex.', { timeout: 20_000 });
    } finally {
      await contextB.close();
    }
  });
});

/** Wait until the collaborative editor is editable (past the Yjs sync race) and return its content locator. */
async function editableContent(page: Page) {
  const content = editorContent(page);
  await expect(content).toHaveAttribute('contenteditable', 'true', { timeout: 15_000 });
  return content;
}

/** Live-edit: select the whole line containing `text` and delete it. */
async function liveDeleteLineContaining(page: Page, text: string): Promise<void> {
  const content = await editableContent(page);
  await content.getByText(text, { exact: false }).first().click();
  await page.keyboard.press('Home');
  await page.keyboard.down('Shift');
  await page.keyboard.press('End');
  await page.keyboard.up('Shift');
  await page.keyboard.press('Delete');
}
