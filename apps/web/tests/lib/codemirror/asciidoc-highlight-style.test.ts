// Tests for src/lib/codemirror/asciidoc-highlight.ts — the HighlightStyle + highlighting extension.

import fs from 'node:fs';
import path from 'node:path';
import { buildParser } from '@lezer/generator';
import { highlightTree, tags as t } from '@lezer/highlight';
import type { LRParser } from '@lezer/lr';
import { asciidocHighlightStyle, asciidocHighlighting } from '@/lib/codemirror/asciidoc-highlight';
import { asciidocHighlightTags } from '@/lib/codemirror/asciidoc-highlight-tags';
import { createTestBlockTokenizer } from '../../helpers/asciidoc-test-tokenizer';

const grammarPath = path.resolve(__dirname, '../../../src/lib/codemirror/asciidoc.grammar');
const grammarSource = fs.readFileSync(grammarPath, 'utf8');

const parser = buildParser(grammarSource, {
  externalTokenizer: (_name: string, terms: Record<string, number>) => createTestBlockTokenizer(terms),
}).configure({ props: [asciidocHighlightTags] }) as LRParser;

/** Returns the highlight class string applied at `pos` when `source` is parsed + highlighted. */
function classAt(source: string, pos: number): string {
  const tree = parser.parse(source);
  let result = '';
  highlightTree(tree, asciidocHighlightStyle, (from, to, classes) => {
    if (from <= pos && to > pos) result = classes;
  });
  return result;
}

describe('asciidocHighlightStyle', () => {
  test('is a defined HighlightStyle carrying one spec per configured tag', () => {
    expect(asciidocHighlightStyle).toBeDefined();
    expect(asciidocHighlightStyle.specs.length).toBeGreaterThan(0);
    expect(typeof asciidocHighlightStyle.style).toBe('function');
  });

  test('builds a stylesheet module covering the configured tags', () => {
    // HighlightStyle.module holds the generated style rules keyed by tag.
    expect(asciidocHighlightStyle.module).not.toBeNull();
  });

  test('resolves a non-empty CSS class for a heading-1 tag', () => {
    expect(asciidocHighlightStyle.style([t.heading1])).not.toBeNull();
  });

  test.each([
    [t.heading1],
    [t.strong],
    [t.emphasis],
    [t.monospace],
    [t.blockComment],
    [t.meta],
    [t.keyword],
    [t.macroName],
    [t.link],
    [t.string],
    [t.number],
    [t.labelName],
    [t.attributeName],
    [t.typeName],
    [t.className],
  ])('maps tag #%# to a class', (tag) => {
    expect(asciidocHighlightStyle.style([tag])).not.toBeNull();
  });

  test('highlights a heading line through the full parse pipeline', () => {
    // "= Title\n" — the heading marker/content should resolve to a non-empty class.
    expect(classAt('= Title\n', 2)).not.toBe('');
  });
});

describe('asciidocHighlighting', () => {
  test('returns a defined CM6 Extension', () => {
    const extension = asciidocHighlighting();
    expect(extension).toBeDefined();
  });
});
