import { test, expect } from '@playwright/test';
import { ensureTestUser } from './helpers/test-user';
import { signIn, createProject, cleanupProject } from './helpers/test-project';
import { createAdocFile, setMainFile, openProject, openFile, expandPreview } from './helpers/editor';

// Auto IDs honor idprefix/idseparator: the main file defines
// `:idprefix:` and `:idseparator:` before including a child; the child's auto-generated heading
// IDs use the inherited prefix/separator in the assembled preview. Explicit IDs are preserved.

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

async function fileId(page: import('@playwright/test').Page, projectId: string, name: string): Promise<string> {
  const tree = await page.request.get(`${API}/projects/${projectId}/files`).then((r) => r.json());
  const node = (tree.children as Array<{ id: string; name: string }>).find((c) => c.name === name);
  if (!node) throw new Error(`file ${name} not found`);
  return node.id;
}

test.describe('auto IDs honor idprefix/idseparator across files', () => {
  test.beforeAll(async () => {
    await ensureTestUser();
  });

  let projectId: string;

  test.beforeEach(async ({ page }) => {
    await signIn(page);
    projectId = await createProject(page, `Cross-File AutoID ${Date.now()}`);
  });

  test.afterEach(async ({ page }) => {
    if (projectId) await cleanupProject(page, projectId);
  });

  test('child heading IDs use the inherited idprefix/idseparator; explicit IDs preserved', async ({ page }) => {
    await createAdocFile(
      page,
      projectId,
      'main.adoc',
      '= Book\n:idprefix: sect_\n:idseparator: -\n\ninclude::child.adoc[]\n',
    );
    await createAdocFile(
      page,
      projectId,
      'child.adoc',
      '== My Section\n\nBody.\n\n[#explicit-id]\n== Other Section\n\nMore.\n',
    );
    await setMainFile(page, projectId, await fileId(page, projectId, 'main.adoc'));

    await openProject(page, projectId);
    // Open the MAIN file so the include tree is assembled with the inherited id attributes.
    await openFile(page, 'main.adoc');
    await expandPreview(page);
    await page.getByTestId('show-includes-toggle').click();

    const output = page.getByTestId('asciidoc-output');
    // The first heading's auto-ID uses the configured prefix/separator → `sect_my-section`.
    await expect(output.locator('#sect_my-section')).toHaveCount(1, { timeout: 15_000 });
    await expect(output.locator('#sect_my-section')).toHaveText(/My Section/);
    // An explicit ID is preserved verbatim (not regenerated with the prefix).
    await expect(output.locator('#explicit-id')).toHaveCount(1);
    await expect(output.locator('#sect_other-section')).toHaveCount(0);
  });
});
