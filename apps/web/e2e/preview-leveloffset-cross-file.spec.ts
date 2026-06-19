import { test, expect } from '@playwright/test';
import { ensureTestUser } from './helpers/test-user';
import { signIn, createProject, cleanupProject } from './helpers/test-project';
import { createAdocFile, setMainFile, openProject, openFile, expandPreview } from './helpers/editor';

// US2 / FR-008/FR-009/FR-010 (leveloffset across files): a child included with `leveloffset=+1`
// has its headings shifted both in the assembled PREVIEW (an effective level deeper) and in the
// EDITOR's structural understanding (the heading-level decoration class) when the child is opened
// as a non-root file. The parent's own headings are unaffected (the offset is include-scoped).

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

async function fileId(page: import('@playwright/test').Page, projectId: string, name: string): Promise<string> {
  const tree = await page.request.get(`${API}/projects/${projectId}/files`).then((r) => r.json());
  const node = (tree.children as Array<{ id: string; name: string }>).find((c) => c.name === name);
  if (!node) throw new Error(`file ${name} not found`);
  return node.id;
}

test.describe('US2 leveloffset across files', () => {
  test.beforeAll(async () => {
    await ensureTestUser();
  });

  let projectId: string;

  test.beforeEach(async ({ page }) => {
    await signIn(page);
    projectId = await createProject(page, `Cross-File Leveloffset ${Date.now()}`);
  });

  test.afterEach(async ({ page }) => {
    if (projectId) await cleanupProject(page, projectId);
  });

  test('a child included with leveloffset=+1 shifts in the preview and the editor outline', async ({ page }) => {
    // The main file includes the child with leveloffset=+1; the child's level-1 section (`== Chapter`)
    // therefore renders one level deeper (effective level 2) once assembled under the main file.
    await createAdocFile(
      page,
      projectId,
      'main.adoc',
      '= Book\n\ninclude::chapter.adoc[leveloffset=+1]\n\n== Parent Section\n',
    );
    await createAdocFile(page, projectId, 'chapter.adoc', '== Chapter\n\nBody text.\n');
    await setMainFile(page, projectId, await fileId(page, projectId, 'main.adoc'));

    await openProject(page, projectId);

    // Open the MAIN file: its preview assembles the tree. The child's `== Chapter` (raw level 1)
    // renders shifted to an <h3> (effective level 2 ⇒ heading depth 3 in HTML), while the parent's
    // own `== Parent Section` stays an <h2> because the offset is restored after the include.
    await openFile(page, 'main.adoc');
    await expandPreview(page);
    const output = page.getByTestId('asciidoc-output');
    await expect(output.locator('h3', { hasText: 'Chapter' })).toHaveCount(1, { timeout: 15_000 });
    await expect(output.locator('h2', { hasText: 'Parent Section' })).toHaveCount(1);

    // Open the CHILD as a non-root file: the editor applies the inherited +1 offset so `== Chapter`
    // (raw level 1) is styled as an effective-level-2 heading line in the editor.
    await openFile(page, 'chapter.adoc');
    await expect(page.locator('.cm-line.cm-ad-h2', { hasText: 'Chapter' })).toHaveCount(1, { timeout: 15_000 });
    // It must NOT be styled at its raw level (1) — the inherited offset shifted it.
    await expect(page.locator('.cm-line.cm-ad-h1', { hasText: 'Chapter' })).toHaveCount(0);
  });
});
