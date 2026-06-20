import { test, expect } from '@playwright/test';
import { ensureTestUser } from './helpers/test-user';
import { signIn, createProject, cleanupProject } from './helpers/test-project';
import { createAdocFile, setMainFile, openProject, openFile } from './helpers/editor';

// Phase 18 / R11 (editor outline consistency, FR-007a/FR-007b): the editor's SECTION OUTLINE panel
// must reflect the same cross-document resolution the rendered preview does — effective
// (offset-adjusted) heading levels and `{attr}`-resolved titles — and refresh live when the include
// structure or the project main-file setting changes. This is cross-file behaviour, so per R10 it is
// covered by an e2e in addition to the unit tests for `computeHeadingLevels`/outline extraction.

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

async function fileId(page: import('@playwright/test').Page, projectId: string, name: string): Promise<string> {
  const tree = await page.request.get(`${API}/projects/${projectId}/files`).then((r) => r.json());
  const node = (tree.children as Array<{ id: string; name: string }>).find((c) => c.name === name);
  if (!node) throw new Error(`file ${name} not found`);
  return node.id;
}

/** The section-outline navigation in the left panel's Outline view (028). */
function outline(page: import('@playwright/test').Page) {
  return page.getByRole('navigation', { name: 'Section outline' });
}

/**
 * Activate the left panel's Outline view (028): the outline lives behind a rail tab and Files is the
 * default view, so its `navigation` is rendered `hidden` until the Outline tab is selected. The tab
 * preference is persisted, but this is idempotent — safe to call again after a reload.
 */
async function showOutline(page: import('@playwright/test').Page) {
  await page.getByRole('tab', { name: /outline/i }).click();
  await expect(outline(page)).toBeVisible({ timeout: 15_000 });
}

test.describe('editor outline cross-document consistency', () => {
  test.beforeAll(async () => {
    await ensureTestUser();
  });

  let projectId: string;

  test.beforeEach(async ({ page }) => {
    await signIn(page);
    projectId = await createProject(page, `Outline Cross-Document ${Date.now()}`);
  });

  test.afterEach(async ({ page }) => {
    if (projectId) await cleanupProject(page, projectId);
  });

  test('outline reflects inherited leveloffset and a resolved {attr} title for a non-root file', async ({ page }) => {
    // The main file defines `productName` and includes the chapter with `leveloffset=+1`. The chapter
    // references `{productName}` in its section title. When the chapter is opened as a NON-root file,
    // the outline must (a) shift `== {productName} Guide` (raw level 1) to effective level 2 via the
    // inherited offset and (b) show the resolved title "Acme Guide" — matching the assembled preview.
    await createAdocFile(
      page,
      projectId,
      'main.adoc',
      '= Book\n:productName: Acme\n\ninclude::chapter.adoc[leveloffset=+1]\n',
    );
    await createAdocFile(page, projectId, 'chapter.adoc', '== {productName} Guide\n\nBody text.\n');
    await setMainFile(page, projectId, await fileId(page, projectId, 'main.adoc'));

    await openProject(page, projectId);
    await openFile(page, 'chapter.adoc');
    await showOutline(page);

    // The outline shows the RESOLVED title (the raw `{productName}` is replaced by "Acme").
    const entry = outline(page).getByRole('button', { name: 'Acme Guide' });
    await expect(entry).toBeVisible({ timeout: 15_000 });
    await expect(outline(page).getByRole('button', { name: /\{productName\}/ })).toHaveCount(0);

    // The entry sits at effective level 2 (raw 1 + inherited +1), exposed as `data-level` on its <li>.
    await expect(entry.locator('xpath=ancestor::li[1]')).toHaveAttribute('data-level', '2');
  });

  test('outline updates live when the project main-file setting changes', async ({ page }) => {
    // With NO main file, the chapter is its own include root: no inherited offset and no inherited
    // `productName`, so `== {productName} Guide` is effective level 1 with an UNRESOLVED title.
    await createAdocFile(
      page,
      projectId,
      'main.adoc',
      '= Book\n:productName: Acme\n\ninclude::chapter.adoc[leveloffset=+1]\n',
    );
    await createAdocFile(page, projectId, 'chapter.adoc', '== {productName} Guide\n\nBody text.\n');

    await openProject(page, projectId);
    await openFile(page, 'chapter.adoc');
    await showOutline(page);

    // Standalone root: raw level 1, title unresolved (no cross-document scope yet).
    const rawEntry = outline(page).getByRole('button', { name: '{productName} Guide' });
    await expect(rawEntry).toBeVisible({ timeout: 15_000 });
    await expect(rawEntry.locator('xpath=ancestor::li[1]')).toHaveAttribute('data-level', '1');

    // Configure main.adoc as the main file (the project-settings action): the chapter is now included
    // with leveloffset=+1 and inherits `productName`. When the editor loads under the new setting the
    // outline re-resolves WITHOUT a document edit (FR-007b): the title resolves and the level shifts.
    const mainId = await fileId(page, projectId, 'main.adoc');
    await setMainFile(page, projectId, mainId);
    await page.reload();
    // The Outline tab selected above is persisted, so after the reload the file tree is hidden; switch
    // back to Files to open the chapter, then re-activate Outline to assert the re-resolved entry.
    await page.getByRole('tab', { name: /files/i }).click();
    await openFile(page, 'chapter.adoc');
    await showOutline(page);

    const resolvedEntry = outline(page).getByRole('button', { name: 'Acme Guide' });
    await expect(resolvedEntry).toBeVisible({ timeout: 15_000 });
    await expect(resolvedEntry.locator('xpath=ancestor::li[1]')).toHaveAttribute('data-level', '2');
    await expect(outline(page).getByRole('button', { name: /\{productName\}/ })).toHaveCount(0);
  });
});
