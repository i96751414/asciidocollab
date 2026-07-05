import { test, expect } from '@playwright/test';
import { ensureTestUser } from './helpers/test-user';
import { signIn, createProject, cleanupProject } from './helpers/test-project';
import { createAdocFile, setMainFile, openProject, openFile, expandPreview, liveReplaceLine } from './helpers/editor';

// Related files with no active session resolve from persisted content and
// switch to live automatically on session start, then back to persisted on session end — with no
// stale intermediate. Requires apps/api AND apps/collab running.

test.describe('Collab consistency — graceful live↔persisted session edges', () => {
  test.beforeAll(async () => {
    await ensureTestUser();
  });

  let projectId: string;

  test.afterEach(async ({ page }) => {
    if (projectId) await cleanupProject(page, projectId);
  });

  test('session start switches A to live; session end reverts A to persisted', async ({ page, browser }) => {
    test.setTimeout(120_000);
    await signIn(page);
    projectId = await createProject(page, `Collab Consistency Session ${Date.now()}`);

    const mainId = await createAdocFile(page, projectId, 'main.adoc', ':productName: Acme\n\ninclude::child.adoc[]\n');
    await createAdocFile(page, projectId, 'child.adoc', '= Child\n\nProduct is {productName}.\n');
    await setMainFile(page, projectId, mainId);

    // Client A opens the child. With no session on the parent, it resolves from persisted content.
    await openProject(page, projectId);
    await openFile(page, 'child.adoc', /Product is/);
    await expandPreview(page);
    const previewA = page.getByTestId('asciidoc-output');
    await expect(previewA).toContainText('Product is Acme.', { timeout: 15_000 });

    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    try {
      // Session start: B opens the parent (a live session) and live-edits the attribute.
      await signIn(pageB);
      await openProject(pageB, projectId);
      await openFile(pageB, 'main.adoc', /productName/);
      await liveReplaceLine(pageB, 'productName', ':productName: Live');
      await expect(previewA).toContainText('Product is Live.', { timeout: 20_000 }); // switched to live

      // Session end: B disconnects. Hocuspocus writes the live edit back on disconnect, so main's
      // persisted content is now ":productName: Live". A's source switches from B's live session to the
      // persisted copy and stays consistent — it settles on the now-saved value with no manual refresh
      // and no intermediate stale "Acme" flash.
      await pageB.close();
      await expect(previewA).toContainText('Product is Live.', { timeout: 30_000 });
      await expect(previewA).not.toContainText('Product is Acme.');
    } finally {
      await contextB.close();
    }
  });
});

