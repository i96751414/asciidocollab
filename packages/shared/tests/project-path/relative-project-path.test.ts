import { relativeProjectPath, toProjectRelative } from '../../src/project-path/relative-project-path';
import { resolveSandboxedPath } from '../../src/project-path/resolve-sandboxed-path';

describe('relativeProjectPath', () => {
  it('returns the bare basename for two files in the same directory', () => {
    expect(relativeProjectPath('docs/book.adoc', 'docs/intro.adoc')).toBe('intro.adoc');
  });

  it('descends into a subdirectory', () => {
    expect(relativeProjectPath('book.adoc', 'chapters/one.adoc')).toBe('chapters/one.adoc');
  });

  it('ascends with `..` when the target is in a parent directory', () => {
    expect(relativeProjectPath('chapters/one.adoc', 'shared.adoc')).toBe('../shared.adoc');
  });

  it('combines ascent and descent across sibling trees', () => {
    expect(relativeProjectPath('a/b/from.adoc', 'a/c/to.adoc')).toBe('../c/to.adoc');
  });

  it('strips leading slashes from FilePath-style inputs', () => {
    expect(relativeProjectPath('/docs/book.adoc', '/docs/intro.adoc')).toBe('intro.adoc');
  });

  it('falls back to the basename for an identical path', () => {
    expect(relativeProjectPath('docs/a.adoc', 'docs/a.adoc')).toBe('a.adoc');
  });

  it('is the inverse of resolveSandboxedPath (round-trips back to the target)', () => {
    const cases: Array<[string, string]> = [
      ['docs/book.adoc', 'docs/intro.adoc'],
      ['book.adoc', 'chapters/one.adoc'],
      ['chapters/one.adoc', 'shared.adoc'],
      ['a/b/from.adoc', 'a/c/to.adoc'],
      ['deep/nested/from.adoc', 'top.adoc'],
    ];
    for (const [from, to] of cases) {
      const relative = relativeProjectPath(from, to);
      const resolved = resolveSandboxedPath(from, relative);
      expect(resolved.ok && resolved.path).toBe(to);
    }
  });
});

describe('toProjectRelative', () => {
  it('drops leading slashes', () => {
    expect(toProjectRelative('/a/b.adoc')).toBe('a/b.adoc');
  });

  it('leaves an already-relative path unchanged', () => {
    expect(toProjectRelative('a/b.adoc')).toBe('a/b.adoc');
  });
});
