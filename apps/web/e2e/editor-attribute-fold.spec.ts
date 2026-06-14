import { test, expect } from '@playwright/test';
import { ensureTestUser } from './helpers/test-user';
import { signIn, createProject, cleanupProject } from './helpers/test-project';
import { createAdocFile, openProject, openFile } from './helpers/editor';

// FR-057: a `{attr}` reference renders as its resolved value via a replace decoration (source
// unchanged). Clicking the rendered value must reveal the raw reference so it can be edited —
// previously only arrow-key movement revealed it, because the widget ignored mouse events.

const DOC = [':version: 1.2.3', '', 'Release {version} now.', ''].join('\n');

test.describe('US4 {attr} collapse-to-value', () => {
  test.beforeAll(async () => {
    await ensureTestUser();
  });

  let projectId: string;

  test.beforeEach(async ({ page }) => {
    await signIn(page);
    projectId = await createProject(page, `AttrFold ${Date.now()}`);
  });

  test.afterEach(async ({ page }) => {
    if (projectId) await cleanupProject(page, projectId);
  });

  test('clicking the resolved value reveals the raw reference (FR-057)', async ({ page }) => {
    await createAdocFile(page, projectId, 'attr.adoc', DOC);
    await openProject(page, projectId);
    await openFile(page, 'attr.adoc');

    const content = page.locator('.cm-editor .cm-content');
    const widget = page.locator('.cm-ad-attr-value');

    // The reference collapses to its value; the raw `{version}` is not rendered.
    await expect(widget).toHaveText('1.2.3');
    await expect(content).not.toContainText('{version}');

    // Clicking the value places the cursor on the reference, revealing the source for editing.
    await widget.click();
    await expect(content).toContainText('{version}');
  });
});
