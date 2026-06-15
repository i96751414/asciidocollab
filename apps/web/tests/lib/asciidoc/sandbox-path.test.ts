import { resolveSandboxedPath } from '@/lib/asciidoc/sandbox-path';
import type { SandboxedPathResult } from '@/lib/asciidoc/sandbox-path';

// Unit coverage for the editor-side (presentation) sandbox path-resolution guard.
// The authoritative boundary is the domain's resolveSandboxedPath; this mirrors it
// for the in-browser preview/symbol-index, so the cases here exercise every branch:
// each rejection reason and the relative-resolution success path.

const FROM = 'docs/guide/intro.adoc'; // a referencing file whose directory is docs/guide

function expectRejected(result: SandboxedPathResult, reason: string): void {
  expect(result.ok).toBe(false);
  if (result.ok) return; // narrows the discriminated union for the assertion below
  expect(result.reason).toBe(reason);
}

function expectResolved(result: SandboxedPathResult, path: string): void {
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.path).toBe(path);
}

describe('resolveSandboxedPath rejections', () => {
  test('an empty or whitespace-only target is rejected as empty', () => {
    expectRejected(resolveSandboxedPath(FROM, ''), 'empty');
    expectRejected(resolveSandboxedPath(FROM, '   '), 'empty');
  });

  test('a target decoding to empty is rejected as empty', () => {
    expectRejected(resolveSandboxedPath(FROM, '%20'), 'empty');
  });

  test.each([
    ['NUL byte', 'a\0b.adoc'],
    ['percent-encoded NUL', 'a%00b.adoc'],
    ['tab control char', 'a\tb.adoc'],
    ['DEL (0x7f) control char', 'a\u{7F}b.adoc'],
  ])('rejects %s as invalid', (_label, target) => {
    expectRejected(resolveSandboxedPath(FROM, target), 'invalid');
  });

  test('a residual percent-escape (double-encoding) is rejected as invalid', () => {
    // %252e decodes once to %2e, a percent-escape that survived — re-expands to '.'
    expectRejected(resolveSandboxedPath(FROM, '%252e%252e/secret.adoc'), 'invalid');
  });

  test('a malformed percent-escape falls back to the raw form and is rejected as invalid', () => {
    // decodeURIComponent throws on a lone %; the raw '%ZZ...' still has %ZZ but not %XX hex,
    // so the residual-escape check does not fire — but '%2e' below is valid hex and does.
    expectRejected(resolveSandboxedPath(FROM, '%2e%2ZZ%2e'), 'invalid');
  });

  test.each([
    ['http scheme', 'http://example.com/x.png'],
    ['https scheme', 'https://example.com/x.png'],
    ['custom scheme', 'ftp://host/file'],
  ])('rejects a remote URL (%s) as remote', (_label, target) => {
    expectRejected(resolveSandboxedPath(FROM, target), 'remote');
  });

  test('a data: URI is rejected as remote', () => {
    expectRejected(resolveSandboxedPath(FROM, 'data:image/png;base64,AAAA'), 'remote');
  });

  test.each([
    ['leading slash', '/etc/passwd'],
    ['leading backslash', String.raw`\\host\share\file`],
    ['Windows drive (backslash)', String.raw`C:\Windows\system32`],
    ['Windows drive (forward slash)', 'C:/Windows/system32'],
  ])('rejects an absolute path (%s) as absolute', (_label, target) => {
    expectRejected(resolveSandboxedPath(FROM, target), 'absolute');
  });

  test('traversal escaping the project root is rejected as traversal', () => {
    // docs/guide -> .. -> docs -> .. -> '' (root) -> .. escapes -> traversal
    expectRejected(resolveSandboxedPath(FROM, '../../../secret.adoc'), 'traversal');
  });

  test('traversal via backslash separators is rejected as traversal', () => {
    expectRejected(resolveSandboxedPath(FROM, String.raw`..\..\..\secret.adoc`), 'traversal');
  });

  test('a percent-encoded traversal is decoded and rejected as traversal', () => {
    expectRejected(resolveSandboxedPath(FROM, '%2e%2e/%2e%2e/%2e%2e/secret.adoc'), 'traversal');
  });

  test('resolving to the project root directory itself is rejected as traversal', () => {
    // docs/guide -> .. -> docs -> .. -> '' leaves no segments
    expectRejected(resolveSandboxedPath(FROM, '../..'), 'traversal');
  });
});

describe('resolveSandboxedPath success path', () => {
  test('resolves a sibling relative to the referencing file directory', () => {
    expectResolved(resolveSandboxedPath(FROM, 'chapter.adoc'), 'docs/guide/chapter.adoc');
  });

  test('resolves into a nested subdirectory', () => {
    expectResolved(resolveSandboxedPath(FROM, 'parts/one.adoc'), 'docs/guide/parts/one.adoc');
  });

  test('resolves a single .. up one directory level', () => {
    expectResolved(resolveSandboxedPath(FROM, '../shared/diagram.png'), 'docs/shared/diagram.png');
  });

  test('ignores . segments and empty segments during normalization', () => {
    expectResolved(resolveSandboxedPath(FROM, './sub//./file.adoc'), 'docs/guide/sub/file.adoc');
  });

  test('normalizes backslash separators into POSIX path segments', () => {
    expectResolved(resolveSandboxedPath(FROM, String.raw`parts\two.adoc`), 'docs/guide/parts/two.adoc');
  });

  test('decodes percent-encoded ordinary characters', () => {
    expectResolved(resolveSandboxedPath(FROM, 'my%20file.adoc'), 'docs/guide/my file.adoc');
  });

  test('resolves relative to a referencing file at the project root', () => {
    expectResolved(resolveSandboxedPath('readme.adoc', 'intro.adoc'), 'intro.adoc');
  });
});
