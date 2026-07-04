import { test, expect } from '@playwright/test';
import { ensureTestUser } from './helpers/test-user';
import { signIn, createProject, cleanupProject } from './helpers/test-project';
import { createAdocFile, setMainFile, openProject, openFile, lintMarkers, expectActiveFile } from './helpers/editor';

// Cross-file refactoring from the editor — find-usages lists every reference to a
// symbol across the project, and rename rewrites the id/anchor + every <<id>>/xref reference in all files.

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const MAIN = '= Book\n\n[[intro]]\n== Intro\n\nSee <<intro>>.\n\ninclude::chapter.adoc[]\n';
const CHAPTER = 'Back to <<intro,here>> and the cross-file <<book.adoc#intro>>.\n\nUnrelated <<other>>.\n';

async function readContent(page: import('@playwright/test').Page, projectId: string, fileNodeId: string): Promise<string> {
  const response = await page.request.get(`${API_URL}/projects/${projectId}/files/${fileNodeId}/content`);
  expect(response.ok()).toBeTruthy();
  return response.text();
}

test.describe('cross-file refactoring', () => {
  test.beforeAll(async () => {
    await ensureTestUser();
  });

  let projectId: string;
  let mainId: string;
  let chapterId: string;

  test.beforeEach(async ({ page }) => {
    await signIn(page);
    projectId = await createProject(page, `Refactoring ${Date.now()}`);
    mainId = await createAdocFile(page, projectId, 'main.adoc', MAIN);
    chapterId = await createAdocFile(page, projectId, 'chapter.adoc', CHAPTER);
    await setMainFile(page, projectId, mainId);
  });

  test.afterEach(async ({ page }) => {
    if (projectId) await cleanupProject(page, projectId);
  });

  test('renames an anchor and every reference across files via the Refactor dialog', async ({ page }) => {
    await openProject(page, projectId);
    await openFile(page, 'chapter.adoc');

    await page.getByRole('button', { name: /refactor/i }).click();
    const dialog = page.getByRole('dialog', { name: /refactor symbol/i });
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    await dialog.getByLabel('Symbol name').fill('intro');
    await dialog.getByRole('button', { name: /find usages/i }).click();
    // Usages span both files (chapter.adoc has two): the list is populated server-side, no client index needed.
    await expect(dialog.getByRole('list', { name: /usages/i }).getByText('chapter.adoc').first()).toBeVisible({ timeout: 15_000 });

    await dialog.getByLabel('New name').fill('overview');
    await dialog.getByRole('button', { name: /^rename$/i }).click();
    await expect(dialog.getByText(/renamed across 2 files/i)).toBeVisible({ timeout: 15_000 });

    // The persisted files now carry the new name everywhere, with paths/labels preserved.
    const main = await readContent(page, projectId, mainId);
    expect(main).toContain('[[overview]]');
    expect(main).toContain('See <<overview>>');
    expect(main).not.toMatch(/<<intro>>|\[\[intro\]\]/);

    const chapter = await readContent(page, projectId, chapterId);
    expect(chapter).toContain('<<overview,here>>');
    expect(chapter).toContain('<<book.adoc#overview>>');
    expect(chapter).toContain('<<other>>'); // unrelated anchor untouched
  });

  test('clicking a usage in another file switches the active file', async ({ page }) => {
    await openProject(page, projectId);
    await openFile(page, 'chapter.adoc');
    // Navigation uses the client symbol index (line lookup); wait until it has built. chapter.adoc
    // resolves <<intro>> + <<book.adoc#intro>> via the main-file index, leaving only <<other>> flagged.
    await expect(lintMarkers(page)).toHaveCount(1, { timeout: 20_000 });

    await page.getByRole('button', { name: /refactor/i }).click();
    const dialog = page.getByRole('dialog', { name: /refactor symbol/i });
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await dialog.getByLabel('Symbol name').fill('intro');
    await dialog.getByRole('button', { name: /find usages/i }).click();

    // The defining anchor lives in main.adoc; jump to its usage there.
    await dialog.getByRole('list', { name: /usages/i }).getByText('main.adoc').first().click();
    await expectActiveFile(page, 'main.adoc');
  });
});
