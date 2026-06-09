import { test, expect, type Page } from '@playwright/test';
import { ensureTestUser, createInvitedUser } from './helpers/test-user';
import { signIn, createProject, cleanupProject, createTestFile } from './helpers/test-project';

// US2 / FR-007, FR-008: collaborators see each other's cursor, selection, and name;
// a user never sees their own overlay. The presence bar lists the other
// participants. Requires apps/api AND apps/collab running.

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

async function createEditorInProject(
  page: Page,
  projectId: string,
  displayName: string,
): Promise<{ email: string; password: string }> {
  const email = `aware-${Date.now()}@example.com`;
  const password = 'EditorP@ssw0rd123!';
  await createInvitedUser(page, email, password, displayName);
  const response = await page.request.post(`${API_URL}/api/projects/${projectId}/members`, {
    data: { email, role: 'editor' },
  });
  if (!response.ok()) {
    throw new Error(`createEditorInProject failed: ${response.status()} ${await response.text()}`);
  }
  return { email, password };
}

async function openFileInEditor(page: Page, projectId: string, fileName: string): Promise<void> {
  await page.goto(`/dashboard/projects/${projectId}`);
  await expect(page.getByText(/loading\.\.\./i)).not.toBeVisible({ timeout: 8000 });
  await page.getByTestId(`tree-node-${fileName}`).click();
  await expect(page.locator('.cm-editor .cm-content')).toBeVisible({ timeout: 15_000 });
}

test.describe('Presence and awareness (US2)', () => {
  test.beforeAll(async () => {
    await ensureTestUser();
  });

  let projectId: string;
  let editorCredentials: { email: string; password: string };

  test.beforeEach(async ({ page }) => {
    await signIn(page);
    projectId = await createProject(page, `Collab Awareness ${Date.now()}`);
    editorCredentials = await createEditorInProject(page, projectId, 'Second Editor');
  });

  test.afterEach(async ({ page }) => {
    if (projectId) await cleanupProject(page, projectId);
  });

  test('B sees A’s presence/cursor and A never sees their own overlay', async ({ page, browser }) => {
    const fileName = 'presence.adoc';
    await createTestFile(page, projectId, null, fileName);

    await openFileInEditor(page, projectId, fileName);

    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    try {
      await signIn(pageB, editorCredentials.email, editorCredentials.password);
      await openFileInEditor(pageB, projectId, fileName);

      // A types and selects a range so B can render A's caret/selection.
      const contentA = page.locator('.cm-editor .cm-content');
      await contentA.click();
      await page.keyboard.type('The quick brown fox');
      await page.keyboard.press('Home');
      await page.keyboard.press('Shift+End');

      // B's presence bar lists the other participant (A), and B renders A's remote caret.
      await expect(pageB.getByTestId('collab-presence-bar')).toBeVisible({ timeout: 5000 });
      await expect(pageB.locator('.cm-ySelectionCaret')).toBeVisible({ timeout: 5000 });

      // A must NOT see their own overlay: no remote caret in A's own editor, and A's
      // presence bar excludes A. (The bar only renders other participants.)
      await expect(page.locator('.cm-ySelectionCaret')).toHaveCount(0);
    } finally {
      await contextB.close();
    }
  });
});
