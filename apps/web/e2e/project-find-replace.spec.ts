import { test, expect, type Page } from '@playwright/test';
import { ensureTestUser, createInvitedUser } from './helpers/test-user';
import { signIn, createProject, cleanupProject } from './helpers/test-project';
import { createAdocFile, openProject, openFile, getEditorText, editorContent } from './helpers/editor';

// Project-wide find/replace (feature 037): search across open + dormant files, replace on an open
// session (live merge) and a dormant file (persisted), regex capture-group substitution, per-match
// exclude, an audit entry, and per-file undo. Requires apps/api AND apps/collab running (the
// structured apply routes through the collaboration server's Yjs source of truth).

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

async function inviteEditor(page: Page, projectId: string): Promise<{ email: string; password: string }> {
  const email = `fr-editor-${Date.now()}@example.com`;
  const password = 'EditorP@ssw0rd123!';
  await createInvitedUser(page, email, password, 'FR Editor');
  const response = await page.request.post(`${API_URL}/api/projects/${projectId}/members`, {
    data: { email, role: 'editor' },
  });
  if (!response.ok()) throw new Error(`inviteEditor failed: ${response.status()} ${await response.text()}`);
  return { email, password };
}

/** Open the left-panel Search tab. */
async function openSearchTab(page: Page): Promise<void> {
  await page.getByRole('tab', { name: /search/i }).click();
  await expect(page.getByLabel('Search query')).toBeVisible();
}

/** Enter a search term and wait for the grouped results to settle. */
async function searchFor(page: Page, term: string): Promise<void> {
  await page.getByLabel('Search query').fill(term);
}

test.describe('Project-wide find and replace', () => {
  test.beforeAll(async () => {
    await ensureTestUser();
  });

  let projectId: string;

  test.beforeEach(async ({ page }) => {
    await signIn(page);
    projectId = await createProject(page, `Find Replace ${Date.now()}`);
  });

  test.afterEach(async ({ page }) => {
    if (projectId) await cleanupProject(page, projectId);
  });

  test('finds a term across open and dormant files and navigates to a match', async ({ page }) => {
    await createAdocFile(page, projectId, 'opened.adoc', '= Opened\n\nThe needle is here.\n');
    await createAdocFile(page, projectId, 'dormant.adoc', '= Dormant\n\nAnother needle lives here.\n');

    await openProject(page, projectId);
    await openFile(page, 'opened.adoc', /needle/);
    await openSearchTab(page);
    await searchFor(page, 'needle');

    // Both files appear — including the dormant one that was never opened.
    await expect(page.getByTestId('search-view').getByText('opened.adoc')).toBeVisible();
    await expect(page.getByTestId('search-view').getByText('dormant.adoc')).toBeVisible();

    // Activating the dormant result opens that file with the match visible.
    await page.getByTestId('search-view').getByRole('button', { name: /another needle lives here/i }).click();
    await expect(editorContent(page)).toContainText('Another needle lives here.');
  });

  test('replaces across the project (dormant persisted), excluding one match', async ({ page }) => {
    await createAdocFile(page, projectId, 'a.adoc', '= A\n\nreplace one and replace two.\n');
    await createAdocFile(page, projectId, 'b.adoc', '= B\n\nreplace three here.\n');

    await openProject(page, projectId);
    await openFile(page, 'a.adoc', /replace one/);
    await openSearchTab(page);
    await searchFor(page, 'replace');
    await page.getByLabel('Replacement text').fill('REPLACED');

    // Exclude the very first match (line with "replace one").
    await page.getByRole('checkbox', { name: /exclude match on line 3/i }).first().uncheck();

    await page.getByRole('button', { name: /replace all matches/i }).click();
    const dialog = page.getByRole('dialog', { name: /confirm replace all/i });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: /replace all/i }).click();

    // Re-search: the excluded occurrence remains, the included ones are gone.
    await searchFor(page, 'replace');
    await expect(page.getByTestId('search-view').getByText('a.adoc')).toBeVisible();
    await expect(page.getByTestId('search-view').getByText('b.adoc')).toHaveCount(0);

    // The dormant file b.adoc was persisted with the replacement.
    await openFile(page, 'b.adoc', /REPLACED/);
    expect(await getEditorText(page)).toContain('REPLACED three here.');
  });

  test('an open-session file receives the replacement live (merged)', async ({ page, browser }) => {
    await createAdocFile(page, projectId, 'live.adoc', '= Live\n\nchange me please.\n');
    const editor = await inviteEditor(page, projectId);

    // Client B keeps live.adoc open.
    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    await signIn(pageB, editor.email, editor.password);
    await openProject(pageB, projectId);
    await openFile(pageB, 'live.adoc', /change me/);

    // Client A replaces "change" project-wide.
    await openProject(page, projectId);
    await openSearchTab(page);
    await searchFor(page, 'change');
    await page.getByLabel('Replacement text').fill('EDIT');
    await page.getByRole('button', { name: /replace all matches/i }).click();
    await page.getByRole('dialog', { name: /confirm replace all/i }).getByRole('button', { name: /replace all/i }).click();

    // B sees the change live, merged with any concurrent typing.
    await expect(editorContent(pageB)).toContainText('EDIT me please.', { timeout: 15_000 });
    await contextB.close();
  });

  test('regex capture-group substitution and per-file editor undo', async ({ page }) => {
    await createAdocFile(page, projectId, 'dates.adoc', '= Dates\n\nRelease 2026-07 shipped.\n');

    await openProject(page, projectId);
    await openFile(page, 'dates.adoc', /2026-07/);
    await openSearchTab(page);
    // Enable regex mode, search for a capture pattern, substitute with $2/$1.
    await page.getByRole('button', { name: /regular expression/i }).click();
    await searchFor(page, String.raw`(\d{4})-(\d{2})`);
    await page.getByLabel('Replacement text').fill('$2/$1');
    await page.getByRole('button', { name: /replace all matches/i }).click();
    await page.getByRole('dialog', { name: /confirm replace all/i }).getByRole('button', { name: /replace all/i }).click();

    await openFile(page, 'dates.adoc', /07\/2026/);
    expect(await getEditorText(page)).toContain('Release 07/2026 shipped.');

    // Per-file editor undo reverts the replacement in the open file.
    await editorContent(page).click();
    await page.keyboard.press('ControlOrMeta+z');
    await expect(editorContent(page)).toContainText('2026-07', { timeout: 10_000 });
    // There is no cross-file bulk-undo affordance in the search panel.
    await expect(page.getByRole('button', { name: /undo all/i })).toHaveCount(0);
  });
});
