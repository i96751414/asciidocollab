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
    // Force the REST/offline path to isolate the soft-wrap compartment from collab remounts.
    await page.route('**/collab/**', (route) => route.abort());
    await createAdocFile(page, projectId, 'wrap.adoc', LONG_LINE);
    await openProject(page, projectId);
    // The editor fires GET /auth/me/editor-preferences on mount; wait for it to
    // settle before toggling, so its (async) response can't clobber the toggle.
    const prefsLoaded = page
      .waitForResponse((response) => response.url().includes('editor-preferences') && response.request().method() === 'GET', { timeout: 10_000 })
      .catch(() => undefined);
    await openFile(page, 'wrap.adoc');
    await prefsLoaded;

    // Interaction 1: open editor settings. Interaction 2: toggle Soft Wrap.
    await page.getByRole('button', { name: /editor settings/i }).click();
    const softWrapToggle = page.getByLabel(/soft wrap/i);
    await expect(softWrapToggle).toBeVisible();

    // Default is on (wrapping enabled): the .cm-content carries the line-wrapping class.
    const content = page.locator('.cm-editor .cm-content');
    await expect(content).toHaveClass(/cm-lineWrapping/);

    // Turn it off — the soft-wrap compartment reconfigures live and wrapping is removed.
    // The preference save is debounced; capture the PUT so we can wait for the
    // server to persist before reloading (else the reload's GET re-reads the old value).
    const savePut = page
      .waitForResponse((response) => response.url().includes('editor-preferences') && response.request().method() === 'PUT', { timeout: 8000 })
      .catch(() => undefined);
    await softWrapToggle.click();
    await expect(softWrapToggle).not.toBeChecked();
    await expect(content).not.toHaveClass(/cm-lineWrapping/, { timeout: 8000 });

    // Persists across reload (wait for the debounced save to reach the server first).
    await savePut;
    await page.reload();
    await openFile(page, 'wrap.adoc');
    await expect(page.locator('.cm-editor .cm-content')).not.toHaveClass(/cm-lineWrapping/, { timeout: 8000 });
  });
});
