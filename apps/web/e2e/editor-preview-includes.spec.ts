import { test, expect } from '@playwright/test';
import { ensureTestUser } from './helpers/test-user';
import { signIn, createProject, cleanupProject } from './helpers/test-project';
import { createAdocFile, setMainFile, openProject, openFile, expandPreview } from './helpers/editor';

// (Constitution IX): the preview assembles the configured main document's includes
// (sandbox-confined) and renders the inlined content; out-of-sandbox targets are never read.

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

async function mainFileId(page: import('@playwright/test').Page, projectId: string, name: string): Promise<string> {
  const tree = await page.request.get(`${API}/projects/${projectId}/files`).then((r) => r.json());
  const node = (tree.children as Array<{ id: string; name: string }>).find((c) => c.name === name);
  if (!node) throw new Error(`file ${name} not found`);
  return node.id;
}

test.describe('preview include assembly', () => {
  test.beforeAll(async () => {
    await ensureTestUser();
  });

  let projectId: string;

  test.beforeEach(async ({ page }) => {
    await signIn(page);
    projectId = await createProject(page, `Preview Includes ${Date.now()}`);
  });

  test.afterEach(async ({ page }) => {
    if (projectId) await cleanupProject(page, projectId);
  });

  test('inlines an in-sandbox include into the rendered preview', async ({ page }) => {
    await createAdocFile(page, projectId, 'main.adoc', '= Book\n\ninclude::chapter.adoc[]\n');
    await createAdocFile(page, projectId, 'chapter.adoc', '== Chapter\n\nAssembled body text.\n');
    await setMainFile(page, projectId, await mainFileId(page, projectId, 'main.adoc'));

    await openProject(page, projectId);
    await openFile(page, 'main.adoc');
    await expandPreview(page);
    await page.getByTestId('show-includes-toggle').click();

    const output = page.getByTestId('asciidoc-output');
    // The included file's content is inlined (assembly ran)…
    await expect(output).toContainText('Assembled body text.', { timeout: 15_000 });
    // …and the literal include directive is gone.
    await expect(output).not.toContainText('include::chapter.adoc');
  });

  test('a parent-traversal include is rejected (never read) and marked unresolved', async ({ page }) => {
    await createAdocFile(page, projectId, 'main.adoc', '= Book\n\ninclude::../secret.adoc[]\n');
    await setMainFile(page, projectId, await mainFileId(page, projectId, 'main.adoc'));

    await openProject(page, projectId);
    await openFile(page, 'main.adoc');
    await expandPreview(page);
    await page.getByTestId('show-includes-toggle').click();

    const output = page.getByTestId('asciidoc-output');
    await expect(output).toContainText('Unresolved directive', { timeout: 15_000 });
  });
});
