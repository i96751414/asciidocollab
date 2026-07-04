import { test, expect } from '@playwright/test';
import { ensureTestUser } from './helpers/test-user';
import { signIn, createProject, cleanupProject } from './helpers/test-project';
import { createAdocFile, openProject, openFile, editorContent } from './helpers/editor';

// Collab-safety: when a file is renamed/moved, the cross-file reference rewrite
// must treat the Yjs document (owned by the collab server) as the SOURCE OF TRUTH for any file
// that is currently open for collaborative editing. Writing the corrected reference straight to
// the plain-text file store is unsafe: the editing user never sees it AND the next Yjs writeback
// (debounce ~2s / on disconnect) overwrites the file with the stale live Y.Text, silently
// reverting the rewrite. These specs reproduce both failure modes; they require apps/api AND
// apps/collab running (the e2e stack starts both).

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

async function readContent(
  page: import('@playwright/test').Page,
  projectId: string,
  fileNodeId: string,
): Promise<string> {
  const response = await page.request.get(`${API_URL}/projects/${projectId}/files/${fileNodeId}/content`);
  expect(response.ok()).toBeTruthy();
  return response.text();
}

test.describe('Collab-safe reference rewrite on rename', () => {
  test.beforeAll(async () => {
    await ensureTestUser();
  });

  let projectId: string;
  let introId: string;
  let chapterId: string;

  test.beforeEach(async ({ page }) => {
    await signIn(page);
    projectId = await createProject(page, `Collab Rename ${Date.now()}`);
    // intro.adoc is the file we will rename; chapter.adoc references it via include::.
    introId = await createAdocFile(page, projectId, 'intro.adoc', '= Intro\n\nIntro body.\n');
    chapterId = await createAdocFile(
      page,
      projectId,
      'chapter.adoc',
      '= Chapter\n\ninclude::intro.adoc[]\n\nMore text.\n',
    );
  });

  test.afterEach(async ({ page }) => {
    if (projectId) await cleanupProject(page, projectId);
  });

  test('rename of a referenced file rewrites the reference live in an open editor and is not clobbered by writeback', async ({
    page,
  }) => {
    await openProject(page, projectId);
    // Opening chapter.adoc establishes a LIVE collaborative session for it (Yjs source of truth).
    await openFile(page, 'chapter.adoc');
    await expect(editorContent(page)).toContainText('include::intro.adoc[]', { timeout: 15_000 });

    // Rename the referenced file while chapter.adoc is open in a live collab room.
    const renamed = await page.request.patch(`${API_URL}/projects/${projectId}/files/${introId}`, {
      headers: { 'Content-Type': 'application/json' },
      data: { name: 'overview.adoc' },
    });
    expect(renamed.ok()).toBeTruthy();

    // (a) LIVE VISIBILITY: the corrected reference must appear in the open editor, because the
    // rewrite was applied to the Yjs document the editor is bound to — not the file behind it.
    await expect(editorContent(page)).toContainText('include::overview.adoc[]', { timeout: 15_000 });
    await expect(editorContent(page)).not.toContainText('include::intro.adoc[]');

    // (b) NO CLOBBER: force a Yjs writeback by making an unrelated edit (>2s debounce), then the
    // persisted file must still carry the rewrite (the stale live Y.Text must NOT overwrite it).
    await editorContent(page).click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type('\nTrigger writeback.');

    await expect
      .poll(() => readContent(page, projectId, chapterId), { timeout: 20_000, intervals: [500, 1000, 2000] })
      .toContain('include::overview.adoc[]');
    expect(await readContent(page, projectId, chapterId)).not.toContain('include::intro.adoc[]');
  });
});
