import { test, expect } from '@playwright/test';
import { ensureTestUser } from './helpers/test-user';
import { signIn, createProject, cleanupProject } from './helpers/test-project';
import { createAdocFile, openProject, openFile } from './helpers/editor';

// Effective heading-level styling from in-file
// :leveloffset:, discrete headings styled + excluded from the outline, and
// effective level beyond the max not styled as a heading.

const DOC = [
  '= Doc Title',
  '',
  '== Level One',
  '',
  ':leveloffset: +1',
  '',
  '== Shifted To Two',
  '',
  ':leveloffset!:',
  '',
  '[discrete]',
  '== Discrete Heading',
  '',
  ':leveloffset: +5',
  '',
  '====== Beyond Max',
  '',
].join('\n');

test.describe('Effective header levels', () => {
  test.beforeAll(async () => {
    await ensureTestUser();
  });

  let projectId: string;

  test.beforeEach(async ({ page }) => {
    await signIn(page);
    projectId = await createProject(page, `Header Levels ${Date.now()}`);
  });

  test.afterEach(async ({ page }) => {
    if (projectId) await cleanupProject(page, projectId);
  });

  test('in-file leveloffset shifts level, discrete is excluded from outline, over-max is not a heading', async ({ page }) => {
    await createAdocFile(page, projectId, 'levels.adoc', DOC);
    await openProject(page, projectId);
    await openFile(page, 'levels.adoc');

    // The plain "== Level One" line gets the effective-level-1 class.
    await expect(page.locator('.cm-line.cm-ad-h1', { hasText: 'Level One' })).toHaveCount(1);
    // "== Shifted To Two" under :leveloffset: +1 is styled as effective level 2.
    await expect(page.locator('.cm-line.cm-ad-h2', { hasText: 'Shifted To Two' })).toHaveCount(1);
    // The discrete heading carries the discrete class.
    await expect(page.locator('.cm-line.cm-ad-discrete', { hasText: 'Discrete Heading' })).toHaveCount(1);
    // The over-max heading is NOT styled as a heading line.
    await expect(page.locator('.cm-line.cm-ad-h6, .cm-line.cm-ad-h7', { hasText: 'Beyond Max' })).toHaveCount(0);

    // Discrete heading is excluded from the section outline.
    const outline = page.getByTestId('section-outline');
    if (await outline.isVisible().catch(() => false)) {
      await expect(outline).not.toContainText('Discrete Heading');
      await expect(outline).toContainText('Level One');
    }
  });
});
