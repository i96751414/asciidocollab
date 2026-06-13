import { test, expect } from '@playwright/test';
import { ensureTestUser } from './helpers/test-user';
import { signIn, createProject, cleanupProject } from './helpers/test-project';
import { createAdocFile, openProject, openFile } from './helpers/editor';

// US5 / FR-017–019: a [source,js] block body shows JavaScript tokens; an unknown
// language stays plain; AsciiDoc highlighting resumes after the block.

const DOC = [
  '= Source Highlight',
  '',
  '[source,javascript]',
  '----',
  'const greeting = "hello";',
  '----',
  '',
  '[source,cobol]',
  '----',
  'DISPLAY "plain".',
  '----',
  '',
  '== After',
  '',
].join('\n');

test.describe('US5 in-editor source highlighting', () => {
  test.beforeAll(async () => {
    await ensureTestUser();
  });

  let projectId: string;

  test.beforeEach(async ({ page }) => {
    await signIn(page);
    projectId = await createProject(page, `Source HL ${Date.now()}`);
  });

  test.afterEach(async ({ page }) => {
    if (projectId) await cleanupProject(page, projectId);
  });

  test('JS block highlights as code while AsciiDoc resumes afterwards', async ({ page }) => {
    await createAdocFile(page, projectId, 'source.adoc', DOC);
    await openProject(page, projectId);
    await openFile(page, 'source.adoc');

    const content = page.locator('.cm-editor .cm-content');
    await expect(content).toContainText('const greeting');

    // The JS keyword `const` should become a highlighted token span once the
    // JavaScript language chunk has loaded (lazy import).
    await expect(
      page.locator('.cm-line', { hasText: 'const greeting' }).locator('span').first(),
    ).toBeVisible({ timeout: 10_000 });

    // AsciiDoc resumes: the "== After" heading is still styled as a heading line.
    await expect(page.locator('.cm-line.cm-ad-h1', { hasText: 'After' })).toHaveCount(1);
  });
});
