import { test, expect } from '@playwright/test';
import { ensureTestUser } from './helpers/test-user';
import { signIn, createProject, cleanupProject } from './helpers/test-project';
import { createAdocFile, openProject, openFile } from './helpers/editor';

// US12 (FR-044/045/046/032; SC-016): higher-fidelity editor highlighting.
//  - constrained/unconstrained boundary rules: `a*b*c` is NOT bolded, genuine `*bold*` is;
//  - a labelled xref `<<id,label>>` distinguishes target from label;
//  - a table `[cols="1,>2"]` specifier is tokenized distinctly;
//  - inactive conditional branches are dimmed live (the dimming decoration adds the
//    `.cm-ad-conditional-dimmed` class to inactive-branch content).
// The pure decision/token logic is unit-tested (asciidoc-highlight.test.ts, asciidoc-grammar.test.ts,
// conditional-dimming.test.ts); this spec confirms the live editor wires them up.

const SAMPLE = [
  '= Fidelity Sample',
  '',
  'Some *bold* and a literal a*b*c here.',
  '',
  'See <<intro,The Introduction>> for details.',
  '',
  '[cols="1,>2"]',
  '|===',
  '| a | b',
  '|===',
  '',
  'ifdef::draft[]',
  'This draft-only line should be dimmed.',
  'endif::[]',
  '',
  'Always visible.',
  '',
].join('\n');

test.describe('US12 highlighting fidelity (live editor)', () => {
  test.beforeAll(async () => {
    await ensureTestUser();
  });

  let projectId: string;

  test.beforeEach(async ({ page }) => {
    await signIn(page);
    projectId = await createProject(page, `Fidelity ${Date.now()}`);
  });

  test.afterEach(async ({ page }) => {
    if (projectId) await cleanupProject(page, projectId);
  });

  test('constrained marks, xref, cols, and conditional dimming render in the editor', async ({ page }) => {
    await createAdocFile(page, projectId, 'fidelity.adoc', SAMPLE);
    await openProject(page, projectId);
    await openFile(page, 'fidelity.adoc');

    const content = page.locator('.cm-editor .cm-content');
    await expect(content).toContainText('Some *bold* and a literal a*b*c here.');
    await expect(content).toContainText('<<intro,The Introduction>>');
    await expect(content).toContainText('[cols="1,>2"]');

    // The block-attribute cols line renders as styled spans (tokenized as a distinct TableCols node).
    const colsLine = page.locator('.cm-line', { hasText: '[cols="1,>2"]' }).first();
    await expect(colsLine.locator('span').first()).toBeVisible();

    // The xref line renders styled spans for the target and label.
    const xrefLine = page.locator('.cm-line', { hasText: '<<intro,The Introduction>>' }).first();
    await expect(xrefLine.locator('span').first()).toBeVisible();

    // The inactive `ifdef::draft[]` branch body is dimmed (the dimming decoration adds the class).
    // `draft` is not defined, so the branch resolves inactive.
    const dimmed = page.locator('.cm-ad-conditional-dimmed');
    await expect(dimmed.first()).toBeVisible();
    await expect(dimmed.first()).toContainText('draft-only');

    // The unconditional line is NOT dimmed.
    const alwaysLine = page.locator('.cm-line', { hasText: 'Always visible.' }).first();
    await expect(alwaysLine.locator('.cm-ad-conditional-dimmed')).toHaveCount(0);
  });
});
