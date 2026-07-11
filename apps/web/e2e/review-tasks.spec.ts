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

// Feature 038 / US2 (T036): convert a comment to a task, assign it to the second collaborator, set it
// In progress, then verify — as that user — the task surfaces under the project-wide "assigned to me"
// query and can be resolved.
//
// NOTE: the wired task surface today is the in-document CommentRail (its ReviewTaskControls +
// Tasks filter). The standalone project-wide TaskPanel component (data-testid="task-panel") exists
// but is not yet mounted into the editor shell, so the "assigned to me" projection it renders is
// asserted here at the API boundary it consumes (listProjectReviewItems with assigneeId), while the
// convert/assign/status/resolve interactions are driven entirely through the real rail UI.

const PASSAGE = 'TASKME actionable passage';
const ASSIGNEE_NAME = 'Review editor';

test.describe('Review tasks — convert, assign, status, assigned-to-me', () => {
  test.beforeAll(async () => {
    await ensureTestUser();
  });

  let projectId: string;
  let editor: MemberCredentials;

  test.beforeEach(async ({ page }) => {
    await signIn(page);
    projectId = await createProject(page, `Review Tasks ${Date.now()}`);
    editor = await addMemberToProject(page, projectId, 'editor');
  });

  test.afterEach(async ({ page }) => {
    if (projectId) await cleanupProject(page, projectId);
  });

  test('convert → assign → In progress → assignee resolves it', async ({ page, browser }) => {
    const fileName = 'tasks.adoc';
    await createTestFile(page, projectId, null, fileName);

    // A (owner) seeds a passage and comments on it, then converts that comment into a task.
    await openFileInEditor(page, projectId, fileName);
    await typeInEditor(page, `Header\n${PASSAGE}\nFooter`);
    await commentOnPassage(page, PASSAGE, 'Rework this section.');

    const railA = page.getByTestId('comment-rail');
    const cardA = railA.getByTestId('review-thread-card').first();
    await expect(cardA).toBeVisible({ timeout: 10_000 });

    // Convert to task.
    await cardA.getByTestId('task-controls-convert').click();
    await expect(cardA.getByTestId('task-controls')).toBeVisible({ timeout: 10_000 });

    // Assign to the second editor.
    await cardA.getByTestId('task-controls-assignee').click();
    await page.getByRole('menuitem', { name: ASSIGNEE_NAME }).click();
    await expect(cardA.getByTestId('task-controls-assignee')).toContainText(ASSIGNEE_NAME, { timeout: 10_000 });

    // Set status In progress.
    await cardA.getByTestId('task-controls-status').click();
    await page.getByRole('menuitem', { name: 'In progress' }).click();
    await expect(cardA).toContainText('In progress', { timeout: 10_000 });

    // The project-wide list now reports the task as an In-progress task with the expected assignee.
    const listResp = await page.request.get(`${API_URL}/projects/${projectId}/review-items?status=in_progress`);
    expect(listResp.ok()).toBeTruthy();
    const listBody = await listResp.json();
    const items = listBody.data.items as Array<{ id: string; status: string; assignee: { id: string } | null }>;
    const task = items.find((item) => item.status === 'in_progress');
    expect(task, 'the converted task should appear in the project task list').toBeTruthy();
    const assigneeId = task!.assignee?.id;
    expect(assigneeId, 'the task should carry an assignee').toBeTruthy();

    // ── Second editor: the task is "assigned to me" (the projection TaskPanel would render) ─────
    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    try {
      await signIn(pageB, editor.email, editor.password);

      const mineResp = await pageB.request.get(
        `${API_URL}/projects/${projectId}/review-items?assigneeId=${assigneeId}&status=in_progress`,
      );
      expect(mineResp.ok()).toBeTruthy();
      const mineBody = await mineResp.json();
      const mine = mineBody.data.items as Array<{ id: string }>;
      expect(mine.some((item) => item.id === task!.id), 'the task is assigned to the second editor').toBeTruthy();

      // The assignee opens the document, switches the rail to Tasks, sees the task and resolves it.
      await openFileInEditor(pageB, projectId, fileName);
      await ensureCommentsPanelOpen(pageB);
      const railB = pageB.getByTestId('comment-rail');
      await railB.getByRole('tab', { name: 'Tasks' }).click();

      const cardB = railB.getByTestId('review-thread-card').first();
      await expect(cardB).toContainText('Rework this section.', { timeout: 15_000 });
      await expect(cardB).toContainText('In progress', { timeout: 10_000 });

      await cardB.getByTestId('task-controls-status').click();
      await pageB.getByRole('menuitem', { name: 'Resolved' }).click();
      await expect(cardB).toContainText('Resolved', { timeout: 10_000 });
    } finally {
      await contextB.close();
    }
  });
});
