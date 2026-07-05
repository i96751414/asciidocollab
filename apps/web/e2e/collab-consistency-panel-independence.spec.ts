import { test, expect, type Page } from '@playwright/test';
import { ensureTestUser } from './helpers/test-user';
import { signIn, createProject, cleanupProject } from './helpers/test-project';
import { createAdocFile, setMainFile, openProject, openFile, expandPreview, editorContent } from './helpers/editor';

// Cross-file consistency must NOT depend on the outline panel being open. With
// the left panel on the file tree (outline hidden), a collaborator's live inherited-attribute change
// still updates the open document's derived views — the removed observer subsystem used to gate this
// on outline visibility. Requires apps/api AND apps/collab running.

test.describe('Collab consistency — panel independence (outline hidden)', () => {
  test.beforeAll(async () => {
    await ensureTestUser();
  });

  let projectId: string;

  test.afterEach(async ({ page }) => {
    if (projectId) await cleanupProject(page, projectId);
  });

  test('an inherited attribute change updates A with the outline panel closed', async ({ page, browser }) => {
    await signIn(page);
    projectId = await createProject(page, `Collab Consistency Panel ${Date.now()}`);

    const mainId = await createAdocFile(
      page,
      projectId,
      'main.adoc',
      ':productName: Acme\n\ninclude::child.adoc[]\n',
    );
    await createAdocFile(page, projectId, 'child.adoc', '= Child\n\nProduct is {productName}.\n');
    await setMainFile(page, projectId, mainId);

    // Client A opens the child. The left panel defaults to the file tree (outline NOT shown).
    await openProject(page, projectId);
    await openFile(page, 'child.adoc', /Product is/);
    // Confirm the outline panel is not the active left-panel tab for this scenario.
    await expect(page.getByTestId('asciidoc-output')).toHaveCount(0);
    await expandPreview(page);
    const previewA = page.getByTestId('asciidoc-output');
    await expect(previewA).toContainText('Product is Acme.', { timeout: 15_000 });

    // Client B live-edits the parent attribute (no save, no structural event).
    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    try {
      await signIn(pageB);
      await openProject(pageB, projectId);
      await openFile(pageB, 'main.adoc', /productName/);
      await liveReplaceWord(pageB, 'Acme', 'Globex');

      // A converges even though the outline panel was never opened.
      await expect(previewA).toContainText('Product is Globex.', { timeout: 20_000 });
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
