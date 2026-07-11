import { test, expect } from '@playwright/test';
import { ensureTestUser } from './helpers/test-user';
import { signIn, createProject, cleanupProject, createTestFile } from './helpers/test-project';
import {
  API_URL,
  addMemberToProject,
  commentOnPassage,
  ensureCommentsPanelOpen,
  openFileInEditor,
  typeInEditor,
  type MemberCredentials,
} from './helpers/review';

// Feature 038 / US5 (T050): deletion.
//  - A single delete removes a thread for BOTH sessions (SSE).
//  - Document bulk-delete clears every item in the document (behind a confirm).
//  - Project-wide delete is owner-only: a plain editor is denied.
//
// NOTE: the project-wide "Delete all across the project" control lives on the standalone TaskPanel
// (ProjectBulkDeleteButton, gated by `isOwner`), which is not yet mounted into the editor shell. Its
// owner-only visibility is therefore asserted at the API authorization boundary it enforces: the
// owner may project-bulk-delete (2xx) while a plain editor is rejected (403).

const PASSAGE_ONE = 'DELETEME first passage';
const PASSAGE_TWO = 'DELETEME second passage';

test.describe('Review deletion — single, document bulk, and owner-only project bulk', () => {
  test.beforeAll(async () => {
    await ensureTestUser();
  });

  let projectId: string;
  let editor: MemberCredentials;

  test.beforeEach(async ({ page }) => {
    await signIn(page);
    projectId = await createProject(page, `Review Delete ${Date.now()}`);
    editor = await addMemberToProject(page, projectId, 'editor');
  });

  test.afterEach(async ({ page }) => {
    if (projectId) await cleanupProject(page, projectId);
  });

  test('single delete syncs, document bulk-delete clears, project bulk-delete is owner-only', async ({ page, browser }) => {
    const fileName = 'delete.adoc';
    await createTestFile(page, projectId, null, fileName);

    // A creates two comments.
    await openFileInEditor(page, projectId, fileName);
    await typeInEditor(page, `Alpha\n${PASSAGE_ONE}\n${PASSAGE_TWO}\nOmega`);
    await commentOnPassage(page, PASSAGE_ONE, 'First comment.');
    await commentOnPassage(page, PASSAGE_TWO, 'Second comment.');

    const railA = page.getByTestId('comment-rail');
    await expect(railA.getByTestId('review-thread-card')).toHaveCount(2, { timeout: 10_000 });

    // Capture the document id now (items carry it) so the owner can re-create an item after the
    // document is emptied, for the project-wide authorization check below.
    const listResp = await page.request.get(`${API_URL}/projects/${projectId}/review-items`);
    expect(listResp.ok()).toBeTruthy();
    const listBody = await listResp.json();
    const items = listBody.data.items as Array<{ documentId: string }>;
    expect(items.length).toBe(2);
    const documentId = items[0].documentId;

    // B (second editor) opens the doc and sees both threads.
    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    try {
      await signIn(pageB, editor.email, editor.password);
      await openFileInEditor(pageB, projectId, fileName);
      await ensureCommentsPanelOpen(pageB);
      const railB = pageB.getByTestId('comment-rail');
      await expect(railB).toContainText('First comment.', { timeout: 15_000 });
      await expect(railB).toContainText('Second comment.', { timeout: 15_000 });

      // ── A deletes the first thread; it disappears for BOTH sessions over SSE ──────────────────
      const firstCard = railA.getByTestId('review-thread-card').filter({ hasText: 'First comment.' });
      await firstCard.getByRole('button', { name: 'Thread actions' }).click();
      await page.getByTestId('delete-item').click();
      await page.getByTestId('delete-item-confirm').click();

      await expect(railA).not.toContainText('First comment.', { timeout: 15_000 });
      await expect(railA).toContainText('Second comment.');
      await expect(railB).not.toContainText('First comment.', { timeout: 15_000 });

      // ── A clears the whole document via the rail's document-scope bulk delete ─────────────────
      await railA.getByRole('button', { name: 'Comment options' }).click();
      await page.getByTestId('bulk-delete-document').click();
      await page.getByTestId('bulk-delete-document-confirm').click();

      await expect(railA.getByTestId('review-thread-card')).toHaveCount(0, { timeout: 15_000 });
      await expect(railB.getByTestId('review-thread-card')).toHaveCount(0, { timeout: 15_000 });

      // ── Project-wide delete is owner-only (asserted at the authorization boundary) ────────────
      // Re-create a single item so both the denied and allowed calls have something to guard.
      const created = await page.request.post(
        `${API_URL}/projects/${projectId}/documents/${documentId}/review-items`,
        { data: { kind: 'comment', body: 'Owner re-created.', anchor: { quote: { exact: PASSAGE_TWO } } } },
      );
      expect(created.ok(), `re-create failed: ${created.status()} ${await created.text()}`).toBeTruthy();

      // A plain editor may NOT delete across the whole project.
      const editorAttempt = await pageB.request.post(
        `${API_URL}/projects/${projectId}/review-items/bulk-delete`,
        { data: { confirm: true, expectedCount: 1 } },
      );
      expect(editorAttempt.status(), 'a plain editor has no project-wide delete').toBe(403);

      // The owner does — the control the TaskPanel would render is backed by this allowed call.
      const ownerAttempt = await page.request.post(
        `${API_URL}/projects/${projectId}/review-items/bulk-delete`,
        { data: { confirm: true, expectedCount: 1 } },
      );
      expect(ownerAttempt.ok(), `owner project bulk-delete should be allowed: ${ownerAttempt.status()}`).toBeTruthy();
    } finally {
      await contextB.close();
    }
  });
});
