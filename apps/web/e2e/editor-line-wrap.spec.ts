import { test, expect } from '@playwright/test';
import { ensureTestUser } from './helpers/test-user';
import { signIn, createProject, cleanupProject } from './helpers/test-project';
import { createAdocFile, openProject, openFile } from './helpers/editor';

// US2 / FR-006–008: the soft-wrap toggle must be reachable from the editor next
// to Font Size / Theme (≤2 interactions, SC-002), change wrapping immediately,
// and persist across reloads.

const LONG_LINE =
  '= Wrap\n\n' +
  'This is a deliberately long single line of prose that exceeds the editor viewport width so that soft wrapping is observable when it is enabled and absent when it is disabled.\n';

test.describe('US2 line-wrap toggle', () => {
  test.beforeAll(async () => {
    await ensureTestUser();
  });

  let projectId: string;

  test.beforeEach(async ({ page }) => {
    await signIn(page);
    projectId = await createProject(page, `Line Wrap ${Date.now()}`);
  });

  test.afterEach(async ({ page }) => {
    if (projectId) await cleanupProject(page, projectId);
  });

  test('Soft Wrap is reachable in the settings panel and toggles wrapping, persisting across reload', async ({ page }) => {
    await createAdocFile(page, projectId, 'wrap.adoc', LONG_LINE);
    await openProject(page, projectId);
    await openFile(page, 'wrap.adoc');

    // Interaction 1: open editor settings. Interaction 2: toggle Soft Wrap.
    await page.getByRole('button', { name: /editor settings/i }).click();
    const softWrapToggle = page.getByLabel(/soft wrap/i);
    await expect(softWrapToggle).toBeVisible();

    // Default is on (wrapping enabled): the .cm-content carries the line-wrapping class.
    const content = page.locator('.cm-editor .cm-content');
    await expect(content).toHaveClass(/cm-lineWrapping/);

    // Turn it off — wrapping class disappears.
    await softWrapToggle.click();
    await expect(content).not.toHaveClass(/cm-lineWrapping/);

    // Persists across reload.
    await page.reload();
    await openFile(page, 'wrap.adoc');
    await expect(page.locator('.cm-editor .cm-content')).not.toHaveClass(/cm-lineWrapping/);
  });
});
