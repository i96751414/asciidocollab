import { test, expect } from '@playwright/test';
import { ensureTestUser } from './helpers/test-user';
import { signIn, createProject, cleanupProject } from './helpers/test-project';
import { createAdocFile, setMainFile, openProject, openFile, expandPreview, editorContent, getEditorText, liveReplaceLine } from './helpers/editor';

// Edge case "concurrent edits to the open document itself": A edits the open document locally
// WHILE B changes its inherited context live. Both A's own edit and the inherited change must be
// reflected; neither clobbers the other's derived state. Requires apps/api AND apps/collab running.

test.describe('Collab consistency — concurrent co-edit', () => {
  test.beforeAll(async () => {
    await ensureTestUser();
  });

  let projectId: string;

  test.afterEach(async ({ page }) => {
    if (projectId) await cleanupProject(page, projectId);
  });

  test('A local edit and B inherited-context edit both land without clobbering', async ({ page, browser }) => {
    test.setTimeout(120_000);
    await signIn(page);
    projectId = await createProject(page, `Collab Consistency Coedit ${Date.now()}`);

    const mainId = await createAdocFile(page, projectId, 'main.adoc', ':productName: Acme\n\ninclude::child.adoc[]\n');
    await createAdocFile(page, projectId, 'child.adoc', '= Child\n\nProduct is {productName}.\n');
    await setMainFile(page, projectId, mainId);

    await openProject(page, projectId);
    await openFile(page, 'child.adoc', /Product is/);
    await expandPreview(page);
    const previewA = page.getByTestId('asciidoc-output');
    await expect(previewA).toContainText('Product is Acme.', { timeout: 15_000 });

    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    try {
      await signIn(pageB);
      await openProject(pageB, projectId);
      await openFile(pageB, 'main.adoc', /productName/);

      // A appends its own paragraph locally while B live-edits the inherited attribute.
      const contentA = editorContent(page);
      await expect(contentA).toHaveAttribute('contenteditable', 'true', { timeout: 15_000 });
      await contentA.click();
      await page.keyboard.press('Control+End');
      await page.keyboard.type('\nA local marker line.');

      await liveReplaceLine(pageB, 'productName', ':productName: Globex');

      // Both changes survive: A's own edit is intact AND the inherited value converged to B's.
      await expect(previewA).toContainText('Product is Globex.', { timeout: 20_000 });
      await expect(previewA).toContainText('A local marker line.', { timeout: 20_000 });
      expect(await getEditorText(page)).toContain('A local marker line.'); // A's edit not clobbered
    } finally {
      await contextB.close();
    }
  });
});

