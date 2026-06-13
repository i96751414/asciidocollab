import { computeDiagnostics } from '@/lib/codemirror/asciidoc-diagnostics';
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
