import { test, expect } from '@playwright/test';
import { ensureTestUser } from './helpers/test-user';
import {
  signIn,
  createProject,
  cleanupProject,
  createTestFile,
  createViewerInProject,
  type ViewerCredentials,
} from './helpers/test-project';
import { API_URL, commentOnPassage, ensureCommentsPanelOpen, openFileInEditor, typeInEditor } from './helpers/review';

// Feature 038 / US4 (T044): a project VIEWER connects as an observer — they SEE existing review items
// in the rail but get no create/reply/resolve/react/delete controls, and any direct write to the
// review API is rejected with 403.

const PASSAGE = 'VIEWME read-only passage';

test.describe('Review permissions — viewer is read-only', () => {
  test.beforeAll(async () => {
    await ensureTestUser();
  });

  let projectId: string;
  let viewer: ViewerCredentials;

  test.beforeEach(async ({ page }) => {
    await signIn(page);
    projectId = await createProject(page, `Review Permissions ${Date.now()}`);
    viewer = await createViewerInProject(page, projectId);
  });

  test.afterEach(async ({ page }) => {
    if (projectId) await cleanupProject(page, projectId);
  });

  test('viewer sees items, has no mutation controls, and is 403 on writes', async ({ page, browser }) => {
    const fileName = 'permissions.adoc';
    await createTestFile(page, projectId, null, fileName);

    // Owner seeds a passage and creates a comment the viewer will later see.
    await openFileInEditor(page, projectId, fileName);
    await typeInEditor(page, `Intro\n${PASSAGE}\nOutro`);
    await commentOnPassage(page, PASSAGE, 'Owner-authored comment.');
    await expect(page.getByTestId('comment-rail').getByTestId('review-thread-card')).toBeVisible({ timeout: 10_000 });

    // Read back the created item + its document id for the direct-write probes.
    const listResp = await page.request.get(`${API_URL}/projects/${projectId}/review-items`);
    expect(listResp.ok()).toBeTruthy();
    const listBody = await listResp.json();
    const items = listBody.data.items as Array<{ id: string; documentId: string }>;
    expect(items.length).toBeGreaterThan(0);
    const { id: itemId, documentId } = items[0];

    // ── Viewer session ─────────────────────────────────────────────────────────────────────────
    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    try {
      await signIn(pageB, viewer.email, viewer.password);
      await openFileInEditor(pageB, projectId, fileName);
      await ensureCommentsPanelOpen(pageB);

      const railB = pageB.getByTestId('comment-rail');
      await expect(railB).toContainText('Owner-authored comment.', { timeout: 15_000 });
      const cardB = railB.getByTestId('review-thread-card').first();
      await expect(cardB).toBeVisible();

      // No mutation affordances anywhere in the read-only rail.
      await expect(railB.getByTestId('review-reply')).toHaveCount(0);
      await expect(railB.getByTestId('review-resolve')).toHaveCount(0);
      await expect(railB.getByTestId('review-composer-submit')).toHaveCount(0);
      await expect(railB.getByTestId('review-add-reaction')).toHaveCount(0);
      await expect(railB.getByTestId('task-controls-convert')).toHaveCount(0);
      await expect(cardB.getByRole('button', { name: 'Thread actions' })).toHaveCount(0);

      // ── Direct API writes are rejected with 403 ────────────────────────────────────────────────
      const resolveResp = await pageB.request.post(`${API_URL}/projects/${projectId}/review-items/${itemId}/resolve`);
      expect(resolveResp.status(), 'viewer resolve must be forbidden').toBe(403);

      const replyResp = await pageB.request.post(
        `${API_URL}/projects/${projectId}/review-items/${itemId}/replies`,
        { data: { body: 'sneaky reply' } },
      );
      expect(replyResp.status(), 'viewer reply must be forbidden').toBe(403);

      const createResp = await pageB.request.post(
        `${API_URL}/projects/${projectId}/documents/${documentId}/review-items`,
        { data: { kind: 'comment', body: 'sneaky comment', anchor: { quote: { exact: PASSAGE } } } },
      );
      expect(createResp.status(), 'viewer create must be forbidden').toBe(403);

      const deleteResp = await pageB.request.delete(`${API_URL}/projects/${projectId}/review-items/${itemId}`);
      expect(deleteResp.status(), 'viewer delete must be forbidden').toBe(403);
    } finally {
      await contextB.close();
    }
  });
});
