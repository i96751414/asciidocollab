import { test, expect, type Page } from '@playwright/test';
import { ensureTestUser } from './helpers/test-user';
import {
  signIn,
  createProject,
  cleanupProject,
  createTestFile,
  createTestFolder,
} from './helpers/test-project';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function gotoProject(page: Page, projectId: string) {
  await page.goto(`/dashboard/projects/${projectId}`);
  await expect(page.getByText(/loading\.\.\./i)).not.toBeVisible({ timeout: 8000 });
  await expect(page.getByText(/failed to load files/i)).not.toBeVisible();
}

/**
 * Simulates a native HTML5 drag-and-drop of one tree node onto a folder.
 *
 * Playwright's mouse-based `dragTo` does NOT trigger HTML5 `dragstart` /
 * `dragover` / `drop` events reliably across engines, so we dispatch real
 * `DragEvent`s that share a single `DataTransfer` instance — exactly what the
 * browser does during a genuine drag. This faithfully exercises the component's
 * drag handlers, including the tree's `dragstart` listener that stores the
 * source id on the DataTransfer and the folder's `drop` listener that reads it.
 *
 * @param grabSelector - CSS selector, relative to the source row, of the element
 *   the `dragstart` is dispatched on. Browsers differ on whether `dragstart`
 *   targets the draggable element or the inner element under the pointer
 *   (WebKit fires it on the inner icon/text), so this lets a test pin down the
 *   exact target — e.g. the row's `<svg>` icon.
 */
async function dragNodeOntoFolder(
  page: Page,
  sourceName: string,
  targetFolderName: string,
  grabSelector?: string,
) {
  await page.evaluate(
    ({ sourceName, targetFolderName, grabSelector }) => {
      const sourceRow = document.querySelector(`[data-testid="tree-node-${sourceName}"]`);
      const target = document.querySelector(`[data-testid="tree-node-${targetFolderName}"]`);
      if (!sourceRow || !target) {
        throw new Error(`drag nodes not found: source=${!!sourceRow} target=${!!target}`);
      }
      const grab = grabSelector ? sourceRow.querySelector(grabSelector) : sourceRow;
      if (!grab) throw new Error(`grab element not found for selector ${grabSelector}`);

      const dataTransfer = new DataTransfer();
      const fire = (element: Element, type: string) =>
        element.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer }));

      fire(grab, 'dragstart');
      fire(target, 'dragenter');
      fire(target, 'dragover');
      fire(target, 'drop');
      fire(grab, 'dragend');
    },
    { sourceName, targetFolderName, grabSelector },
  );
}

async function confirmMoveAndAssert(page: Page, projectId: string, folderId: string, fileName: string) {
  const dialog = page.locator('[role="dialog"]');
  await expect(dialog).toBeVisible({ timeout: 5000 });
  await dialog.getByRole('button', { name: /^confirm$/i }).click();
  await expect(dialog).not.toBeVisible({ timeout: 5000 });

  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
  await expect
    .poll(
      async () => {
        const response = await page.request.get(`${apiUrl}/projects/${projectId}/files`);
        const tree = await response.json();
        const folder = tree.children.find((c: { id: string }) => c.id === folderId);
        const underFolder = folder?.children?.some((c: { name: string }) => c.name === fileName) ?? false;
        const atRoot = tree.children.some((c: { name: string }) => c.name === fileName);
        return underFolder && !atRoot;
      },
      { timeout: 5000 },
    )
    .toBe(true);
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

test.describe('File tree drag-and-drop move', () => {
  test.beforeAll(async () => {
    await ensureTestUser();
  });

  let projectId: string;

  test.beforeEach(async ({ page }) => {
    await signIn(page);
    projectId = await createProject(page, `File DnD E2E ${Date.now()}`);
  });

  test.afterEach(async ({ page }) => {
    if (projectId) await cleanupProject(page, projectId);
  });

  test('dragging a root file onto a folder moves it into that folder', async ({ page }) => {
    const folderId = await createTestFolder(page, projectId, null, 'docs');
    await createTestFile(page, projectId, null, 'intro.adoc');

    await gotoProject(page, projectId);
    await expect(page.getByTestId('tree-node-docs')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('tree-node-intro.adoc')).toBeVisible({ timeout: 5000 });

    await dragNodeOntoFolder(page, 'intro.adoc', 'docs');
    await confirmMoveAndAssert(page, projectId, folderId, 'intro.adoc');

    await expect(page.getByTestId('tree-node-intro.adoc')).toBeVisible({ timeout: 5000 });
  });

  // Regression: the drag must work no matter which part of the row the user
  // grabs. Browsers fire `dragstart` on the element under the pointer, which is
  // the row's <svg> icon when the user grabs there (this is what WebKit always
  // does). If the tree's dragstart handler only recognises HTMLElement targets
  // it silently drops the SVG case — the move is never recorded and, to the
  // user, "nothing happens on drop".
  test('dragging a file by its icon still moves it into the folder', async ({ page }) => {
    const folderId = await createTestFolder(page, projectId, null, 'docs');
    await createTestFile(page, projectId, null, 'intro.adoc');

    await gotoProject(page, projectId);
    await expect(page.getByTestId('tree-node-intro.adoc')).toBeVisible({ timeout: 5000 });

    // Grab the row by its file icon (an <svg>), not the text label.
    await dragNodeOntoFolder(page, 'intro.adoc', 'docs', 'svg');
    await confirmMoveAndAssert(page, projectId, folderId, 'intro.adoc');
  });
});
