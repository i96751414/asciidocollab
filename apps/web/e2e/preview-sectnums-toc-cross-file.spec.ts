import { test, expect } from '@playwright/test';
import { ensureTestUser } from './helpers/test-user';
import { signIn, createProject, cleanupProject } from './helpers/test-project';
import { createAdocFile, setMainFile, openProject, openFile, expandPreview } from './helpers/editor';

// Section numbering & TOC across includes: the main file enables
// `:sectnums:` and `:toc:` and includes two chapters with `leveloffset=+1`. Once assembled, native
// Asciidoctor numbers the sections and builds the TOC over the offset-adjusted structure: the two
// `= Chapter` titles (raw level 0) are shifted to level 1 and number continuously (1, 2), and the
// TOC lists both at their effective (offset) levels in document order.

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

async function fileId(page: import('@playwright/test').Page, projectId: string, name: string): Promise<string> {
  const tree = await page.request.get(`${API}/projects/${projectId}/files`).then((r) => r.json());
  const node = (tree.children as Array<{ id: string; name: string }>).find((c) => c.name === name);
  if (!node) throw new Error(`file ${name} not found`);
  return node.id;
}

test.describe('section numbering & TOC across includes', () => {
  test.beforeAll(async () => {
    await ensureTestUser();
  });

  let projectId: string;

  test.beforeEach(async ({ page }) => {
    await signIn(page);
    projectId = await createProject(page, `Cross-File Sectnums TOC ${Date.now()}`);
  });

  test.afterEach(async ({ page }) => {
    if (projectId) await cleanupProject(page, projectId);
  });

  test('sectnums + toc number offset chapters continuously and build a TOC at offset levels', async ({ page }) => {
    // The main file turns on numbering and the TOC, then includes two chapters at leveloffset=+1 so
    // each chapter's `= …` (raw level 0) renders as an effective level-1 section (an <h2>).
    await createAdocFile(
      page,
      projectId,
      'main.adoc',
      '= Book\n:sectnums:\n:toc:\n\n' +
        'include::ch1.adoc[leveloffset=+1]\n\n' +
        'include::ch2.adoc[leveloffset=+1]\n',
    );
    await createAdocFile(page, projectId, 'ch1.adoc', '= First Chapter\n\nText one.\n');
    await createAdocFile(page, projectId, 'ch2.adoc', '= Second Chapter\n\nText two.\n');
    await setMainFile(page, projectId, await fileId(page, projectId, 'main.adoc'));

    await openProject(page, projectId);
    // Open the MAIN file so the include tree is assembled with the inherited numbering/TOC attributes.
    await openFile(page, 'main.adoc', 'Book');
    await expandPreview(page);
    await page.getByTestId('show-includes-toggle').click();

    const output = page.getByTestId('asciidoc-output');

    // Section numbering is continuous across the two offset chapters: 1, then 2 (NOT 1, 1).
    await expect(output.locator('h2', { hasText: '1. First Chapter' })).toHaveCount(1, { timeout: 15_000 });
    await expect(output.locator('h2', { hasText: '2. Second Chapter' })).toHaveCount(1);

    // The TOC is rendered (embedded mode emits the `<div id="toc">` block when `:toc:` is set) and
    // reflects the assembled, offset-adjusted structure: both chapters listed at the offset level.
    const toc = output.locator('#toc');
    await expect(toc).toHaveCount(1);
    const tocLinks = toc.locator('ul.sectlevel1 > li > a');
    await expect(tocLinks).toHaveCount(2);
    await expect(tocLinks.nth(0)).toHaveText(/1\. First Chapter/);
    await expect(tocLinks.nth(1)).toHaveText(/2\. Second Chapter/);
  });
});
