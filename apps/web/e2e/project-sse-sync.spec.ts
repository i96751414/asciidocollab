import { test, expect, type BrowserContext, type Browser } from '@playwright/test';
import { ensureTestUser } from './helpers/test-user';
import { signIn, createProject, cleanupProject, createTestFile, deleteTestFileNode } from './helpers/test-project';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Navigates to a project and waits for the file tree to finish loading. */
async function openProjectPage(context: BrowserContext, projectId: string) {
  const page = await context.newPage();
  await page.goto(`/dashboard/projects/${projectId}`);
  await expect(page.getByText(/loading\.\.\./i)).not.toBeVisible({ timeout: 8000 });
  await expect(page.getByText(/failed to load files/i)).not.toBeVisible();
  // Allow SSE connection to fully establish before proceeding
  await page.waitForTimeout(1000);
  return page;
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

test.describe('Real-time SSE sync across tabs and browsers', () => {
  test.beforeAll(async () => {
    await ensureTestUser();
  });

  let projectId: string;

  test.beforeEach(async ({ page }) => {
    await signIn(page);
    projectId = await createProject(page, `SSE Sync E2E ${Date.now()}`);
  });

  test.afterEach(async ({ page }) => {
    if (projectId) await cleanupProject(page, projectId);
  });

  // -------------------------------------------------------------------------
  // Same-browser — two tabs share one SharedWorker and one SSE connection
  // -------------------------------------------------------------------------

  test('file created via API appears in an open tab via SSE (SharedWorker fan-out)', async ({ context }) => {
    const tab = await openProjectPage(context, projectId);
    await expect(tab.getByText(/no files yet/i)).toBeVisible();

    // Create via API — triggers SSE event on the server
    await createTestFile(tab, projectId, null, 'sse-created.adoc');

    // Tab must receive the SSE event and update without reload
    await expect(tab.getByText('sse-created.adoc')).toBeVisible({ timeout: 8000 });
    expect(tab.url()).toContain(projectId);
  });

  test('file deleted via API disappears from an open tab via SSE', async ({ context }) => {
    const tab = await openProjectPage(context, projectId);

    const fileId = await createTestFile(tab, projectId, null, 'to-delete.adoc');
    await expect(tab.getByText('to-delete.adoc')).toBeVisible({ timeout: 8000 });

    // Delete via API — triggers SSE deleted event
    await deleteTestFileNode(tab, projectId, fileId);
    await expect(tab.getByText('to-delete.adoc')).not.toBeVisible({ timeout: 8000 });
  });

  test('file created in one tab appears in another tab in the same browser', async ({ context }) => {
    const tab1 = await openProjectPage(context, projectId);
    const tab2 = await openProjectPage(context, projectId);

    await expect(tab1.getByText(/no files yet/i)).toBeVisible();

    // Tab2 creates via API
    await createTestFile(tab2, projectId, null, 'cross-tab.adoc');

    // Both tabs receive the SSE event through the shared SharedWorker
    await expect(tab1.getByText('cross-tab.adoc')).toBeVisible({ timeout: 8000 });
    await expect(tab2.getByText('cross-tab.adoc')).toBeVisible({ timeout: 8000 });
  });

  // -------------------------------------------------------------------------
  // Cross-browser — separate browser contexts, each has its own SSE connection
  // -------------------------------------------------------------------------

  test('file created in browser-A appears in browser-B via independent SSE connections', async ({ browser }: { browser: Browser }) => {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();

    try {
      const pageA = await contextA.newPage();
      const pageB = await contextB.newPage();

      await signIn(pageA);
      await signIn(pageB);

      const tabA = await openProjectPage(contextA, projectId);
      const tabB = await openProjectPage(contextB, projectId);

      await expect(tabB.getByText(/no files yet/i)).toBeVisible();

      // Browser A creates via API — event broadcast to all SSE subscribers
      await createTestFile(pageA, projectId, null, 'cross-browser.adoc');

      // Browser A and B both receive it
      await expect(tabA.getByText('cross-browser.adoc')).toBeVisible({ timeout: 8000 });
      await expect(tabB.getByText('cross-browser.adoc')).toBeVisible({ timeout: 8000 });
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });

  test('file deleted in browser-A disappears from browser-B via SSE', async ({ browser }: { browser: Browser }) => {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();

    try {
      const pageA = await contextA.newPage();
      const pageB = await contextB.newPage();

      await signIn(pageA);
      await signIn(pageB);

      // Seed a file
      const fileId = await createTestFile(pageA, projectId, null, 'shared-file.adoc');

      const tabA = await openProjectPage(contextA, projectId);
      const tabB = await openProjectPage(contextB, projectId);

      await expect(tabA.getByText('shared-file.adoc')).toBeVisible({ timeout: 8000 });
      await expect(tabB.getByText('shared-file.adoc')).toBeVisible({ timeout: 8000 });

      // Browser A deletes
      await deleteTestFileNode(pageA, projectId, fileId);

      // Both see the deletion
      await expect(tabA.getByText('shared-file.adoc')).not.toBeVisible({ timeout: 8000 });
      await expect(tabB.getByText('shared-file.adoc')).not.toBeVisible({ timeout: 8000 });
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });
});
