import { test, expect } from '@playwright/test';
import { ensureTestUser } from './helpers/test-user';
import { signIn, createProject, cleanupProject } from './helpers/test-project';
import {
  createAdocFile,
  setMainFile,
  openProject,
  openFile,
  editorContent,
  lintMarkers,
  expectActiveFile,
} from './helpers/editor';

// Cross-file editor intelligence over the project symbol index —
// diagnostics that resolve references across the include tree, project-wide Go to Symbol, and
// xref go-to-definition that switches the active file.

const MAIN = '= Book\n\n[[intro]]\n== Intro\n\ninclude::chapter.adoc[]\n';
const CHAPTER = 'See <<intro>> and <<ghost>>.\n';

test.describe('cross-file intelligence', () => {
  test.beforeAll(async () => {
    await ensureTestUser();
  });

  let projectId: string;

  test.beforeEach(async ({ page }) => {
    await signIn(page);
    projectId = await createProject(page, `Intelligence ${Date.now()}`);
    await createAdocFile(page, projectId, 'main.adoc', MAIN);
    const chapterId = await createAdocFile(page, projectId, 'chapter.adoc', CHAPTER);
    // Configure main.adoc as the project main file so the index roots at it.
    const mainId = await page.request
      .get(`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'}/projects/${projectId}/files`)
      .then((r) => r.json())
      .then((tree: { children: Array<{ id: string; name: string }> }) =>
        tree.children.find((c) => c.name === 'main.adoc')?.id,
      );
    await setMainFile(page, projectId, mainId ?? null);
    void chapterId;
  });

  test.afterEach(async ({ page }) => {
    if (projectId) await cleanupProject(page, projectId);
  });

  test('diagnostics resolve a cross-file xref and flag only the unknown one', async ({ page }) => {
    await openProject(page, projectId);
    await openFile(page, 'chapter.adoc');
    // `<<intro>>` is defined in main.adoc (the index root) so it resolves cross-file; only `<<ghost>>`
    // remains unknown. If the cross-file index were not consulted, BOTH would be flagged (count 2).
    await expect(lintMarkers(page)).toHaveCount(1, { timeout: 20_000 });
  });

  test('Go to Symbol jumps to a heading defined in another file', async ({ page }) => {
    await openProject(page, projectId);
    await openFile(page, 'chapter.adoc');
    // Wait until the cross-file index has built (only `<<ghost>>` remains unresolved) so the palette
    // is populated with main.adoc's symbols, then open it.
    await expect(lintMarkers(page)).toHaveCount(1, { timeout: 20_000 });
    await page.keyboard.press('Control+Shift+O');
    const palette = page.getByRole('dialog', { name: /go to symbol/i });
    await expect(palette).toBeVisible({ timeout: 10_000 });
    await palette.getByRole('textbox').fill('intro');
    await palette.getByRole('textbox').press('Enter');
    // Selecting the symbol defined in main.adoc switches the active file.
    await expectActiveFile(page, 'main.adoc');
  });

  test('Ctrl+click on a cross-file xref switches to the defining file', async ({ page }) => {
    await openProject(page, projectId);
    await openFile(page, 'chapter.adoc');
    // Wait for the index to be ready (the same-file → cross-file resolution drives nav).
    await expect(lintMarkers(page)).toHaveCount(1, { timeout: 20_000 });
    await editorContent(page).getByText('intro', { exact: false }).first().click({ modifiers: ['Control'] });
    await expectActiveFile(page, 'main.adoc');
  });
});
