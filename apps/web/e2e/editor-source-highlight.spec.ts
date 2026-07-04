import { test, expect } from '@playwright/test';
import { ensureTestUser } from './helpers/test-user';
import { signIn, createProject, cleanupProject } from './helpers/test-project';
import { createAdocFile, openProject, openFile } from './helpers/editor';

// A [source,js] block body shows JavaScript tokens; an unknown
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

test.describe('in-editor source highlighting', () => {
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
    // Wait for the collaborative document to sync in before asserting on its
    // tokens — `.cm-content` mounts empty pre-sync, which under load raced the
    // 5s default and surfaced as an intermittent empty-content failure.
    await openFile(page, 'source.adoc', 'const greeting');

    const content = page.locator('.cm-editor .cm-content');
    await expect(content).toContainText('const greeting');

    const jsLine = page.locator('.cm-line', { hasText: 'const greeting' });
    const cobolLine = page.locator('.cm-line', { hasText: 'DISPLAY' });

    // Once the JavaScript language chunk loads (lazy import), the embedded parser
    // tokenizes the body: the `const` KEYWORD becomes its own span whose text is
    // EXACTLY `const`. Without injection the whole body line is a single
    // `t.content` span (`const greeting = "hello";`), so an exact-`const` span
    // only exists when real syntax highlighting is applied — the regression guard
    // (the parseMixed wrap used to bail on the real grammar, leaving every block
    // un-highlighted, yet a single content span still satisfied the old
    // `span.first()` assertion, masking the bug).
    await expect(jsLine.locator('span', { hasText: /^const$/ })).toBeVisible({ timeout: 10_000 });
    // The line is split into MULTIPLE token spans (keyword/name/operator/string),
    // not one content span — a second, language-agnostic signal of tokenization.
    expect(await jsLine.locator('span').count()).toBeGreaterThan(1);

    // Contrast: `cobol` is not in the allow-list, so its body is never injected and
    // stays a single plain content span — no per-keyword `DISPLAY` span appears.
    await expect(cobolLine.locator('span', { hasText: /^DISPLAY$/ })).toHaveCount(0);

    // AsciiDoc resumes: the "== After" heading is still styled as a heading line.
    await expect(page.locator('.cm-line.cm-ad-h1', { hasText: 'After' })).toHaveCount(1);
  });
});
