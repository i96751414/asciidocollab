import { test, expect, type Page } from '@playwright/test';
import { ensureTestUser, createInvitedUser } from './helpers/test-user';
import { signIn, createProject, cleanupProject, createTestFile } from './helpers/test-project';

// US1 / FR-005, SC-002: a late joiner receives the full current document state
// from Yjs sync (no manual reload) within ~2s. Requires apps/api AND apps/collab.

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

async function createEditorInProject(page: Page, projectId: string): Promise<{ email: string; password: string }> {
  const email = `late-editor-${Date.now()}@example.com`;
  const password = 'EditorP@ssw0rd123!';
  await createInvitedUser(page, email, password, 'Late Editor');
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

test.describe('Late join sees full state (US1)', () => {
  test.beforeAll(async () => {
    await ensureTestUser();
  });

  let projectId: string;
  let editorCredentials: { email: string; password: string };

  test.beforeEach(async ({ page }) => {
    await signIn(page);
    projectId = await createProject(page, `Collab Late Join ${Date.now()}`);
    editorCredentials = await createEditorInProject(page, projectId);
  });

  test.afterEach(async ({ page }) => {
    if (projectId) await cleanupProject(page, projectId);
  });

  test('a user opening the file after edits sees the full content < 2s without manual sync', async ({ page, browser }) => {
    const fileName = 'late.adoc';
    await createTestFile(page, projectId, null, fileName);

    // A edits the document.
    await openFileInEditor(page, projectId, fileName);
    const contentA = page.locator('.cm-editor .cm-content');
    await contentA.click();
    await page.keyboard.type('= Late Join Title\n\nBody written before B joins.');
    // Give the edit a moment to broadcast/persist into the room state.
    await page.waitForTimeout(1000);

    // B joins later and must see the full content quickly via sync.
    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    try {
      await signIn(pageB, editorCredentials.email, editorCredentials.password);
      await openFileInEditor(pageB, projectId, fileName);

      await expect(
        pageB.locator('.cm-editor .cm-content'),
        'Late joiner must see the full document via sync (no manual reload)',
      ).toContainText('Body written before B joins.', { timeout: 2000 });
    } finally {
      await contextB.close();
    }
  });
});
