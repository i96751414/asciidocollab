import { test, expect } from '@playwright/test';
import { ensureTestUser } from './helpers/test-user';
import { signIn, createProject, cleanupProject } from './helpers/test-project';
import {
  createAdocFile,
  openProject,
  openFile,
  editorContent,
  getEditorText,
  expandPreview,
  collapsePreview,
} from './helpers/editor';

// Toggling the HTML preview must never blank, reset, or lose
// editor content — and the cursor/scroll position must be preserved — on both
// the collab and offline/REST paths. The root cause was a remount: the editor
// lived in a PanelGroup>Panel when the preview was open and a bare <div> when it
// was closed, so toggling changed the parent element type and remounted CM.

const SEED = '= Preview Toggle\n\nFirst paragraph.\n\nSecond paragraph.\n';
const TYPED = '\n\nA line typed by the test that must survive preview toggles.';

test.describe('preview toggle preserves editor content', () => {
  test.beforeAll(async () => {
    await ensureTestUser();
  });

  let projectId: string;

  test.beforeEach(async ({ page }) => {
    await signIn(page);
    projectId = await createProject(page, `Preview Toggle ${Date.now()}`);
  });

  test.afterEach(async ({ page }) => {
    if (projectId) await cleanupProject(page, projectId);
  });

  test('content + cursor survive toggling the preview three times (collab path)', async ({ page }) => {
    await createAdocFile(page, projectId, 'toggle.adoc', SEED);
    await openProject(page, projectId);
    await openFile(page, 'toggle.adoc');

    await editorContent(page).click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type(TYPED);

    const before = await getEditorText(page);
    expect(before).toContain('must survive preview toggles');
    // Cursor position is reflected in the status bar (Ln, Col) — capture it without
    // relying on DOM focus (toggling the preview buttons moves focus off the editor).
    const cursorLocator = page.getByText(/Ln \d+, Col \d+/);
    const cursorBefore = await cursorLocator.textContent();

    for (let index = 0; index < 3; index++) {
      await expandPreview(page);
      await collapsePreview(page);
    }

    const after = await getEditorText(page);
    expect(after, 'editor content must be byte-identical after toggling the preview').toBe(before);
    // Cursor preserved: the editor was never remounted, so CM keeps its selection.
    expect(await cursorLocator.textContent(), 'cursor (Ln, Col) must be preserved across toggles').toBe(cursorBefore);
  });

  test('content survives toggling on the offline/REST path', async ({ page }) => {
    // Force the offline/REST path by blocking the collab websocket upgrade so the
    // editor falls back to REST autosave instead of the Yjs document.
    await page.route('**/collab/**', (route) => route.abort());

    await createAdocFile(page, projectId, 'rest.adoc', SEED);
    await openProject(page, projectId);
    await openFile(page, 'rest.adoc');

    await editorContent(page).click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type(TYPED);
    const before = await getEditorText(page);

    for (let index = 0; index < 3; index++) {
      await expandPreview(page);
      await collapsePreview(page);
    }

    expect(await getEditorText(page)).toBe(before);
  });
});
