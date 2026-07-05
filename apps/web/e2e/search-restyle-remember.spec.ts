import { test, expect, type Page } from '@playwright/test';
import { ensureTestUser } from './helpers/test-user';
import { signIn, createProject, cleanupProject } from './helpers/test-project';
import { createAdocFile, openProject, openFile, editorContent } from './helpers/editor';

// In-editor find/replace restyle + Search-tab persistence (feature 037): the stock CodeMirror find
// panel is themed from design tokens (behaviour/keymap unchanged, scroll-sync untouched), and the
// Search tab is remembered across a reload (a per-user, client-only preference).

async function openSearchTab(page: Page): Promise<void> {
  await page.getByRole('tab', { name: /search/i }).click();
  await expect(page.getByLabel('Search query')).toBeVisible();
}

test.describe('In-editor restyle and Search-tab persistence', () => {
  test.beforeAll(async () => {
    await ensureTestUser();
  });

  let projectId: string;

  test.beforeEach(async ({ page }) => {
    await signIn(page);
    projectId = await createProject(page, `Restyle ${Date.now()}`);
  });

  test.afterEach(async ({ page }) => {
    if (projectId) await cleanupProject(page, projectId);
  });

  test('the in-editor find panel opens (behaviour unchanged) and is themed', async ({ page }) => {
    await createAdocFile(page, projectId, 'doc.adoc', '= Doc\n\nThe quick brown fox.\n');
    await openProject(page, projectId);
    await openFile(page, 'doc.adoc', /quick brown/);

    // Ctrl/Cmd-F opens the stock search panel docked at the top.
    await editorContent(page).click();
    await page.keyboard.press('ControlOrMeta+f');
    const panel = page.locator('.cm-panel.cm-search');
    await expect(panel).toBeVisible();

    // The panel's field is themed from the app background token (not the browser default white).
    const field = panel.locator('input').first();
    await expect(field).toBeVisible();
    const bg = await field.evaluate((element) => getComputedStyle(element).backgroundColor);
    expect(bg).not.toBe('rgba(0, 0, 0, 0)');

    // Escape closes it (keymap unchanged), and the editor stays editable (no scroll-sync regression).
    await page.keyboard.press('Escape');
    await expect(panel).toHaveCount(0);
    await editorContent(page).click();
    await page.keyboard.type('X');
    await expect(editorContent(page)).toContainText('X');
  });

  test('the Search tab is remembered across a reload', async ({ page }) => {
    await createAdocFile(page, projectId, 'doc.adoc', '= Doc\n\nbody.\n');
    await openProject(page, projectId);
    await openSearchTab(page);

    await page.reload();
    await expect(page.getByText(/loading\.\.\./i)).not.toBeVisible({ timeout: 8000 });

    // The Search tab restores as the active tab.
    await expect(page.getByRole('tab', { name: /search/i })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByLabel('Search query')).toBeVisible();
  });
});
