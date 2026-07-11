import { expect, type Page } from '@playwright/test';
import { createInvitedUser } from './test-user';

/**
 * Shared harness for the feature 038 review-comments E2E specs. Mirrors the two-collaborator
 * pattern from collab-editing.spec.ts (a second editor added via the members API, a second browser
 * context signed in as that user) and adds the small building blocks the review flows need: opening
 * a collaborative document, selecting a passage, and turning a selection into a comment.
 *
 * Every UI target is a `data-testid` on a review component so the specs stay decoupled from copy.
 */

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/** Login credentials for a secondary user created for the two-session flows. */
export interface MemberCredentials {
  email: string;
  password: string;
}

/**
 * Creates a fresh invited user and adds them to `projectId` with the given role via the members API,
 * reusing the owner session already present on `page`. Returns the new user's login credentials.
 */
export async function addMemberToProject(
  page: Page,
  projectId: string,
  role: 'editor' | 'viewer',
): Promise<MemberCredentials> {
  const email = `${role}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
  const password = 'MemberP@ssw0rd123!';
  await createInvitedUser(page, email, password, `Review ${role}`);
  const response = await page.request.post(`${API_URL}/api/projects/${projectId}/members`, {
    data: { email, role },
  });
  if (!response.ok()) {
    throw new Error(`addMemberToProject(${role}) failed: ${response.status()} ${await response.text()}`);
  }
  return { email, password };
}

/**
 * Opens a project document in the collaborative editor and waits until the CodeMirror content is
 * mounted (synced). Gates readiness on the `.cm-editor .cm-content` locator, exactly like the
 * collaboration specs.
 */
export async function openFileInEditor(page: Page, projectId: string, fileName: string): Promise<void> {
  await page.goto(`/dashboard/projects/${projectId}`);
  await expect(page.getByText(/loading\.\.\./i)).not.toBeVisible({ timeout: 8000 });
  await page.getByTestId(`tree-node-${fileName}`).click();
  await expect(page.locator('.cm-editor .cm-content')).toBeVisible({ timeout: 15_000 });
}

/** Focuses the editor, jumps to the end, and types `text` (each line on its own row). */
export async function typeInEditor(page: Page, text: string): Promise<void> {
  const content = page.locator('.cm-editor .cm-content');
  await content.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type(text);
}

/**
 * Places the caret on the editor line that renders `passage` and selects that whole line, leaving a
 * non-empty selection so the selected line's gutter "add comment" affordance is revealed.
 */
export async function selectLineWithText(page: Page, passage: string): Promise<void> {
  await page.locator('.cm-editor .cm-content').getByText(passage, { exact: false }).first().click();
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+End');
}

/**
 * Ensures the comments rail is visible, restoring it through the persistent {@link ReviewToggle} when
 * a previous test/preference left the panel collapsed.
 */
export async function ensureCommentsPanelOpen(page: Page): Promise<void> {
  const rail = page.getByTestId('comment-rail');
  if (await rail.isVisible().catch(() => false)) return;
  await expect(page.getByTestId('review-toggle')).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('review-toggle').click();
  await expect(rail).toBeVisible({ timeout: 10_000 });
}

/**
 * Selects `passage`, clicks the gutter "add comment" affordance revealed on the selected line, fills
 * the pinned new-comment composer with `body`, and submits it. Leaves the rail open with the created
 * thread.
 */
export async function commentOnPassage(page: Page, passage: string, body: string): Promise<void> {
  await selectLineWithText(page, passage);
  // Selecting the line marks its gutter cell selected, revealing the "+" without needing a hover.
  const addComment = page.locator('.cm-review-gutter-selected .cm-review-add-comment').first();
  await expect(addComment).toBeVisible({ timeout: 10_000 });
  await addComment.click();
  const composer = page.getByTestId('comment-rail').getByTestId('comment-composer');
  await expect(composer).toBeVisible({ timeout: 10_000 });
  await composer.locator('textarea').fill(body);
  await page.getByTestId('comment-rail').getByTestId('review-composer-submit').click();
}
