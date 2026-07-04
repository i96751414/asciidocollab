import type { EditorView } from '@codemirror/view';
import { asciidocDiagnosticsSource, computeDiagnostics } from '@/lib/codemirror/asciidoc-diagnostics';
import { buildProjectSymbolIndex, makeIncludeResolver } from '@/lib/codemirror/asciidoc-symbol-index';

function indexFor(files: Record<string, { path: string; content: string }>, root: string) {
  const pathToId = Object.fromEntries(Object.entries(files).map(([id, f]) => [f.path, id]));
  return buildProjectSymbolIndex(
    root,
    (id) => files[id]?.content ?? null,
    makeIncludeResolver((id) => files[id]?.path ?? null, (p) => pathToId[p] ?? null),
  );
}

describe('computeDiagnostics', () => {
  test('flags an unknown xref', () => {
    const content = 'See <<missing>>.\n';
    const index = indexFor({ a: { path: 'a.adoc', content } }, 'a');
    const codes = computeDiagnostics(index, 'a', content).map((d) => d.code);
    expect(codes).toContain('unknown-xref');
  });

  test('does not flag a resolvable xref', () => {
    const content = '[[here]]\n== Here\n\nSee <<here>>.\n';
    const index = indexFor({ a: { path: 'a.adoc', content } }, 'a');
    expect(computeDiagnostics(index, 'a', content).some((d) => d.code === 'unknown-xref')).toBe(false);
  });

  test('flags an undefined attribute but allows built-ins', () => {
    const content = 'Value {nope} and {toc}.\n:defined: x\nUse {defined}.\n';
    const index = indexFor({ a: { path: 'a.adoc', content } }, 'a');
    const flagged = computeDiagnostics(index, 'a', content)
      .filter((d) => d.code === 'undefined-attribute')
      .map((d) => d.message.replace('Undefined attribute: ', ''));
    expect(flagged).toContain('nope');
    expect(flagged).not.toContain('toc'); // built-in
    expect(flagged).not.toContain('defined'); // defined earlier in the doc
  });

  test('flags a duplicate id', () => {
    const content = '[[dup]]\nA\n\n[[dup]]\nB\n';
    const index = indexFor({ a: { path: 'a.adoc', content } }, 'a');
    expect(computeDiagnostics(index, 'a', content).some((d) => d.code === 'duplicate-id')).toBe(true);
  });

  test('does not flag same-text headings when an explicit id disambiguates them', () => {
    const content = '====== Section 2.222\n\n== Section 3\n\n[#install-guide]\n====== Section 2.222\n';
    const index = indexFor({ a: { path: 'a.adoc', content } }, 'a');
    expect(computeDiagnostics(index, 'a', content).some((d) => d.code === 'duplicate-id')).toBe(false);
  });

  test('flags an unresolved include', () => {
    const content = 'include::nope.adoc[]\n';
    const index = indexFor({ a: { path: 'a.adoc', content } }, 'a');
    expect(computeDiagnostics(index, 'a', content).some((d) => d.code === 'unresolved-include')).toBe(true);
  });

  test('resolves an include whose target uses an attribute reference', () => {
    const files = {
      a: { path: 'a.adoc', content: ':partsdir: parts\n\ninclude::{partsdir}/intro.adoc[]\n' },
      b: { path: 'parts/intro.adoc', content: '== Intro\n' },
    };
    const index = indexFor(files, 'a');
    expect(computeDiagnostics(index, 'a', files.a.content).some((d) => d.code === 'unresolved-include')).toBe(false);
  });

  test('flags an include whose attribute is undefined', () => {
    const content = 'include::{missing}/intro.adoc[]\n';
    const index = indexFor({ a: { path: 'a.adoc', content } }, 'a');
    expect(computeDiagnostics(index, 'a', content).some((d) => d.code === 'unresolved-include')).toBe(true);
  });

  test('flags an unterminated block', () => {
    const content = '----\ncode without a closing fence\n';
    const index = indexFor({ a: { path: 'a.adoc', content } }, 'a');
    expect(computeDiagnostics(index, 'a', content).some((d) => d.code === 'unterminated-block')).toBe(true);
  });

  test('a balanced block is not flagged', () => {
    const content = '----\ncode\n----\n';
    const index = indexFor({ a: { path: 'a.adoc', content } }, 'a');
    expect(computeDiagnostics(index, 'a', content).some((d) => d.code === 'unterminated-block')).toBe(false);
  });

  test('a duplicate id defined across two files is only flagged in the linted file', () => {
    // The same anchor id is defined in both files; computeDiagnostics for `a`
    // reports only `a`'s occurrence (the other file's duplicate is filtered out).
    const files = {
      a: { path: 'a.adoc', content: '[[dup]]\nA\ninclude::b.adoc[]\n' },
      b: { path: 'b.adoc', content: '[[dup]]\nB\n' },
    };
    const index = indexFor(files, 'a');
    const dupA = computeDiagnostics(index, 'a', files.a.content).filter((d) => d.code === 'duplicate-id');
    const dupB = computeDiagnostics(index, 'b', files.b.content).filter((d) => d.code === 'duplicate-id');
    expect(dupA).toHaveLength(1);
    expect(dupB).toHaveLength(1);
  });

  test('an unresolved include in another file is not attributed to the linted file', () => {
    // The root file `a` has the bad include; linting child `b` must not surface it.
    const files = {
      a: { path: 'a.adoc', content: 'include::ghost.adoc[]\ninclude::b.adoc[]\n' },
      b: { path: 'b.adoc', content: 'plain body\n' },
    };
    const index = indexFor(files, 'a');
    expect(computeDiagnostics(index, 'b', files.b.content).some((d) => d.code === 'unresolved-include')).toBe(false);
    expect(computeDiagnostics(index, 'a', files.a.content).some((d) => d.code === 'unresolved-include')).toBe(true);
  });
});

describe('buildProjectSymbolIndex activeFileId', () => {
  test('defaults activeFileId to the root file', () => {
    const index = indexFor({ a: { path: 'a.adoc', content: 'x\n' } }, 'a');
    expect(index.activeFileId).toBe('a');
  });

  test('records an explicit activeFileId distinct from the root', () => {
    const files = {
      main: { path: 'main.adoc', content: 'include::chapter.adoc[]\n' },
      chapter: { path: 'chapter.adoc', content: 'See <<ghost>>.\n' },
    };
    const pathToId = Object.fromEntries(Object.entries(files).map(([id, f]) => [f.path, id]));
    const index = buildProjectSymbolIndex(
      'main',
      (id) => files[id as keyof typeof files]?.content ?? null,
      makeIncludeResolver(
        (id) => files[id as keyof typeof files]?.path ?? null,
        (p) => pathToId[p] ?? null,
      ),
      'chapter',
    );
    expect(index.activeFileId).toBe('chapter');
  });
});

function fakeView(content: string): EditorView {
  return { state: { doc: { toString: () => content } } } as unknown as EditorView;
}

describe('asciidocDiagnosticsSource (open-file scope)', () => {
  test('lints the open file, not the configured main-file root', () => {
    // main.adoc (root) is valid; the open chapter.adoc has an unknown xref.
    const files = {
      main: { path: 'main.adoc', content: '[[intro]]\n== Intro\n\nSee <<intro>>.\ninclude::chapter.adoc[]\n' },
      chapter: { path: 'chapter.adoc', content: 'See <<ghost>>.\n' },
    };
    const pathToId = Object.fromEntries(Object.entries(files).map(([id, f]) => [f.path, id]));
    const index = buildProjectSymbolIndex(
      'main',
      (id) => files[id as keyof typeof files]?.content ?? null,
      makeIncludeResolver(
        (id) => files[id as keyof typeof files]?.path ?? null,
        (p) => pathToId[p] ?? null,
      ),
      'chapter',
    );
    const source = asciidocDiagnosticsSource(() => index);
    const messages = source(fakeView(files.chapter.content)).map((d) => d.message);
    expect(messages).toContain('Unknown cross-reference: ghost');
  });
});

describe('asciidocDiagnosticsSource current-file fallback', () => {
  test('with no cross-file index getter, lints the open document alone', () => {
    // The default getIndex returns null, so the source builds a current-file-only
    // index from the open buffer and still flags same-file issues.
    const source = asciidocDiagnosticsSource();
    const content = 'See <<ghost>>.\nUse {undef}.\n----\nunterminated\n';
    const messages = source(fakeView(content)).map((d) => d.message);
    expect(messages).toContain('Unknown cross-reference: ghost');
    expect(messages).toContain('Undefined attribute: undef');
    expect(messages.some((m) => m.startsWith('Unterminated block:'))).toBe(true);
  });

  test('an explicit null-returning getter also uses the current-file fallback', () => {
    const source = asciidocDiagnosticsSource(() => null);
    const content = '[[a]]\nA\n\n[[a]]\nB\n';
    const codes = source(fakeView(content)).map((d) => d.severity);
    // duplicate-id is an error severity in the mapped lint diagnostic.
    expect(codes).toContain('error');
  });

  test('current-file fallback produces no diagnostics for a clean document', () => {
    const source = asciidocDiagnosticsSource();
    const content = '[[here]]\n== Here\n\nSee <<here>>.\n';
    expect(source(fakeView(content))).toEqual([]);
  });
});
