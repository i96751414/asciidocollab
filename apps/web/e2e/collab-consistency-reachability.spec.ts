import { test, expect, type Page } from '@playwright/test';
import { ensureTestUser } from './helpers/test-user';
import { signIn, createProject, cleanupProject } from './helpers/test-project';
import { createAdocFile, setMainFile, openProject, openFile, expandPreview, editorContent } from './helpers/editor';

// Edge case "reachability changes": a collaborator's live include:: edit changes which files
// are in the open document's context. A file that ENTERS starts contributing its attributes; a file
// that LEAVES stops. Requires apps/api AND apps/collab running.

test.describe('Collab consistency — reachability changes propagate', () => {
  test.beforeAll(async () => {
    await ensureTestUser();
  });

  let projectId: string;

  test.afterEach(async ({ page }) => {
    if (projectId) await cleanupProject(page, projectId);
  });

  test('B live-adds then removes an include → A adds/drops the contributed attribute', async ({ page, browser }) => {
    test.setTimeout(120_000);
    await signIn(page);
    projectId = await createProject(page, `Collab Consistency Reach ${Date.now()}`);

    const mainId = await createAdocFile(page, projectId, 'main.adoc', '= Main\n\ninclude::child.adoc[]\n');
    await createAdocFile(page, projectId, 'child.adoc', '= Child\n\nEdition is {edition}.\n');
    await createAdocFile(page, projectId, 'extra.adoc', ':edition: Pro\n');
    await setMainFile(page, projectId, mainId);

    // Client A opens the child; extra.adoc is not yet reachable, so {edition} is unresolved.
    await openProject(page, projectId);
    await openFile(page, 'child.adoc', /Edition is/);
    await expandPreview(page);
    const previewA = page.getByTestId('asciidoc-output');
    await expect(previewA).toContainText('Edition is {edition}.', { timeout: 15_000 });

    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    try {
      await signIn(pageB);
      await openProject(pageB, projectId);
      await openFile(pageB, 'main.adoc', /Main/);

      // B live-adds an include of extra.adoc ABOVE the child include → extra ENTERS A's context and
      // its :edition: now contributes, so A's {edition} resolves to Pro.
      await insertLineAfterTitle(pageB, 'include::extra.adoc[]');
      await expect(previewA).toContainText('Edition is Pro.', { timeout: 20_000 });

      // B removes the include → extra LEAVES A's context and {edition} is unresolved again.
      await deleteLineContaining(pageB, 'include::extra.adoc[]');
      await expect(previewA).toContainText('Edition is {edition}.', { timeout: 20_000 });
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

/** Live-edit: put the cursor at the end of the first line (the title) and insert a new line below it. */
async function insertLineAfterTitle(page: Page, line: string): Promise<void> {
  const content = await editableContent(page);
  await content.locator('.cm-line').first().click();
  await page.keyboard.press('End');
  await page.keyboard.type(`\n${line}`);
  await expect(content).toContainText(line, { timeout: 10_000 });
}

/** Live-edit: select the whole line containing `text` and delete it plus its newline. */
async function deleteLineContaining(page: Page, text: string): Promise<void> {
  const content = await editableContent(page);
  await content.getByText(text, { exact: false }).first().click();
  await page.keyboard.press('Home');
  await page.keyboard.down('Shift');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.up('Shift');
  await page.keyboard.press('Delete');
}
