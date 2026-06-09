import { test, expect, type Page } from '@playwright/test';
import { ensureTestUser, createInvitedUser } from './helpers/test-user';
import { signIn, createProject, cleanupProject, createTestFile } from './helpers/test-project';

// US1 / FR-003, SC-001, SC-003: two editors on the same file see each other's
// edits in real time and converge to identical text. Requires apps/api AND
// apps/collab running (the collaboration WebSocket); both are started via pnpm
// in the CI e2e job (T068).

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

async function createEditorInProject(page: Page, projectId: string): Promise<{ email: string; password: string }> {
  const email = `editor-${Date.now()}@example.com`;
  const password = 'EditorP@ssw0rd123!';
  await createInvitedUser(page, email, password, 'Second Editor');
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
  // Collab editor is ready once the CodeMirror content is mounted (synced).
  await expect(page.locator('.cm-editor .cm-content')).toBeVisible({ timeout: 15_000 });
}

test.describe('Real-time co-editing (US1)', () => {
  test.beforeAll(async () => {
    await ensureTestUser();
  });

  let projectId: string;
  let editorCredentials: { email: string; password: string };

  test.beforeEach(async ({ page }) => {
    await signIn(page);
    projectId = await createProject(page, `Collab Editing ${Date.now()}`);
    editorCredentials = await createEditorInProject(page, projectId);
  });

  test.afterEach(async ({ page }) => {
    if (projectId) await cleanupProject(page, projectId);
  });

  test('an edit by A appears in B within ~1s and concurrent edits converge', async ({ page, browser }) => {
    const fileName = 'shared.adoc';
    await createTestFile(page, projectId, null, fileName);

    // A (owner/editor) opens the file.
    await openFileInEditor(page, projectId, fileName);

    // B (second editor) opens the same file in a separate context.
    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    try {
      await signIn(pageB, editorCredentials.email, editorCredentials.password);
      await openFileInEditor(pageB, projectId, fileName);

      // A types — B must see it within ~1s (SC-001).
      const contentA = page.locator('.cm-editor .cm-content');
      await contentA.click();
      await page.keyboard.type('Hello from A');

      await expect(
        pageB.locator('.cm-editor .cm-content'),
        'B must see A’s edit within ~1s',
      ).toContainText('Hello from A', { timeout: 2000 });

      // Concurrent edits from both converge (SC-003): each types on its own line.
      await contentA.click();
      await page.keyboard.press('Control+End');
      await page.keyboard.type('\nline from A');

      const contentB = pageB.locator('.cm-editor .cm-content');
      await contentB.click();
      await pageB.keyboard.press('Control+End');
      await pageB.keyboard.type('\nline from B');

      // Both editors converge to the same content — each contains both edits.
      // (We assert content rather than raw textContent equality because
      // y-codemirror injects each peer's remote-cursor name label into the DOM,
      // so the two editors' textContent legitimately differ by that label.)
      for (const content of [contentA, contentB]) {
        await expect(content).toContainText('line from A', { timeout: 5000 });
        await expect(content).toContainText('line from B', { timeout: 5000 });
      }
    } finally {
      await contextB.close();
    }
  });
});
