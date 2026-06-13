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

describe('computeDiagnostics (FR-032/033/050/060)', () => {
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

  test('flags an unresolved include', () => {
    const content = 'include::nope.adoc[]\n';
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

describe('asciidocDiagnosticsSource (open-file scope, FR-047)', () => {
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
