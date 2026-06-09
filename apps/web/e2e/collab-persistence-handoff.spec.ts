import { test, expect, type Page } from '@playwright/test';
import { ensureTestUser } from './helpers/test-user';
import { signIn, createProject, cleanupProject, createTestFile } from './helpers/test-project';

// T026 / US1 / FR-006, no-data-loss (edit handoff): on the collab path the editor
// performs NO PUT /content — persistence is the collaboration server's job
// (write-back + room-teardown flush, 018 FR-009). This test asserts that after a
// collaborative edit and room teardown, GET /content reflects the edits, AND the
// editor never issued its own PUT. Requires apps/api AND apps/collab running.
//
// Implemented as an e2e (not the originally-suggested jest integration test) because
// it depends on the live collaboration WebSocket and the server-side write-back.

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

async function openFileInEditor(page: Page, projectId: string, fileName: string): Promise<void> {
  await page.goto(`/dashboard/projects/${projectId}`);
  await expect(page.getByText(/loading\.\.\./i)).not.toBeVisible({ timeout: 8000 });
  await page.getByTestId(`tree-node-${fileName}`).click();
  await expect(page.locator('.cm-editor .cm-content')).toBeVisible({ timeout: 15_000 });
}

test.describe('No data loss at collab session handoff (US1)', () => {
  test.beforeAll(async () => {
    await ensureTestUser();
  });

  let projectId: string;

  test.beforeEach(async ({ page }) => {
    await signIn(page);
    projectId = await createProject(page, `Collab Handoff ${Date.now()}`);
  });

  test.afterEach(async ({ page }) => {
    if (projectId) await cleanupProject(page, projectId);
  });

  test('edits persist via the server after teardown, and the editor issues no PUT /content', async ({ page }) => {
    const fileName = 'handoff.adoc';
    const fileNodeId = await createTestFile(page, projectId, null, fileName);

    // Record any PUT to the content endpoint — there must be none on the collab path.
    const contentPuts: string[] = [];
    page.on('request', (request) => {
      if (request.method() === 'PUT' && request.url().includes(`/files/${fileNodeId}/content`)) {
        contentPuts.push(request.url());
      }
    });

    await openFileInEditor(page, projectId, fileName);
    const content = page.locator('.cm-editor .cm-content');
    await content.click();
    await page.keyboard.type('= Persisted via collab server\n\nNo client PUT happened.');

    // Leave the file/editor → room teardown triggers the server write-back flush.
    await page.waitForTimeout(1000);
    await page.goto('/dashboard');
    await page.waitForTimeout(3000); // allow debounce + teardown write-back to complete

    // The editor must never have PUT content itself.
    expect(contentPuts, 'collab editor must not PUT /content').toHaveLength(0);

    // GET /content must reflect the collaborative edits (server-side persistence).
    await expect(async () => {
      const response = await page.request.get(`${API_URL}/projects/${projectId}/files/${fileNodeId}/content`);
      expect(response.ok()).toBeTruthy();
      const text = await response.text();
      expect(text).toContain('Persisted via collab server');
      expect(text).toContain('No client PUT happened.');
    }).toPass({ timeout: 10_000 });
  });
});
