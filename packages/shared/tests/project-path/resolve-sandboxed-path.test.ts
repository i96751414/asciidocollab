import { resolveSandboxedPath } from '../../src/project-path/resolve-sandboxed-path';

describe('resolveSandboxedPath (Constitution IX)', () => {
  test('resolves a project-relative sibling path', () => {
    expect(resolveSandboxedPath('docs/guide.adoc', 'intro.adoc')).toEqual({ ok: true, path: 'docs/intro.adoc' });
  });

  test('resolves a subdirectory path', () => {
    expect(resolveSandboxedPath('docs/guide.adoc', 'parts/one.adoc')).toEqual({ ok: true, path: 'docs/parts/one.adoc' });
  });

  test('allows .. that stays within the project', () => {
    expect(resolveSandboxedPath('docs/sub/guide.adoc', '../shared.adoc')).toEqual({ ok: true, path: 'docs/shared.adoc' });
  });

  test('rejects traversal escaping the project root', () => {
    expect(resolveSandboxedPath('guide.adoc', '../secret.adoc')).toEqual({ ok: false, reason: 'traversal' });
    expect(resolveSandboxedPath('docs/guide.adoc', '../../etc/passwd')).toEqual({ ok: false, reason: 'traversal' });
  });

  test('rejects absolute paths (posix and windows)', () => {
    expect(resolveSandboxedPath('guide.adoc', '/etc/passwd').ok).toBe(false);
    expect(resolveSandboxedPath('guide.adoc', String.raw`C:\Windows\x`).ok).toBe(false);
  });

  test('rejects remote / data URLs', () => {
    expect(resolveSandboxedPath('guide.adoc', 'https://evil.example/x.adoc')).toEqual({ ok: false, reason: 'remote' });
    expect(resolveSandboxedPath('guide.adoc', 'ftp://host/x')).toEqual({ ok: false, reason: 'remote' });
    expect(resolveSandboxedPath('guide.adoc', 'data:text/plain;base64,AAAA')).toEqual({ ok: false, reason: 'remote' });
  });

  test('rejects an empty target', () => {
    expect(resolveSandboxedPath('guide.adoc', '   ')).toEqual({ ok: false, reason: 'empty' });
  });

  test('rejects percent-encoded traversal that escapes the root (decoded before checks)', () => {
    expect(resolveSandboxedPath('docs/guide.adoc', '%2e%2e/%2e%2e/etc/passwd').ok).toBe(false);
    expect(resolveSandboxedPath('guide.adoc', '%2e%2e%2fsecret.adoc').ok).toBe(false);
  });

  test('rejects percent-encoded remote/absolute', () => {
    expect(resolveSandboxedPath('guide.adoc', 'https%3A%2F%2Fevil/x').ok).toBe(false);
  });

  test('rejects a target that resolves to the project root directory itself', () => {
    expect(resolveSandboxedPath('docs/guide.adoc', '..')).toEqual({ ok: false, reason: 'traversal' });
  });

  test('normalizes ./ and backslashes', () => {
    expect(resolveSandboxedPath('docs/guide.adoc', './a/./b.adoc')).toEqual({ ok: true, path: 'docs/a/b.adoc' });
    expect(resolveSandboxedPath('docs/guide.adoc', String.raw`a\b.adoc`)).toEqual({ ok: true, path: 'docs/a/b.adoc' });
  });
});
