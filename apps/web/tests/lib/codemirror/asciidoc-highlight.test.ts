import fs from 'node:fs';
import path from 'node:path';
import { buildParser } from '@lezer/generator';
import { highlightTree } from '@lezer/highlight';
import type { LRParser } from '@lezer/lr';
import { asciidocHighlightStyle } from '@/lib/codemirror/asciidoc-theme';
import { asciidocHighlightTags } from '@/lib/codemirror/asciidoc-highlight-tags';
import { createTestBlockTokenizer } from '../../helpers/asciidoc-test-tokenizer';

/**
 * Highlight-consistency tests: each list/block construct added by feature 021 must receive the
 * SAME highlight class as its existing sibling, so the new tokens stay in lockstep with the
 * editor's colouring (no behaviour/highlight divergence). The parser is built from the grammar
 * source (the generated `asciidoc-parser.js` is ESM and not loadable here) and configured with
 * the production `asciidocHighlightTags`; classes are resolved through `asciidocHighlightStyle`
 * from `asciidoc-theme.ts`, the authoritative colour source (applied at `Prec.highest`).
 */

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

describe('AsciiDoc highlight consistency', () => {
  test('a .... literal block body gets the same class as a ---- listing block body', () => {
    // Both bodies start at offset 5 ('....\n' / '----\n' are 5 chars).
    const literalClass = classAt('....\nlit\n....\n', 5);
    const listingClass = classAt('----\nlit\n----\n', 5);
    expect(literalClass).not.toBe('');
    expect(literalClass).toBe(listingClass);
  });

  test('explicit `1. x` gets the same class as implicit `. x` (US2)', () => {
    const explicitClass = classAt('1. x\n', 0);
    const implicitClass = classAt('. x\n', 0);
    expect(explicitClass).not.toBe('');
    expect(explicitClass).toBe(implicitClass);
  });

  test('dash checklist `- [ ] x` gets the same class as `* [ ] x` (US3)', () => {
    const dashClass = classAt('- [ ] x\n', 0);
    const starClass = classAt('* [ ] x\n', 0);
    expect(dashClass).not.toBe('');
    expect(dashClass).toBe(starClass);
  });

  test('`Term;; x` gets the same class as `Term:: x` (US4)', () => {
    // Both separators sit at offset 4 (after the 4-char term `Term`).
    const semicolonClass = classAt('Term;; x\n', 4);
    const colonClass = classAt('Term:: x\n', 4);
    expect(semicolonClass).not.toBe('');
    expect(semicolonClass).toBe(colonClass);
  });
});
