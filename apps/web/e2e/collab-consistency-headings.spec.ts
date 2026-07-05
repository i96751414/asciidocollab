import { test, expect, type Page } from '@playwright/test';
import { ensureTestUser } from './helpers/test-user';
import { signIn, createProject, cleanupProject } from './helpers/test-project';
import { createAdocFile, setMainFile, openProject, editorContent, expandPreview, liveReplaceLine } from './helpers/editor';

// Headings, the assembled outline, the HTML preview, and cross-references stay consistent with a
// collaborator's live structural edits to a related file. A views the full-document outline AND the
// assembled preview; B live-edits a heading in an included sibling; A's assembled outline AND preview
// both adopt it — the same reachableDocVersion recompute that keeps inherited heading IDs consistent.
// (Regression: the preview once lagged because only the outline recomputed on that signal.)
// Requires apps/api AND apps/collab running.

const railTab = (page: Page, name: RegExp) => page.getByRole('tab', { name });
const outlineRow = (page: Page, name: string | RegExp) =>
  page.getByRole('navigation', { name: /section outline/i }).getByRole('button', { name });

test.describe('Collab consistency — headings & assembled outline stay live', () => {
  test.beforeAll(async () => {
    await ensureTestUser();
  });

  let projectId: string;

  test.afterEach(async ({ page }) => {
    if (projectId) await cleanupProject(page, projectId);
  });

  test('B live-edits an included heading → A assembled outline adopts it', async ({ page, browser }) => {
    test.setTimeout(90_000);
    await signIn(page);
    projectId = await createProject(page, `Collab Consistency Headings ${Date.now()}`);

    const mainId = await createAdocFile(page, projectId, 'main.adoc', '= Main Book\n\n== Main Sec\n\ninclude::child.adoc[]\n');
    await createAdocFile(page, projectId, 'child.adoc', '== Child Sec\n\nChild body.\n');
    await setMainFile(page, projectId, mainId);

    // Client A opens main in the full-document outline (the default scope): both files' headings show.
    await openProject(page, projectId);
    await page.getByTestId('tree-node-main.adoc').click();
    await expect(editorContent(page)).toContainText('Main Sec', { timeout: 15_000 });
    await railTab(page, /outline/i).click();
    await expect(outlineRow(page, 'Main Sec')).toBeVisible({ timeout: 20_000 });
    await expect(outlineRow(page, 'Child Sec')).toBeVisible({ timeout: 10_000 });

    // A also opens the assembled preview with included bodies inlined, so the child heading renders in
    // the HTML — the preview is the derived view the outline's recompute must NOT leave behind.
    await expandPreview(page);
    await page.getByTestId('show-includes-toggle').click();
    const previewA = page.getByTestId('asciidoc-output');
    await expect(previewA).toContainText('Child Sec', { timeout: 20_000 });

    // Client B opens the included child and live-renames its heading.
    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    try {
      await signIn(pageB);
      await openProject(pageB, projectId);
      await pageB.getByTestId('tree-node-child.adoc').click();
      const contentB = editorContent(pageB);
      // Rename the included heading by replacing its whole line (deterministic — a double-click on the
      // getByText match lands on the .cm-line centre and would select the wrong word).
      await liveReplaceLine(pageB, 'Child Sec', '== Child Renamed');
      await expect(contentB).toContainText('Child Renamed', { timeout: 10_000 });

      // A's assembled outline adopts the collaborator's live heading with no manual refresh.
      await expect(outlineRow(page, 'Child Renamed')).toBeVisible({ timeout: 20_000 });
      await expect(outlineRow(page, 'Child Sec')).toHaveCount(0);

      // ...and so does A's assembled preview — the same live signal must recompute the HTML, not only
      // the outline. Before the fix the preview stayed on "Child Sec" while the outline updated.
      await expect(previewA).toContainText('Child Renamed', { timeout: 20_000 });
      await expect(previewA).not.toContainText('Child Sec', { timeout: 10_000 });
    } finally {
      await contextB.close();
    }
  });
});
