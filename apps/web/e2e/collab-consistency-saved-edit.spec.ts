import { test, expect } from '@playwright/test';
import { ensureTestUser } from './helpers/test-user';
import { signIn, createProject, cleanupProject } from './helpers/test-project';
import { createAdocFile, setMainFile, openProject, openFile, expandPreview, writeFileContent } from './helpers/editor';

// US6 / SC-010 (FR-017): a collaborator's plain content SAVE to a related file (no live session)
// propagates to open dependents best-effort — no reconnect, no structural event, no manual refresh.
// Client B here saves via REST (the sessionless write path), which emits content-changed on the bus.
// Requires apps/api running (the SSE + save path); no collab session is involved.

test.describe('Collab consistency — a saved edit to a related file refreshes the open document', () => {
  test.beforeAll(async () => {
    await ensureTestUser();
  });

  let projectId: string;

  test.afterEach(async ({ page }) => {
    if (projectId) await cleanupProject(page, projectId);
  });

  test('B saves a related file (no live session) → A refreshes to the saved content', async ({ page }) => {
    await signIn(page);
    projectId = await createProject(page, `Collab Consistency Saved ${Date.now()}`);

    const mainId = await createAdocFile(
      page,
      projectId,
      'main.adoc',
      ':productName: Acme\n\ninclude::child.adoc[]\n',
    );
    await createAdocFile(page, projectId, 'child.adoc', '= Child\n\nProduct is {productName}.\n');
    await setMainFile(page, projectId, mainId);

    // Client A opens the child and shows its preview: inherits productName=Acme from the main file.
    await openProject(page, projectId);
    await openFile(page, 'child.adoc', /Product is/);
    await expandPreview(page);
    const previewA = page.getByTestId('asciidoc-output');
    await expect(previewA).toContainText('Product is Acme.', { timeout: 15_000 });

    // A collaborator saves an edit to the parent via the REST content endpoint (no live session).
    await writeFileContent(page, projectId, mainId, ':productName: Globex\n\ninclude::child.adoc[]\n');

    // A refreshes to the saved value with no reconnect, structural event, or manual refresh.
    await expect(previewA).toContainText('Product is Globex.', { timeout: 20_000 });
  });
});
