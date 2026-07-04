import { test, expect } from '@playwright/test';
import { ensureTestUser } from './helpers/test-user';
import { signIn, createProject, cleanupProject } from './helpers/test-project';
import { createAdocFile, openProject, openFile, editorContent } from './helpers/editor';

// Per-file, per-user cursor memory. Each file remembers its own last cursor
// line; reopening a file restores that file's position (not just the last-opened file's), with
// positions isolated per file. Persists across an editor leave/return on the same browser.

/** A multi-line AsciiDoc body whose nth content line carries a uniquely identifiable marker. */
function document(title: string): string {
  return [
    `= ${title}`,
    '',
    `${title} line 3 marker.`,
    `${title} line 4 marker.`,
    `${title} line 5 marker.`,
    `${title} line 6 marker.`,
    `${title} line 7 marker.`,
  ].join('\n');
}

/** Click a file's text line to move the cursor there, then confirm the status bar reports it. */
async function placeCursorOnLine(page: import('@playwright/test').Page, lineText: string, lineNumber: number): Promise<void> {
  await editorContent(page).getByText(lineText, { exact: false }).click();
  await expect(page.locator('.asciidoc-editor').getByText(new RegExp(`^Ln ${lineNumber}, `))).toBeVisible({ timeout: 5000 });
  // Let the 500ms cursor-line persistence debounce flush.
  await page.waitForTimeout(800);
}

/** Leave the editor for the dashboard and return by clicking the project — a full remount via UI. */
async function leaveAndReturnViaDashboard(page: import('@playwright/test').Page, projectName: string): Promise<void> {
  await page.getByRole('link', { name: /back to projects/i }).click();
  await page.waitForURL(/\/dashboard$/);
  await page.getByRole('link', { name: projectName }).click();
  await page.waitForURL(/\/dashboard\/projects\/[^/]+$/);
  await expect(page.getByText(/loading\.\.\./i)).not.toBeVisible({ timeout: 8000 });
}

test.describe('per-file cursor memory', () => {
  test.beforeAll(async () => {
    await ensureTestUser();
  });

  let projectId: string;
  let projectName: string;

  test.beforeEach(async ({ page }) => {
    await signIn(page);
    projectName = `Cursor Memory ${Date.now()}`;
    projectId = await createProject(page, projectName);
  });

  test.afterEach(async ({ page }) => {
    if (projectId) await cleanupProject(page, projectId);
  });

  // Flagship: three files, three distinct cursor lines, each restored to ITS OWN line on reopen —
  // both via in-session navigation and after a full editor leave/return.
  test('remembers and restores a distinct cursor line per file across three files', async ({ page }) => {
    await createAdocFile(page, projectId, 'alpha.adoc', document('Alpha'));
    await createAdocFile(page, projectId, 'beta.adoc', document('Beta'));
    await createAdocFile(page, projectId, 'gamma.adoc', document('Gamma'));

    await openProject(page, projectId);

    // Set a distinct cursor line in each file.
    await openFile(page, 'alpha.adoc');
    await placeCursorOnLine(page, 'Alpha line 3 marker.', 3);

    await openFile(page, 'beta.adoc');
    await placeCursorOnLine(page, 'Beta line 5 marker.', 5);

    await openFile(page, 'gamma.adoc');
    await placeCursorOnLine(page, 'Gamma line 7 marker.', 7);

    // Reopen each file in a different order; the cursor returns to that file's remembered line.
    await openFile(page, 'alpha.adoc');
    await expect(page.locator('.asciidoc-editor').getByText(/^Ln 3, /)).toBeVisible({ timeout: 8000 });
    await expect(page.locator('.cm-editor .cm-activeLine')).toContainText('Alpha line 3 marker.');

    await openFile(page, 'gamma.adoc');
    await expect(page.locator('.asciidoc-editor').getByText(/^Ln 7, /)).toBeVisible({ timeout: 8000 });
    await expect(page.locator('.cm-editor .cm-activeLine')).toContainText('Gamma line 7 marker.');

    await openFile(page, 'beta.adoc');
    await expect(page.locator('.asciidoc-editor').getByText(/^Ln 5, /)).toBeVisible({ timeout: 8000 });
    await expect(page.locator('.cm-editor .cm-activeLine')).toContainText('Beta line 5 marker.');

    // Persistence across a full editor leave/return on the same browser. The last-opened
    // file (beta) restores at its remembered line on return.
    await leaveAndReturnViaDashboard(page, projectName);
    await expect(editorContent(page)).toContainText('Beta line 5 marker.', { timeout: 10_000 });
    await expect(page.locator('.asciidoc-editor').getByText(/^Ln 5, /)).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.cm-editor .cm-activeLine')).toContainText('Beta line 5 marker.');

    // After the remount, reopening alpha and gamma still restores their own remembered lines.
    await openFile(page, 'alpha.adoc');
    await expect(page.locator('.asciidoc-editor').getByText(/^Ln 3, /)).toBeVisible({ timeout: 8000 });
    await expect(page.locator('.cm-editor .cm-activeLine')).toContainText('Alpha line 3 marker.');

    await openFile(page, 'gamma.adoc');
    await expect(page.locator('.asciidoc-editor').getByText(/^Ln 7, /)).toBeVisible({ timeout: 8000 });
    await expect(page.locator('.cm-editor .cm-activeLine')).toContainText('Gamma line 7 marker.');
  });
});
