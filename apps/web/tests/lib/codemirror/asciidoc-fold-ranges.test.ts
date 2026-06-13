import { EditorState } from '@codemirror/state';
import type { SyntaxNode } from '@lezer/common';
import {
  foldRangeForSection,
  foldRangeForConditional,
  foldRangeForCommentRun,
  foldRangeForAttributeRun,
  foldRangeForBlock,
  foldRangeForTable,
} from '@/lib/codemirror/asciidoc-fold';

function state(documentContent: string): EditorState {
  return EditorState.create({ doc: documentContent });
}

/** Offset of the start of 1-based line `n`. */
function lineStart(editorState: EditorState, n: number): number {
  return editorState.doc.line(n).from;
}

/** Minimal SyntaxNode stub exercising the delimited-fold range math. */
function fakeNode(name: string, firstChildTo: number, lastChildFrom: number): SyntaxNode {
  return {
    type: { name },
    firstChild: { to: firstChildTo },
    lastChild: { from: lastChildFrom },
  } as unknown as SyntaxNode;
}

describe('foldRangeForSection (FR-012)', () => {
  const source = '= Title\n\n== One\n\nbody of one\n\n=== Sub\n\nsub body\n\n== Two\n\nbody two\n';

  test('folds a section to just before the next same-level heading', () => {
    const editorState = state(source);
    const range = foldRangeForSection(editorState, lineStart(editorState, 3)); // "== One"
    expect(range).not.toBeNull();
    // The folded text includes the subsection but stops before "== Two".
    const hidden = source.slice(range!.from, range!.to);
    expect(hidden).toContain('body of one');
    expect(hidden).toContain('=== Sub');
    expect(hidden).not.toContain('== Two');
  });

  test('a non-heading line is not a foldable section', () => {
    const editorState = state(source);
    expect(foldRangeForSection(editorState, lineStart(editorState, 5))).toBeNull();
  });

  test('a discrete heading does not start a section fold', () => {
    const editorState = state('[discrete]\n== Discrete\n\nbody\n');
    expect(foldRangeForSection(editorState, lineStart(editorState, 2))).toBeNull();
  });
});

describe('foldRangeForConditional (FR-014/051)', () => {
  test('folds ifdef … endif', () => {
    const source = 'ifdef::env[]\nline a\nline b\nendif::[]\n';
    const editorState = state(source);
    const range = foldRangeForConditional(editorState, lineStart(editorState, 1));
    expect(range).not.toBeNull();
    const hidden = source.slice(range!.from, range!.to);
    expect(hidden).toContain('line a');
    expect(hidden).toContain('line b');
  });

  test('nesting-safe: matches the outer endif', () => {
    const source = 'ifdef::a[]\nx\nifdef::b[]\ny\nendif::[]\nz\nendif::[]\n';
    const editorState = state(source);
    const range = foldRangeForConditional(editorState, lineStart(editorState, 1));
    const hidden = source.slice(range!.from, range!.to);
    expect(hidden).toContain('z'); // up to the OUTER endif
  });

  test('unterminated conditional → null', () => {
    const editorState = state('ifdef::env[]\nbody\n');
    expect(foldRangeForConditional(editorState, lineStart(editorState, 1))).toBeNull();
  });

  test('an inline single-line conditional (ifdef::name[text]) is not a block opener', () => {
    // The inline form carries content in the brackets and has no matching endif.
    const editorState = state('ifdef::env[shown inline]\n');
    expect(foldRangeForConditional(editorState, lineStart(editorState, 1))).toBeNull();
  });

  test('an inline conditional inside a block does not inflate nesting depth', () => {
    const source = 'ifdef::env[]\nintro\nifdef::flag[inline note]\nbody\nendif::[]\ntail\n';
    const editorState = state(source);
    const range = foldRangeForConditional(editorState, lineStart(editorState, 1));
    expect(range).not.toBeNull();
    const hidden = source.slice(range!.from, range!.to);
    expect(hidden).toContain('body'); // folds up to the single endif…
    expect(hidden).not.toContain('tail'); // …without being thrown off by the inline directive
  });

  test('folds an ifeval block', () => {
    const source = 'ifeval::["{ver}" == "1"]\nonly for v1\nendif::[]\n';
    const editorState = state(source);
    const range = foldRangeForConditional(editorState, lineStart(editorState, 1));
    expect(range).not.toBeNull();
    expect(source.slice(range!.from, range!.to)).toContain('only for v1');
  });
});

describe('foldRangeForCommentRun (FR-013)', () => {
  test('folds ≥2 consecutive // lines', () => {
    const editorState = state('// one\n// two\n// three\ntext\n');
    expect(foldRangeForCommentRun(editorState, lineStart(editorState, 1))).not.toBeNull();
  });
  test('a single // line is not foldable', () => {
    const editorState = state('// only\ntext\n');
    expect(foldRangeForCommentRun(editorState, lineStart(editorState, 1))).toBeNull();
  });
  test('//// (comment block delimiter) is not a comment run', () => {
    const editorState = state('////\nbody\n////\n');
    expect(foldRangeForCommentRun(editorState, lineStart(editorState, 1))).toBeNull();
  });
});

describe('foldRangeForAttributeRun (FR-013)', () => {
  test('folds ≥2 consecutive :name: lines', () => {
    const editorState = state(':author: A\n:version: 1\n:toc:\nbody\n');
    expect(foldRangeForAttributeRun(editorState, lineStart(editorState, 1))).not.toBeNull();
  });
  test('a single attribute entry is not foldable', () => {
    const editorState = state(':author: A\nbody\n');
    expect(foldRangeForAttributeRun(editorState, lineStart(editorState, 1))).toBeNull();
  });
});

describe('foldRangeForBlock / foldRangeForTable (FR-012)', () => {
  test('folds a LiteralBlock body', () => {
    const source = '....\nx\n....\n';
    const range = foldRangeForBlock(fakeNode('LiteralBlock', 5, 7), state(source));
    expect(range).toEqual({ from: 4, to: 6 });
  });
  test('folds an AdmonitionBlock', () => {
    const source = '[NOTE]\n====\nnote\n====\n';
    const range = foldRangeForBlock(fakeNode('AdmonitionBlock', 7, 17), state(source));
    expect(range).not.toBeNull();
  });
  test('foldRangeForBlock ignores table nodes', () => {
    expect(foldRangeForBlock(fakeNode('TableBlock', 5, 10), state('|===\na\n|===\n'))).toBeNull();
  });
  test('folds PSV / CSV / DSV tables', () => {
    expect(foldRangeForTable(fakeNode('TableBlock', 5, 10), state('|===\na\n|===\n'))).not.toBeNull();
    expect(foldRangeForTable(fakeNode('CsvTableBlock', 5, 10), state(',===\na\n,===\n'))).not.toBeNull();
    expect(foldRangeForTable(fakeNode('DsvTableBlock', 5, 10), state(':===\na\n:===\n'))).not.toBeNull();
  });
});
