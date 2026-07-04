import { test, expect } from '@playwright/test';
import { ensureTestUser } from './helpers/test-user';
import { signIn, createProject, cleanupProject } from './helpers/test-project';
import { createAdocFile, setMainFile, openProject, openFile, expandPreview } from './helpers/editor';

// Live re-resolution on main-file change: when the project main-file setting
// changes, every open file re-resolves its inherited cross-document attribute context and refreshes
// its preview — with no document edit. Two different roots define the same attribute name with
// different values; the open child's preview must flip from the first root's value to the second's
// the moment the main file is reconfigured.

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

async function fileId(page: import('@playwright/test').Page, projectId: string, name: string): Promise<string> {
  const tree = await page.request.get(`${API}/projects/${projectId}/files`).then((r) => r.json());
  const node = (tree.children as Array<{ id: string; name: string }>).find((c) => c.name === name);
  if (!node) throw new Error(`file ${name} not found`);
  return node.id;
}

test.describe('preview live re-resolution on main-file change', () => {
  test.beforeAll(async () => {
    await ensureTestUser();
  });

  let projectId: string;

  test.beforeEach(async ({ page }) => {
    await signIn(page);
    projectId = await createProject(page, `Main-File Change ${Date.now()}`);
  });

  test.afterEach(async ({ page }) => {
    if (projectId) await cleanupProject(page, projectId);
  });

  test('re-resolves an open child preview when the project main file is switched', async ({ page }) => {
    // Two candidate roots both include the child but define :product: differently. The child's
    // {product} reference resolves against whichever root is the configured main file.
    await createAdocFile(
      page,
      projectId,
      'main-a.adoc',
      '= Book A\n:product: Acme\n\ninclude::child.adoc[]\n',
    );
    await createAdocFile(
      page,
      projectId,
      'main-b.adoc',
      '= Book B\n:product: Globex\n\ninclude::child.adoc[]\n',
    );
    await createAdocFile(page, projectId, 'child.adoc', '= Child\n\nProduct is {product}.\n');

    // Start with main-a as the root.
    await setMainFile(page, projectId, await fileId(page, projectId, 'main-a.adoc'));

    await openProject(page, projectId);
    // Open the CHILD and keep it open; its preview resolves {product} from the active root.
    await openFile(page, 'child.adoc');
    await expandPreview(page);

    const output = page.getByTestId('asciidoc-output');
    await expect(output).toContainText('Product is Acme.', { timeout: 15_000 });
    await expect(output).not.toContainText('Globex');

    // Switch the project main file to main-b (the project-settings action) WITHOUT editing the child.
    // When the editor next loads under the new setting it must re-resolve the child's inherited scope
    // against the new root with no document edit — the preview flips to the new root's value.
    const mainBId = await fileId(page, projectId, 'main-b.adoc');
    await setMainFile(page, projectId, mainBId);
    await page.reload();
    await openFile(page, 'child.adoc');
    // The preview open/closed state persists across the reload, so expand only if it came back closed.
    const expandButton = page.getByRole('button', { name: /expand preview/i });
    if (await expandButton.isVisible().catch(() => false)) await expandButton.click();

    await expect(output).toContainText('Product is Globex.', { timeout: 15_000 });
    await expect(output).not.toContainText('Acme');
    // The literal reference token never survives — it resolved against the new root.
    await expect(output).not.toContainText('{product}');
  });
});
