import { test, expect } from '@playwright/test';
import { ensureTestUser } from './helpers/test-user';
import { signIn, createProject, cleanupProject } from './helpers/test-project';
import { createAdocFile, setMainFile, openProject, openFile, expandPreview } from './helpers/editor';

// Edge case "main/root file change": when the project's designated main file changes, every
// open document's inherited context — anchored at the main file — must re-resolve with no reload.
// Client B changes the project main file; A's open child re-resolves its inherited attribute against
// the new anchor. Requires apps/api running (the SSE + main-file path).

test.describe('Collab consistency — main-file change re-resolves open documents', () => {
  test.beforeAll(async () => {
    await ensureTestUser();
  });

  let projectId: string;

  test.afterEach(async ({ page }) => {
    if (projectId) await cleanupProject(page, projectId);
  });

  test('B changes the project main file → A re-resolves the inherited attribute to the new anchor', async ({ page, browser }) => {
    await signIn(page);
    projectId = await createProject(page, `Collab Consistency Main File ${Date.now()}`);

    // Two candidate parents include the same child but define productName differently.
    const mainId = await createAdocFile(page, projectId, 'main.adoc', ':productName: Acme\n\ninclude::child.adoc[]\n');
    await createAdocFile(page, projectId, 'alt.adoc', ':productName: Zeta\n\ninclude::child.adoc[]\n');
    await createAdocFile(page, projectId, 'child.adoc', '= Child\n\nProduct is {productName}.\n');
    await setMainFile(page, projectId, mainId);

    // Client A opens the child; anchored at main.adoc it inherits productName=Acme.
    await openProject(page, projectId);
    await openFile(page, 'child.adoc', /Product is/);
    await expandPreview(page);
    const previewA = page.getByTestId('asciidoc-output');
    await expect(previewA).toContainText('Product is Acme.', { timeout: 15_000 });

    // Client B (a second member) changes the project main file to alt.adoc.
    const altId = await fileNodeIdByName(page, projectId, 'alt.adoc');
    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    try {
      await signIn(pageB);
      await setMainFile(pageB, projectId, altId);

      // A's open child re-resolves against the new anchor with no reload or structural file event.
      await expect(previewA).toContainText('Product is Zeta.', { timeout: 20_000 });
    } finally {
      await contextB.close();
    }
  });
});

/** Resolve a root-level file node id by name via the project files endpoint. */
async function fileNodeIdByName(page: import('@playwright/test').Page, projectId: string, name: string): Promise<string> {
  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
  const tree = await page.request.get(`${apiBase}/projects/${projectId}/files`).then((response) => response.json());
  const node = (tree.children as Array<{ id: string; name: string }>).find((child) => child.name === name);
  if (!node) throw new Error(`file node ${name} not found`);
  return node.id;
}
