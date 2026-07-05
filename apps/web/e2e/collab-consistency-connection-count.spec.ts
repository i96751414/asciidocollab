import { test, expect } from '@playwright/test';
import { ensureTestUser } from './helpers/test-user';
import { signIn, createProject, cleanupProject } from './helpers/test-project';
import { createAdocFile, setMainFile, openProject, openFile, editorContent } from './helpers/editor';

// SC-007 (FR-024): with the observer subsystem removed, a client reaching MANY related files holds no
// per-related-file collaborative sockets — only its own open document's room (and presence). The
// number of collaborative WebSockets must NOT scale with the number of related files. The project SSE
// is a single shared EventSource (not a WebSocket), so it is not counted here. Requires apps/api +
// apps/collab running.

test.describe('Collab consistency — connection count does not scale with related files', () => {
  test.beforeAll(async () => {
    await ensureTestUser();
  });

  let projectId: string;

  test.afterEach(async ({ page }) => {
    if (projectId) await cleanupProject(page, projectId);
  });

  test('opening a document reaching many related files holds no per-file observer sockets', async ({ page }) => {
    test.setTimeout(90_000);
    await signIn(page);
    projectId = await createProject(page, `Collab Consistency Conn ${Date.now()}`);

    // A main file that includes several children — a broad reachable set for the open document.
    const mainId = await createAdocFile(
      page,
      projectId,
      'main.adoc',
      ':productName: Acme\n\ninclude::c1.adoc[]\ninclude::c2.adoc[]\ninclude::c3.adoc[]\ninclude::c4.adoc[]\n',
    );
    for (const name of ['c1', 'c2', 'c3', 'c4']) {
      await createAdocFile(page, projectId, `${name}.adoc`, `= ${name}\n\nProduct is {productName}.\n`);
    }
    await setMainFile(page, projectId, mainId);

    // Count collaborative WebSocket connections opened after the document is open (the only WS in the
    // app is the Hocuspocus collaboration socket; the SSE stream is an EventSource, not counted).
    const collabSockets = new Set<string>();
    page.on('websocket', (ws) => collabSockets.add(ws.url()));

    await openProject(page, projectId);
    await openFile(page, 'c1.adoc', /Product is/);
    // Let any (previously per-file) sockets have a chance to open before asserting.
    await expect(editorContent(page)).toHaveAttribute('contenteditable', 'true', { timeout: 15_000 });
    await page.waitForTimeout(3000);

    // The open file's own room + presence is a small constant; there must be NO extra socket per
    // related file (before feature 036 this would have been ~4 observer sockets for c2..c4 + main).
    expect(collabSockets.size).toBeLessThanOrEqual(3);
  });
});
