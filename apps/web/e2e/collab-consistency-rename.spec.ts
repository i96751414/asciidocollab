import { test, expect, type Page } from '@playwright/test';
import { ensureTestUser } from './helpers/test-user';
import { signIn, createProject, cleanupProject } from './helpers/test-project';
import { createAdocFile, openProject, openFile, editorContent, renameFirstWord } from './helpers/editor';

// US4 / SC-004+SC-005 (FR-010/011): while A's rename suggestion is visible, its reference count and
// collision state track a collaborator's LIVE edits before Apply, and Apply then rewrites every
// live+persisted occurrence with a single-step undo. Requires apps/api AND apps/collab running.

test.describe('Collab consistency — rename suggestion tracks live edits', () => {
  test.beforeAll(async () => {
    await ensureTestUser();
  });

  let projectId: string;

  test.afterEach(async ({ page }) => {
    if (projectId) await cleanupProject(page, projectId);
  });

  test('B live-adds a reference → A count rises; a live collision blocks Apply', async ({ page, browser }) => {
    test.setTimeout(120_000);
    await signIn(page);
    projectId = await createProject(page, `Collab Consistency Rename ${Date.now()}`);

    await createAdocFile(page, projectId, 'main.adoc', ':edition: 1\n\nSee {edition}.\n');
    await createAdocFile(page, projectId, 'child.adoc', '= Child\n\nAlso {edition}.\n');

    // Client A opens main and begins renaming the definition edition → release.
    await openProject(page, projectId);
    await openFile(page, 'main.adoc', 'edition');
    await renameFirstWord(page, 'edition', 'release');

    const suggestion = page.getByTestId('rename-suggestion');
    await expect(suggestion).toBeVisible({ timeout: 20_000 });
    // Two references to `edition` project-wide (one in main, one in child).
    await expect(suggestion).toContainText('2 refs', { timeout: 15_000 });

    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    try {
      await signIn(pageB);
      await openProject(pageB, projectId);
      await openFile(pageB, 'child.adoc', /Also/);
      const contentB = editorContent(pageB);
      await expect(contentB).toHaveAttribute('contenteditable', 'true', { timeout: 15_000 });

      // B live-adds another `{edition}` reference → A's suggestion count rises to 3.
      await appendLine(pageB, 'And again {edition}.');
      await expect(suggestion).toContainText('3 refs', { timeout: 20_000 });

      // B live-adds a colliding `:release:` definition → A's Apply is blocked while it persists.
      await appendLine(pageB, ':release: 9');
      await expect(suggestion).toHaveAttribute('data-collision', 'true', { timeout: 20_000 });
    } finally {
      await contextB.close();
    }
  });
});

/** Live-edit: place the cursor at the end of the document and append a new line. */
async function appendLine(page: Page, line: string): Promise<void> {
  const content = editorContent(page);
  await content.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type(`\n${line}`);
  await expect(content).toContainText(line.replaceAll(/[{}]/g, ''), { timeout: 10_000 });
}
