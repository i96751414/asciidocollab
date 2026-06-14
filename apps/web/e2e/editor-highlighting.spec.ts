import { test, expect } from '@playwright/test';
import { ensureTestUser } from './helpers/test-user';
import { signIn, createProject, cleanupProject } from './helpers/test-project';
import { createAdocFile, openProject, openFile } from './helpers/editor';

// US7 / FR-051/053/025: complete highlighting coverage. The pure tokenizer tests
// (asciidoc-grammar-us7.test.ts) assert the new nodes are produced; this spec
// confirms the live editor renders the new block constructs as highlighted spans.
//
// NOTE: AsciiDoc highlighting uses HighlightStyle.define (colour-based), which
// emits CodeMirror's generated atomic classes rather than semantic `.cm-ad-*`
// names. This spec therefore asserts the constructs render as styled spans;
// precise per-construct class assertions require adding semantic `class:` entries
// to the HighlightStyle (tracked alongside the deferred inline-token work).

const SAMPLE = [
  '= Highlighting Sample',
  '',
  'ifdef::backend-html5[]',
  'Conditional content.',
  'endif::[]',
  '',
  '[source,ruby]',
  '----',
  'puts "hello"',
  '----',
  '',
  ',===',
  'a,b',
  'c,d',
  ',===',
  '',
].join('\n');

test.describe('US7 highlighting coverage (live editor)', () => {
  test.beforeAll(async () => {
    await ensureTestUser();
  });

  let projectId: string;

  test.beforeEach(async ({ page }) => {
    await signIn(page);
    projectId = await createProject(page, `Highlighting ${Date.now()}`);
  });

  test.afterEach(async ({ page }) => {
    if (projectId) await cleanupProject(page, projectId);
  });

  test('new block constructs render as highlighted spans', async ({ page }) => {
    await createAdocFile(page, projectId, 'highlight.adoc', SAMPLE);
    await openProject(page, projectId);
    await openFile(page, 'highlight.adoc');

    // Each construct's text must be present in the editor.
    const content = page.locator('.cm-editor .cm-content');
    await expect(content).toContainText('ifdef::backend-html5[]');
    await expect(content).toContainText('[source,ruby]');
    await expect(content).toContainText(',===');

    // The conditional / block-attribute lines must be tokenised (rendered as
    // styled spans, not bare text nodes).
    const conditionalLine = page.locator('.cm-line', { hasText: 'ifdef::backend-html5[]' }).first();
    await expect(conditionalLine.locator('span').first()).toBeVisible();
    const attributeLine = page.locator('.cm-line', { hasText: '[source,ruby]' }).first();
    await expect(attributeLine.locator('span').first()).toBeVisible();
  });

  // T019/T020 — inline-construct rework: passthrough, inline/biblio anchors,
  // replacements, entities, callouts, and the thematic/page breaks now tokenize.
  // (Bare-URL / smart-quote / UI+math-macro / hard-break remain a tracked follow-up.)
  test('new inline & break constructs render as highlighted spans', async ({ page }) => {
    const sample = [
      '= Inline Sample',
      '',
      'A +literal+ passthrough and an [[inline-anchor]] here.',
      '',
      '[[[biblio-ref]]] Acme (C) brand a &amp; b.',
      '',
      'Press kbd:[Ctrl+S] and see stem:[x^2] inline.',
      '',
      'puts value <1>',
      '',
      "'''",
      '',
      '<<<',
      '',
    ].join('\n');

    await createAdocFile(page, projectId, 'inline.adoc', sample);
    await openProject(page, projectId);
    await openFile(page, 'inline.adoc');

    const content = page.locator('.cm-editor .cm-content');
    await expect(content).toContainText('+literal+');
    await expect(content).toContainText('[[inline-anchor]]');
    await expect(content).toContainText('[[[biblio-ref]]]');
    await expect(content).toContainText('kbd:[Ctrl+S]');

    // The passthrough/anchor line and the thematic-break line must render styled spans.
    const passLine = page.locator('.cm-line', { hasText: '+literal+' }).first();
    await expect(passLine.locator('span').first()).toBeVisible();
    const breakLine = page.locator('.cm-line', { hasText: "'''" }).first();
    await expect(breakLine.locator('span').first()).toBeVisible();
  });
});
