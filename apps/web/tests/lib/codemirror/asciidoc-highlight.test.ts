import fs from 'node:fs';
import path from 'node:path';
import { buildParser } from '@lezer/generator';
import { highlightTree } from '@lezer/highlight';
import type { LRParser } from '@lezer/lr';
import { asciidocHighlightStyle } from '@/lib/codemirror/asciidoc-theme';
import { asciidocHighlightTags } from '@/lib/codemirror/asciidoc-highlight-tags';
import {
  computeKnownRoleSpanMarks,
  registerInlineStyle,
  resetCustomInlineStyles,
} from '@/lib/codemirror/inline-style-registry';
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

  // T020 — every new US7 inline/break construct must resolve to a non-empty highlight class
  // through the production highlight style (so all five themes colour it). The offset points
  // inside the construct on each sample line.
  test.each([
    ['a +literal+ b\n', 3, 'passthrough'],
    ['x [[anchor]] y\n', 3, 'inline anchor'],
    ['[[[ref]]] z\n', 0, 'bibliography anchor'],
    ['Acme (C) co\n', 5, 'replacement'],
    ['a &amp; b\n', 2, 'entity'],
    ['code <1>\n', 5, 'callout'],
    ['press kbd:[Esc] x\n', 8, 'ui macro'],
    ['see stem:[x^2] y\n', 6, 'inline stem'],
    ['go https://x.com now\n', 5, 'bare url'],
    ['a "`smart`" quote\n', 2, 'smart quote'],
    ['line one +\ntwo\n', 9, 'hard break'],
    ["'''\n", 0, 'thematic break'],
    ['<<<\n', 0, 'page break'],
  ])('%j (offset %i) is highlighted as a %s', (source, offset) => {
    expect(classAt(source, offset)).not.toBe('');
  });

  // T044 (US11/FR-042) — inline `{set:name:value}` / `{set:name!}` assignments are highlighted as
  // attribute definitions (the same `t.meta` class as an `:name:` entry), so an inline assignment
  // reads as an attribute construct in the editor.
  test('an inline `{set:name:value}` assignment gets the AttributeEntry class', () => {
    // The `{set:...}` token spans the whole construct; offset 5+4 sits inside it.
    const setClass = classAt('Intro {set:basedir:src} end\n', 5 + 4);
    const entryClass = classAt(':one: x\n', 0); // a plain `:name:` attribute entry
    expect(setClass).not.toBe('');
    expect(setClass).toBe(entryClass);
  });

  test('an inline `{set:name!}` unset assignment is highlighted', () => {
    expect(classAt('Reset {set:basedir!} now\n', 6 + 4)).not.toBe('');
  });

  // T044 (US11/FR-042) — a multi-line wrapped attribute entry (a value continued with a trailing
  // `\`) highlights EVERY continued line as part of the same AttributeEntry, so the whole entry
  // reads as one attribute definition rather than the continuation falling back to plain prose.
  test('all lines of a `\\`-continued attribute entry get the AttributeEntry class', () => {
    const source = ':longval: first \\\nsecond \\\nthird\nbody\n';
    const entryClass = classAt(':one: x\n', 0); // a plain attribute entry's class
    expect(entryClass).not.toBe('');
    // The first physical line.
    expect(classAt(source, 0)).toBe(entryClass);
    // The second (continued) line — offset of `second`.
    expect(classAt(source, source.indexOf('second'))).toBe(entryClass);
    // The third (continued) line — offset of `third`.
    expect(classAt(source, source.indexOf('third'))).toBe(entryClass);
    // The following plain line is NOT part of the entry.
    expect(classAt(source, source.indexOf('body'))).not.toBe(entryClass);
  });

  // T048 (US14/FR-021b) — a role span `[.role]#text#` (and its unconstrained `##text##` form) is
  // tokenised as a RoleSpan and highlighted generically. EVERY role span — known or unknown — gets a
  // non-empty highlight class; the known-vs-unknown distinction is layered on by a decoration (below).
  describe('role spans highlight generically (US14)', () => {
    test('a `[.lead]#text#` role span is highlighted', () => {
      // `[.lead]#` is 8 chars; offset 9 sits inside the body.
      expect(classAt('A [.lead]#intro# end\n', 9 + 2)).not.toBe('');
    });

    test('an unconstrained `[.lead]##text##` role span is highlighted', () => {
      expect(classAt('A [.lead]##in##tro end\n', 9 + 3)).not.toBe('');
    });

    test('an UNKNOWN custom role still highlights generically', () => {
      // The role is not in the registry, yet the span is still a role span and is coloured.
      expect(classAt('A [.totally-custom]#x# end\n', 2 + 19)).not.toBe('');
    });

    test('a known and an unknown role span share the same generic grammar class', () => {
      const knownClass = classAt('[.lead]#x#\n', 8);
      const unknownClass = classAt('[.zzz]#x#\n', 7);
      expect(knownClass).not.toBe('');
      expect(knownClass).toBe(unknownClass);
    });
  });
});

// T068 (US12/FR-044; SC-016) — AsciiDoc constrained/unconstrained boundary rules. A constrained mark
// (single `*`/`_`/backtick) only forms emphasis when it abuts a word boundary; a mark embedded inside a
// word (`a*b*c`, `2*3*4`) is plain text. Unconstrained marks (`**`/`__`/double-backtick) form anywhere,
// including mid-word. The rule errs toward NO false highlights on ambiguity.
describe('constrained / unconstrained inline boundary rules (US12)', () => {
  test('genuine constrained `*bold*` is highlighted as strong', () => {
    // The `*` opens at offset 5 in `Some *bold* text`.
    expect(classAt('Some *bold* text\n', 6)).not.toBe('');
  });

  test('genuine constrained `_italic_` is highlighted', () => {
    expect(classAt('an _italic_ word\n', 4)).not.toBe('');
  });

  test('genuine constrained `` `mono` `` is highlighted', () => {
    expect(classAt('run `code` now\n', 5)).not.toBe('');
  });

  test('`a*b*c` does NOT highlight the embedded `*` as bold (constrained rule)', () => {
    // The `*` at offset 1 is surrounded by word chars — no emphasis.
    const boldClass = classAt('Some *bold* text\n', 6);
    expect(classAt('a*b*c here\n', 2)).not.toBe(boldClass);
  });

  test('`2*3*4` arithmetic does NOT bold', () => {
    const boldClass = classAt('Some *bold* text\n', 6);
    expect(classAt('2*3*4 done\n', 2)).not.toBe(boldClass);
  });

  test('`Vec<3>` is not falsely highlighted as bold/italic', () => {
    const boldClass = classAt('Some *bold* text\n', 6);
    expect(classAt('Vec<3> type\n', 4)).not.toBe(boldClass);
  });

  test('unconstrained `**bold**` is highlighted', () => {
    expect(classAt('a**bold**c word\n', 4)).not.toBe('');
  });

  test('unconstrained `__italic__` mid-word is highlighted', () => {
    // `un__der__score` — the inner mark is embedded in a word but unconstrained, so it forms.
    expect(classAt('un__der__score\n', 5)).not.toBe('');
  });

  test('a constrained bold span and an unconstrained bold span share the strong class', () => {
    const constrained = classAt('Some *bold* text\n', 6);
    const unconstrained = classAt('a**bold**c word\n', 4);
    expect(constrained).not.toBe('');
    expect(constrained).toBe(unconstrained);
  });
});

// T069 (US12/FR-045/046) — a cross-reference `<<id,label>>` distinguishes its target ID from its
// display label, and a table block-attribute line's `cols="…"` specifier is tokenized distinctly.
describe('xref target/label and table cols highlighting (US12)', () => {
  test('an xref target id `<<id,label>>` is highlighted', () => {
    // `See <<intro,Introduction>>` — `intro` begins at offset 6.
    expect(classAt('See <<intro,Introduction>> end\n', 6)).not.toBe('');
  });

  test('an xref label is highlighted distinctly from the target', () => {
    const source = 'See <<intro,Introduction>> end\n';
    const targetClass = classAt(source, 6); // inside `intro`
    const labelClass = classAt(source, source.indexOf('Introduction')); // inside the label
    expect(targetClass).not.toBe('');
    expect(labelClass).not.toBe('');
    expect(targetClass).not.toBe(labelClass);
  });

  test('a bare `<<id>>` (no label) still highlights the target', () => {
    expect(classAt('See <<intro>> end\n', 6)).not.toBe('');
  });

  test('a table `[cols="1,>2"]` column spec is tokenized and highlighted', () => {
    const source = '[cols="1,>2"]\n';
    // The `1,>2` cols value begins at offset 7.
    expect(classAt(source, 8)).not.toBe('');
  });

  test('a `[cols="1,1,1"]` spec is tokenized', () => {
    expect(classAt('[cols="1,1,1"]\n', 8)).not.toBe('');
  });
});

// T048 (US14/FR-021c) — the registry-driven decoration gives KNOWN roles a distinct emphasis on top of
// the generic grammar highlight, while leaving unknown roles with only the generic class. This is the
// known-vs-unknown layer; registering a custom role flips it on with no logic change.
describe('known role-span emphasis (US14)', () => {
  afterEach(() => resetCustomInlineStyles());

  test('a built-in role span is marked as known', () => {
    const marks = computeKnownRoleSpanMarks('A [.lead]#intro# end\n');
    expect(marks).toHaveLength(1);
    expect(marks[0].from).toBe(2);
    expect(marks[0].to).toBe('A [.lead]#intro#'.length);
  });

  test('an unknown role span is NOT marked as known', () => {
    expect(computeKnownRoleSpanMarks('A [.mystery]#x# end\n')).toHaveLength(0);
  });

  test('registering a custom role makes its span known — no logic change', () => {
    expect(computeKnownRoleSpanMarks('[.brandy]#x#\n')).toHaveLength(0);
    registerInlineStyle('brandy');
    expect(computeKnownRoleSpanMarks('[.brandy]#x#\n')).toHaveLength(1);
  });

  test('a multi-role span counts as known when ANY role is known', () => {
    expect(computeKnownRoleSpanMarks('[.unknownrole.lead]#x#\n')).toHaveLength(1);
  });
});
