import { test, expect } from '@playwright/test';
import { ensureTestUser } from './helpers/test-user';
import { signIn, createProject, cleanupProject } from './helpers/test-project';
import { createAdocFile, setMainFile, openProject, openFile, expandPreview } from './helpers/editor';

// US4 / FR-014/FR-015/FR-016 (cross-references honor xrefstyle): the main file sets `:xrefstyle:`
// before including a child; a `<<id>>` reference in the child renders with the inherited style's
// link text in the assembled preview.

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

async function fileId(page: import('@playwright/test').Page, projectId: string, name: string): Promise<string> {
  const tree = await page.request.get(`${API}/projects/${projectId}/files`).then((r) => r.json());
  const node = (tree.children as Array<{ id: string; name: string }>).find((c) => c.name === name);
  if (!node) throw new Error(`file ${name} not found`);
  return node.id;
}

test.describe('US4 cross-references honor xrefstyle across files', () => {
  test.beforeAll(async () => {
    await ensureTestUser();
  });

  let projectId: string;

  test.beforeEach(async ({ page }) => {
    await signIn(page);
    projectId = await createProject(page, `Cross-File Xrefstyle ${Date.now()}`);
  });

  test.afterEach(async ({ page }) => {
    if (projectId) await cleanupProject(page, projectId);
  });

  test('a child <<id>> renders with the inherited xrefstyle full-style label', async ({ page }) => {
    await createAdocFile(
      page,
      projectId,
      'main.adoc',
      '= Book\n:xrefstyle: full\n:sectnums:\n\ninclude::child.adoc[]\n',
    );
    await createAdocFile(
      page,
      projectId,
      'child.adoc',
      '== Target Section\n\nIntro.\n\nSee <<_target_section>> for details.\n',
    );
    await setMainFile(page, projectId, await fileId(page, projectId, 'main.adoc'));

    await openProject(page, projectId);
    await openFile(page, 'main.adoc');
    await expandPreview(page);

    const output = page.getByTestId('asciidoc-output');
    const link = output.locator('a[href="#_target_section"]');
    await expect(link).toHaveCount(1, { timeout: 15_000 });
    // full style includes the section signifier word "Section" plus the title — not just the title.
    await expect(link).toContainText('Section');
    await expect(link).toContainText('Target Section');
  });
});
