import { test, expect, type Page } from '@playwright/test';
import { ensureTestUser, createInvitedUser } from './helpers/test-user';
import { signIn, createProject, cleanupProject, createTestFile } from './helpers/test-project';

// Per-user undo. With interleaved edits from A and B,
// A's undo reverts only A's own edits — never B's — and redo restores them; all
// clients converge. Requires apps/api AND apps/collab running.

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const UNDO = process.platform === 'darwin' ? 'Meta+z' : 'Control+z';
const REDO = process.platform === 'darwin' ? 'Meta+Shift+z' : 'Control+y';

async function createEditorInProject(page: Page, projectId: string): Promise<{ email: string; password: string }> {
  const email = `undo-${Date.now()}@example.com`;
  const password = 'EditorP@ssw0rd123!';
  await createInvitedUser(page, email, password, 'Undo Editor');
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

test.describe('Collaborative per-user undo', () => {
  test.beforeAll(async () => {
    await ensureTestUser();
  });

  let projectId: string;
  let editorCredentials: { email: string; password: string };

  test.beforeEach(async ({ page }) => {
    await signIn(page);
    projectId = await createProject(page, `Collab Undo ${Date.now()}`);
    editorCredentials = await createEditorInProject(page, projectId);
  });

  test.afterEach(async ({ page }) => {
    if (projectId) await cleanupProject(page, projectId);
  });

  test('A undo reverts only A’s edits; B’s remain; A redo restores', async ({ page, browser }) => {
    const fileName = 'undo.adoc';
    await createTestFile(page, projectId, null, fileName);

    await openFileInEditor(page, projectId, fileName);
    const contentA = page.locator('.cm-editor .cm-content');

    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    try {
      await signIn(pageB, editorCredentials.email, editorCredentials.password);
      await openFileInEditor(pageB, projectId, fileName);
      const contentB = pageB.locator('.cm-editor .cm-content');

      // Interleave: A types, then B types.
      await contentA.click();
      await page.keyboard.type('AAA ');
      await expect(contentB).toContainText('AAA ', { timeout: 2000 });

      await contentB.click();
      await pageB.keyboard.press('Control+End');
      await pageB.keyboard.type('BBB ');
      await expect(contentA).toContainText('BBB ', { timeout: 2000 });

      // A undoes — only "AAA " is removed; "BBB " (B's edit) must remain.
      await contentA.click();
      await page.keyboard.press(UNDO);

      await expect(async () => {
        const text = await contentA.textContent();
        expect(text).not.toContain('AAA ');
        expect(text).toContain('BBB ');
      }).toPass({ timeout: 5000 });

      // A redo restores A's edit; both clients converge to a doc with both edits.
      // (Assert content, not raw textContent equality — y-codemirror injects each
      // peer's remote-cursor name label, so the two editors' textContent differ by it.)
      await page.keyboard.press(REDO);
      for (const content of [contentA, contentB]) {
        await expect(content).toContainText('AAA ', { timeout: 5000 });
        await expect(content).toContainText('BBB ', { timeout: 5000 });
      }
    } finally {
      await contextB.close();
    }
  });
});
