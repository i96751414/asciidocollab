import { sanitizeContentDispositionFilename } from '../../src/lib/sanitize-filename';

describe('sanitizeContentDispositionFilename', () => {
  test('strips double-quotes', () => {
    expect(sanitizeContentDispositionFilename('my"file.adoc')).toBe('myfile.adoc');
  });

  test(String.raw`strips embedded carriage-return (\r)`, () => {
    expect(sanitizeContentDispositionFilename('my\rfile.adoc')).toBe('myfile.adoc');
  });

  test(String.raw`strips embedded newline (\n)`, () => {
    expect(sanitizeContentDispositionFilename('my\nfile.adoc')).toBe('myfile.adoc');
  });

  test(String.raw`strips \r\n CRLF sequence`, () => {
    expect(sanitizeContentDispositionFilename('My\r\nProject')).toBe('MyProject');
  });

  test('strips all hazardous chars in one pass', () => {
    expect(sanitizeContentDispositionFilename('"foo\r\nbar"')).toBe('foobar');
  });

  test('leaves safe names unchanged', () => {
    expect(sanitizeContentDispositionFilename('readme.adoc')).toBe('readme.adoc');
  });

  test('strips backslash to prevent RFC 7230 quoted-pair escaping of closing double-quote', () => {
    // In Content-Disposition: attachment; filename="foo\", the \" is a quoted-pair escape,
    // so the closing quote is consumed and parsers see an unterminated string.
    expect(sanitizeContentDispositionFilename('foo\\')).toBe('foo');
    expect(sanitizeContentDispositionFilename(String.raw`a\b\c`)).toBe('abc');
  });

  test(String.raw`strips null byte (\x00) — would cause Node.js setHeader to throw`, () => {
    expect(sanitizeContentDispositionFilename('evil\u0000file.adoc')).toBe('evilfile.adoc');
  });

  test(String.raw`strips other C0 control characters (\x01–\x1f)`, () => {
    expect(sanitizeContentDispositionFilename('file\u0001name')).toBe('filename');
    expect(sanitizeContentDispositionFilename('tab\u0009here')).toBe('tabhere');
  });

  test(String.raw`strips DEL (\x7f)`, () => {
    expect(sanitizeContentDispositionFilename('del\u007Fchar')).toBe('delchar');
  });

  test('strips non-ASCII characters — accented, CJK, emoji', () => {
    expect(sanitizeContentDispositionFilename('café.adoc')).toBe('caf.adoc');
    expect(sanitizeContentDispositionFilename('会議メモ')).toBe('');
    expect(sanitizeContentDispositionFilename('launch🚀.adoc')).toBe('launch.adoc');
  });

  test(String.raw`space (\x20) and tilde (\x7e) are the boundary printable-ASCII chars and are kept`, () => {
    expect(sanitizeContentDispositionFilename(' file name ')).toBe(' file name ');
    expect(sanitizeContentDispositionFilename('a~b')).toBe('a~b');
  });
});

import { buildAttachmentDisposition } from '../../src/lib/sanitize-filename';

describe('buildAttachmentDisposition', () => {
  test('pure-ASCII name produces filename= and filename*= both with the same value', () => {
    const header = buildAttachmentDisposition('readme.adoc', 'readme.adoc');
    expect(header).toContain('filename="readme.adoc"');
    expect(header).toContain("filename*=UTF-8''readme.adoc");
  });

  test('non-ASCII name encodes UTF-8 bytes in filename*= param', () => {
    // café → c a f %C3%A9 (U+00E9 = 0xC3 0xA9 in UTF-8)
    const header = buildAttachmentDisposition('café.adoc', 'caf.adoc');
    expect(header).toContain('filename="caf.adoc"');
    expect(header).toContain("filename*=UTF-8''caf%C3%A9.adoc");
  });

  test('CJK characters are fully percent-encoded in filename*=', () => {
    // 会 = U+4F1A → UTF-8 0xE4 0xBC 0x9A → %E4%BC%9A
    const header = buildAttachmentDisposition('会議メモ.adoc', 'file.adoc');
    expect(header).toContain('filename="file.adoc"');
    expect(header).toContain('%E4%BC%9A');
  });

  test('emoji is fully percent-encoded in filename*=', () => {
    // 🚀 = U+1F680 → UTF-8 4 bytes → %F0%9F%9A%80
    const header = buildAttachmentDisposition('launch🚀.adoc', 'launch.adoc');
    expect(header).toContain("filename*=UTF-8''launch%F0%9F%9A%80.adoc");
  });

  test("RFC 5987 reserved chars * ' ( ) are percent-encoded in filename*=", () => {
    // encodeURIComponent leaves these unencoded; RFC 5987 requires encoding them
    const header = buildAttachmentDisposition("file(1)*it's.adoc", "file(1)its.adoc");
    const star = header.match(/filename\*=UTF-8''(.+)/)?.[1] ?? '';
    expect(star).not.toContain('*');
    expect(star).not.toContain("'");
    expect(star).not.toContain('(');
    expect(star).not.toContain(')');
  });

  test('header format is: attachment; filename="..."; filename*=UTF-8\'\'...', () => {
    const header = buildAttachmentDisposition('doc.adoc', 'doc.adoc');
    expect(header).toMatch(/^attachment; filename="[^"]*"; filename\*=UTF-8''[^\s]+$/);
  });
});
