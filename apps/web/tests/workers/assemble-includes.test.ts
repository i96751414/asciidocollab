import { assembleIncludes } from '@/workers/assemble-includes';

function reader(files: Record<string, string>) {
  return (path: string) => files[path] ?? null;
}

describe('assembleIncludes — sandbox-gated include assembly (US8/FR-068, Constitution IX)', () => {
  test('inlines a resolvable sibling include', () => {
    const files = {
      'main.adoc': '= Book\n\ninclude::chapter.adoc[]\n',
      'chapter.adoc': '== Chapter\n\nBody.\n',
    };
    const { content, unresolved } = assembleIncludes('main.adoc', reader(files));
    expect(content).toContain('== Chapter');
    expect(content).toContain('Body.');
    expect(content).not.toContain('include::');
    expect(unresolved).toEqual([]);
  });

  test('assembles transitively (nested includes)', () => {
    const files = {
      'main.adoc': 'include::a.adoc[]\n',
      'a.adoc': 'A\ninclude::b.adoc[]\n',
      'b.adoc': 'B\n',
    };
    const { content } = assembleIncludes('main.adoc', reader(files));
    expect(content).toContain('A');
    expect(content).toContain('B');
    expect(content).not.toContain('include::');
  });

  test('rejects a parent-traversal target without reading it (Constitution IX)', () => {
    const reads: string[] = [];
    const read = (path: string) => {
      reads.push(path);
      return ({ 'main.adoc': 'include::../secret.adoc[]\n' } as Record<string, string>)[path] ?? null;
    };
    const { content, unresolved } = assembleIncludes('main.adoc', read);
    expect(content).toContain('Unresolved directive');
    expect(reads).not.toContain('../secret.adoc');
    expect(unresolved[0]).toMatchObject({ target: '../secret.adoc', reason: 'traversal' });
  });

  test('rejects an absolute target', () => {
    const files = { 'main.adoc': 'include::/etc/passwd[]\n' };
    const { unresolved } = assembleIncludes('main.adoc', reader(files));
    expect(unresolved[0]).toMatchObject({ reason: 'absolute' });
  });

  test('rejects a remote target', () => {
    const files = { 'main.adoc': 'include::https://evil.example/x.adoc[]\n' };
    const { unresolved } = assembleIncludes('main.adoc', reader(files));
    expect(unresolved[0]).toMatchObject({ reason: 'remote' });
  });

  test('rejects a percent-encoded traversal (double-decode guard)', () => {
    const files = { 'main.adoc': 'include::%2e%2e/secret.adoc[]\n' };
    const { unresolved, content } = assembleIncludes('main.adoc', reader(files));
    expect(content).toContain('Unresolved directive');
    expect(unresolved).toHaveLength(1);
  });

  test('guards against include cycles', () => {
    const files = {
      'a.adoc': 'A\ninclude::b.adoc[]\n',
      'b.adoc': 'B\ninclude::a.adoc[]\n',
    };
    const { content, unresolved } = assembleIncludes('a.adoc', reader(files));
    expect(content).toContain('A');
    expect(content).toContain('B');
    expect(unresolved.some((u) => u.reason === 'cycle')).toBe(true);
  });

  test('marks a missing (but in-sandbox) target as unresolved', () => {
    const files = { 'main.adoc': 'include::gone.adoc[]\n' };
    const { unresolved } = assembleIncludes('main.adoc', reader(files));
    expect(unresolved[0]).toMatchObject({ target: 'gone.adoc', reason: 'not-found' });
  });

  test('wraps an include with a leveloffset attribute in :leveloffset: push/pop', () => {
    const files = {
      'main.adoc': 'include::ch.adoc[leveloffset=+1]\n',
      'ch.adoc': '== Section\n',
    };
    const { content } = assembleIncludes('main.adoc', reader(files));
    expect(content).toContain(':leveloffset: +1');
    expect(content).toContain('== Section');
    expect(content).toContain(':leveloffset: -1');
  });

  test('respects a maxDepth bound', () => {
    const files = {
      'a.adoc': 'A\ninclude::b.adoc[]\n',
      'b.adoc': 'B\ninclude::c.adoc[]\n',
      'c.adoc': 'C\n',
    };
    const { content, unresolved } = assembleIncludes('a.adoc', reader(files), { maxDepth: 1 });
    expect(content).toContain('A');
    expect(content).toContain('B');
    expect(content).not.toContain('C');
    expect(unresolved.some((u) => u.reason === 'depth')).toBe(true);
  });

  test('leaves a document with no includes byte-identical (scroll-sync regression, Constitution VIII)', () => {
    const source = '= Title\n\n== One\n\nText with a colon: value.\n\n=== Two\n';
    const { content, unresolved } = assembleIncludes('main.adoc', reader({ 'main.adoc': source }));
    expect(content).toBe(source);
    expect(unresolved).toEqual([]);
  });

  test('a missing root yields empty content and a not-found entry', () => {
    const { content, unresolved } = assembleIncludes('nope.adoc', reader({}));
    expect(content).toBe('');
    expect(unresolved[0]).toMatchObject({ target: 'nope.adoc', reason: 'not-found' });
  });
});
