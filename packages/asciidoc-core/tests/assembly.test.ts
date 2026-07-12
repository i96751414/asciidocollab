import {
  assembleIncludes,
  type AssembleIncludesDependencies,
  type SandboxPathResolver,
} from '../src';

// A minimal in-memory sandbox resolver mirroring the boundary contract the primitive depends on:
// reject remote/absolute/traversal targets, otherwise fold to a project-relative path.
const resolver: SandboxPathResolver = (fromPath, target) => {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(target)) return { ok: false, reason: 'remote' };
  if (target.startsWith('/')) return { ok: false, reason: 'absolute' };
  const segments = fromPath.split('/').slice(0, -1);
  for (const segment of target.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      if (segments.length === 0) return { ok: false, reason: 'traversal' };
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  if (segments.length === 0) return { ok: false, reason: 'traversal' };
  return { ok: true, path: segments.join('/') };
};

function deps(files: Record<string, string>): AssembleIncludesDependencies {
  return {
    readFile: (path) => (path in files ? files[path] : null),
    resolveSandboxedPath: resolver,
    buildPlaceholder: (target) => `[placeholder ${target}]`,
  };
}

describe('assembleIncludes shared primitive', () => {
  it('inlines an in-sandbox include', () => {
    const result = assembleIncludes('main.adoc', deps({
      'main.adoc': 'Intro\ninclude::child.adoc[]\nOutro',
      'child.adoc': 'Child body',
    }));
    expect(result.content).toBe('Intro\nChild body\nOutro');
    expect(result.unresolved).toEqual([]);
  });

  it('reports a missing root document', () => {
    const result = assembleIncludes('nope.adoc', deps({}));
    expect(result.content).toBe('');
    expect(result.unresolved).toEqual([{ from: '', target: 'nope.adoc', reason: 'not-found' }]);
  });

  it('marks a missing include target without reading it', () => {
    const result = assembleIncludes('main.adoc', deps({ 'main.adoc': 'include::gone.adoc[]' }));
    expect(result.content).toContain('Unresolved directive in main.adoc - include::gone.adoc[]');
    expect(result.unresolved).toEqual([{ from: 'main.adoc', target: 'gone.adoc', reason: 'not-found' }]);
  });

  it('rejects a remote target via the injected sandbox boundary', () => {
    const result = assembleIncludes('main.adoc', deps({ 'main.adoc': 'include::https://evil/x.adoc[]' }));
    expect(result.unresolved[0].reason).toBe('remote');
    expect(result.content).toContain('Unresolved directive');
  });

  it('guards a cycle', () => {
    const result = assembleIncludes('a.adoc', deps({
      'a.adoc': 'include::b.adoc[]',
      'b.adoc': 'include::a.adoc[]',
    }));
    expect(result.unresolved.some((u) => u.reason === 'cycle')).toBe(true);
  });

  it('guards excessive depth', () => {
    const result = assembleIncludes('main.adoc', deps({
      'main.adoc': 'include::child.adoc[]',
      'child.adoc': 'body',
    }), { maxDepth: 0 });
    expect(result.unresolved).toEqual([{ from: 'main.adoc', target: 'child.adoc', reason: 'depth' }]);
  });

  it('caps total expansions (fan-out budget)', () => {
    const result = assembleIncludes('main.adoc', deps({
      'main.adoc': 'include::child.adoc[]',
      'child.adoc': 'body',
    }), { maxExpansions: 0 });
    expect(result.unresolved).toEqual([{ from: 'main.adoc', target: 'child.adoc', reason: 'limit' }]);
  });

  it('applies a tags= filter', () => {
    const result = assembleIncludes('main.adoc', deps({
      'main.adoc': 'include::child.adoc[tags=a]',
      'child.adoc': '// tag::a[]\nAlpha\n// end::a[]\nBeta',
    }));
    expect(result.content).toBe('Alpha');
  });

  it('applies a lines= filter', () => {
    const result = assembleIncludes('main.adoc', deps({
      'main.adoc': 'include::child.adoc[lines=2]',
      'child.adoc': 'L1\nL2\nL3',
    }));
    expect(result.content).toBe('L2');
  });

  it('emits scoped leveloffset around an include option', () => {
    const result = assembleIncludes('main.adoc', deps({
      'main.adoc': 'include::child.adoc[leveloffset=+1]\nAfter',
      'child.adoc': '== Child',
    }));
    expect(result.content).toBe(':leveloffset: 1\n== Child\n:leveloffset: 0\nAfter');
  });

  it('gates an include inside an inactive conditional region (target never read)', () => {
    const files = {
      'main.adoc': 'ifdef::flag[]\ninclude::child.adoc[]\nendif::[]',
      'child.adoc': 'Secret',
    };
    const off = assembleIncludes('main.adoc', deps(files));
    expect(off.content).not.toContain('Secret');
    expect(off.content).toContain('ifdef::flag[]');

    const on = assembleIncludes('main.adoc', deps(files), { seedAttributes: new Map([['flag', '']]) });
    expect(on.content).toContain('Secret');
  });

  it('substitutes {attr} in the target using seeded + document attributes', () => {
    const result = assembleIncludes('main.adoc', deps({
      'main.adoc': 'include::{partsdir}/c.adoc[]',
      'parts/c.adoc': 'Part body',
    }), { seedAttributes: new Map([['partsdir', 'parts']]) });
    expect(result.content).toBe('Part body');
  });

  it('hide mode suppresses the body but preserves attribute state via a placeholder', () => {
    const result = assembleIncludes('main.adoc', deps({
      'main.adoc': 'include::child.adoc[]',
      'child.adoc': ':foo: bar\nHello',
    }), { showIncludes: false });
    expect(result.content).toContain('[placeholder child.adoc]');
    expect(result.content).toContain(':foo: bar');
    expect(result.content).not.toContain('Hello');
  });

  it('produces a source map parallel to the assembled content', () => {
    const result = assembleIncludes('main.adoc', deps({
      'main.adoc': 'Intro\ninclude::child.adoc[]',
      'child.adoc': 'Child',
    }), { withSourceMap: true });
    expect(result.sourceMap).toBeDefined();
    expect(result.sourceMap!.lineToSource).toHaveLength(result.content.split('\n').length);
    expect(result.sourceMap!.lineToSource[0]).toEqual({ path: 'main.adoc', sourceLine: 1 });
  });
});
