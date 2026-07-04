import { test, expect } from '@playwright/test';
import { ensureTestUser } from './helpers/test-user';
import { signIn, createProject, cleanupProject } from './helpers/test-project';
import { createAdocFile, setMainFile, openProject, openFile, editorContent, typeAtEnd } from './helpers/editor';

// Collab-safety: a symbol rename (attribute / anchor) must treat the Yjs document
// as the SOURCE OF TRUTH for any file currently open for collaborative editing. Writing the
// rewrite straight to the plain-text file store is unsafe: the editing user never sees it AND the
// next Yjs writeback (debounce ~2s / on disconnect) overwrites the file with the stale live
// Y.Text, silently reverting the rename — the exact bug this spec reproduces. A file that is NOT
// open keeps the direct file-store write. Requires apps/api AND apps/collab running (the e2e
// stack starts both).

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

// main.adoc defines :product: and references {product}; chapter.adoc only references it. We open
// main.adoc (live collab room) and leave chapter.adoc closed, so one rename exercises both the
// collab-routed (open) and file-store (closed) write paths in a single pass.
const MAIN = '= Book\n\n:product: Acme\n\nWelcome to {product}.\n\ninclude::chapter.adoc[]\n';
const CHAPTER = '= Chapter\n\nMore about {product} here.\n';

async function readContent(
  page: import('@playwright/test').Page,
  projectId: string,
  fileNodeId: string,
): Promise<string> {
  const response = await page.request.get(`${API_URL}/projects/${projectId}/files/${fileNodeId}/content`);
  expect(response.ok()).toBeTruthy();
  return response.text();
}

test.describe('Collab-safe symbol rename', () => {
  test.beforeAll(async () => {
    await ensureTestUser();
  });

  let projectId: string;
  let mainId: string;
  let chapterId: string;

  test.beforeEach(async ({ page }) => {
    await signIn(page);
    projectId = await createProject(page, `Collab Refactor ${Date.now()}`);
    mainId = await createAdocFile(page, projectId, 'main.adoc', MAIN);
    chapterId = await createAdocFile(page, projectId, 'chapter.adoc', CHAPTER);
    await setMainFile(page, projectId, mainId);
  });

  test.afterEach(async ({ page }) => {
    if (projectId) await cleanupProject(page, projectId);
  });

  test('renaming an attribute updates the open file live (and a closed file on disk) without being clobbered', async ({
    page,
  }) => {
    await openProject(page, projectId);
    // Opening main.adoc establishes a LIVE collaborative session for it (Yjs source of truth).
    // NOTE on assertions: the editor renders an `{attr}` reference as its resolved value via an
    // inline decoration (`{product}` shows as "Acme"), so we assert against the attribute
    // DEFINITION line (`:product:` → `:widget:`), which is shown verbatim as source. The raw
    // reference rewrite (`{product}` → `{widget}`) is proven by reading the persisted file content.
    await openFile(page, 'main.adoc');
    await expect(editorContent(page)).toContainText(':product:', { timeout: 15_000 });

    // Drive the rename through the Refactor dialog, selecting the attribute kind.
    await page.getByRole('button', { name: /refactor/i }).click();
    const dialog = page.getByRole('dialog', { name: /refactor symbol/i });
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    await dialog.getByLabel('Symbol kind').selectOption('attribute');
    await dialog.getByLabel('Symbol name').fill('product');
    await dialog.getByRole('button', { name: /find usages/i }).click();
    await expect(dialog.getByRole('list', { name: /usages/i }).getByText('main.adoc').first()).toBeVisible({ timeout: 15_000 });

    await dialog.getByLabel('New name').fill('widget');
    await dialog.getByRole('button', { name: /^rename$/i }).click();
    // Both files were rewritten: main.adoc (def + ref) and chapter.adoc (ref).
    await expect(dialog.getByText(/renamed across 2 files/i)).toBeVisible({ timeout: 15_000 });
    // The dialog only closes on Escape from one of its inputs (or a backdrop click); focus an input first.
    await dialog.getByLabel('New name').focus();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();

    // (a) OPEN FILE — LIVE VISIBILITY: the rename appears in the editor main.adoc is bound to,
    // because it was applied to the Yjs document, not the file behind it.
    await expect(editorContent(page)).toContainText(':widget:', { timeout: 15_000 });
    await expect(editorContent(page)).not.toContainText(':product:');

    // (b) CLOSED FILE — chapter.adoc was never opened, so it is rewritten directly in the file
    // store and the persisted content already carries the new name.
    const chapter = await readContent(page, projectId, chapterId);
    expect(chapter).toContain('More about {widget} here.');
    expect(chapter).not.toContain('{product}');

    // (c) OPEN FILE — NO CLOBBER: force a Yjs writeback with an unrelated edit (>2s debounce), then
    // the persisted main.adoc must still carry the rename (the stale live Y.Text must NOT win).
    await editorContent(page).click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type('\nTrigger writeback.');

    await expect
      .poll(() => readContent(page, projectId, mainId), { timeout: 20_000, intervals: [500, 1000, 2000] })
      .toContain(':widget:');
    const main = await readContent(page, projectId, mainId);
    expect(main).toContain('Welcome to {widget}.');
    expect(main).not.toContain('{product}');
    expect(main).not.toContain(':product:');
  });

  test('finds and renames an attribute typed live in the editor (the folder2 read-side bug)', async ({ page }) => {
    // Reproduces the reported bug: an attribute the user just typed in the editor — held in the live
    // Yjs document, lagging the plain-text file store — was invisible to find-usages, which scanned
    // the stale file store. find-usages now reads the LIVE content for an open file, so it is found.
    await openProject(page, projectId);
    await openFile(page, 'main.adoc');
    await expect(editorContent(page)).toContainText(':product:', { timeout: 15_000 });

    // Type a brand-new attribute definition + reference into the live document.
    await typeAtEnd(page, '\n\n:freshattr: hello\n\nUses {freshattr}.\n');
    await expect(editorContent(page)).toContainText(':freshattr:');

    // Find usages of the just-typed attribute — it must be found via the live content.
    await page.getByRole('button', { name: /refactor/i }).click();
    const dialog = page.getByRole('dialog', { name: /refactor symbol/i });
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await dialog.getByLabel('Symbol kind').selectOption('attribute');
    await dialog.getByLabel('Symbol name').fill('freshattr');
    await dialog.getByRole('button', { name: /find usages/i }).click();
    // The definition (and reference) live in main.adoc — proof the live scan saw the unsaved symbol.
    await expect(dialog.getByRole('list', { name: /usages/i }).getByText('main.adoc').first()).toBeVisible({ timeout: 15_000 });

    // Rename it and confirm the open editor reflects the new name live.
    await dialog.getByLabel('New name').fill('renamedattr');
    await dialog.getByRole('button', { name: /^rename$/i }).click();
    await expect(dialog.getByText(/renamed across 1 file/i)).toBeVisible({ timeout: 15_000 });
    await dialog.getByLabel('New name').focus();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();

    await expect(editorContent(page)).toContainText(':renamedattr:', { timeout: 15_000 });
    await expect(editorContent(page)).not.toContainText(':freshattr:');
  });
});
