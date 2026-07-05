import { test, expect, type Page } from '@playwright/test';
import { ensureTestUser } from './helpers/test-user';
import { signIn, createProject, cleanupProject } from './helpers/test-project';
import { createAdocFile, openProject } from './helpers/editor';

// Regex safety + limits surface (feature 037): an invalid pattern shows an inline error and nothing
// runs; a known catastrophic-backtracking pattern stays bounded (RE2 linear-time) and never freezes
// the UI; the capped-total "refine" affordance appears; skipped (binary/oversize) files are surfaced.

async function openSearchTab(page: Page): Promise<void> {
  await page.getByRole('tab', { name: /search/i }).click();
  await expect(page.getByLabel('Search query')).toBeVisible();
}

test.describe('Project search — regex safety and limits', () => {
  test.beforeAll(async () => {
    await ensureTestUser();
  });

  let projectId: string;

  test.beforeEach(async ({ page }) => {
    await signIn(page);
    projectId = await createProject(page, `Search Safety ${Date.now()}`);
  });

  test.afterEach(async ({ page }) => {
    if (projectId) await cleanupProject(page, projectId);
  });

  test('an invalid regex shows an inline error and does not crash', async ({ page }) => {
    await createAdocFile(page, projectId, 'doc.adoc', '= Doc\n\nsome text.\n');
    await openProject(page, projectId);
    await openSearchTab(page);
    await page.getByRole('button', { name: /regular expression/i }).click();
    await page.getByLabel('Search query').fill('(unbalanced');
    await expect(page.getByRole('alert')).toContainText(/invalid pattern/i);
  });

  test('a catastrophic-backtracking pattern stays bounded and the UI stays responsive', async ({ page }) => {
    // A long run of 'a' with a trailing non-match: exponential on a backtracking engine, linear on RE2.
    await createAdocFile(page, projectId, 'evil.adoc', `= Evil\n\n${'a'.repeat(4000)}!\n`);
    await openProject(page, projectId);
    await openSearchTab(page);
    await page.getByRole('button', { name: /regular expression/i }).click();

    const start = Date.now();
    await page.getByLabel('Search query').fill('(a+)+$');
    // A no-results (or results) state must settle quickly; the request cannot hang the client.
    await expect(page.getByText(/no matches found|matches/i).first()).toBeVisible({ timeout: 8000 });
    expect(Date.now() - start).toBeLessThan(8000);

    // The UI stays responsive: the query field still accepts input.
    await page.getByLabel('Search query').fill('text');
    await expect(page.getByLabel('Search query')).toHaveValue('text');
  });

  test('caps the returned matches and offers a refine affordance', async ({ page }) => {
    // Over 1000 matches (the display cap) of "z" in one file.
    await createAdocFile(page, projectId, 'many.adoc', `= Many\n\n${'z '.repeat(1100)}\n`);
    await openProject(page, projectId);
    await openSearchTab(page);
    await page.getByLabel('Search query').fill('z');
    await expect(page.getByText(/showing 1000 of \d+ matches/i)).toBeVisible({ timeout: 8000 });
  });

  test('surfaces files skipped for binary content', async ({ page }) => {
    await createAdocFile(page, projectId, 'text.adoc', '= Text\n\nfindme here.\n');
    // A file whose bytes contain a NUL is detected as binary and excluded from search.
    await createAdocFile(page, projectId, 'blob.dat', 'findme\u0000binary data');
    await openProject(page, projectId);
    await openSearchTab(page);
    await page.getByLabel('Search query').fill('findme');
    await expect(page.getByText('text.adoc')).toBeVisible();
    await expect(page.getByText(/1 file skipped/i)).toBeVisible();
  });
});
