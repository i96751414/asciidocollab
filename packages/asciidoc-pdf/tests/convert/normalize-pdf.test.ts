import {
  DEFAULT_SOURCE_DATE_EPOCH_SECONDS,
  FIXED_DOCUMENT_ID_HEX,
  normalizePdfBytes,
} from '../../src/convert/normalize-pdf';

/**
 * Encode an ASCII/latin1 string into raw bytes, preserving each code unit as a
 * single byte (mirrors the 1:1 byte transform the normalizer performs).
 */
const toBytes = (text: string): Uint8Array =>
  Uint8Array.from(text, (character) => character.codePointAt(0) ?? 0);

/** Decode raw bytes back into a 1:1 latin1 string for assertions. */
const toText = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => String.fromCodePoint(byte)).join('');

const bytesEqual = (left: Uint8Array, right: Uint8Array): boolean =>
  left.length === right.length && left.every((value, index) => value === right[index]);

/**
 * Build a small PDF-shaped byte buffer whose Info dictionary carries the given
 * timestamps and whose trailer carries the given document `/ID` entries.
 */
const buildPdf = (options: {
  creationDate: string;
  modDate: string;
  idFirst: string;
  idSecond: string;
}): Uint8Array =>
  toBytes(
    [
      '%PDF-1.7',
      '1 0 obj',
      '<< /Type /Catalog /Pages 3 0 R >>',
      'endobj',
      '2 0 obj',
      `<< /Producer (Prawn) /CreationDate (${options.creationDate}) /ModDate (${options.modDate}) >>`,
      'endobj',
      'trailer',
      `<< /Root 1 0 R /Info 2 0 R /ID [<${options.idFirst}><${options.idSecond}>] >>`,
      '%%EOF',
    ].join('\n'),
  );

describe('normalizePdfBytes', () => {
  it('replaces creation/modification dates and the document ID with fixed deterministic values', () => {
    const input = buildPdf({
      creationDate: "D:20240101120000+05'00'",
      modDate: "D:20240102130000-03'30'",
      idFirst: '0123456789abcdef0123456789abcdef',
      idSecond: 'fedcba9876543210fedcba9876543210',
    });

    const normalized = toText(normalizePdfBytes(input));

    // Fixed epoch (1970-01-01T00:00:00Z) renders as this literal.
    expect(normalized).toContain("/CreationDate (D:19700101000000+00'00')");
    expect(normalized).toContain("/ModDate (D:19700101000000+00'00')");
    expect(normalized).toContain(`/ID [<${FIXED_DOCUMENT_ID_HEX}><${FIXED_DOCUMENT_ID_HEX}>]`);

    // Original ambient values are gone.
    expect(normalized).not.toContain('20240101');
    expect(normalized).not.toContain('20240102');
    expect(normalized).not.toContain("+05'00'");
    expect(normalized).not.toContain('0123456789abcdef');
    expect(normalized).not.toContain('fedcba9876543210');

    // Untouched structure survives verbatim.
    expect(normalized).toContain('/Producer (Prawn)');
    expect(normalized).toContain('/Root 1 0 R /Info 2 0 R');
  });

  it('collapses two inputs that differ only in ambient timestamps and ID to identical bytes', () => {
    const first = buildPdf({
      creationDate: "D:20240101120000+00'00'",
      modDate: "D:20240102130000+00'00'",
      idFirst: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      idSecond: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    });
    const second = buildPdf({
      // Different length and value on every ambient field.
      creationDate: 'D:20250630235959Z',
      modDate: "D:19991231000000-08'00'",
      idFirst: 'cccc',
      idSecond: 'deadbeefdeadbeefdeadbeefdeadbeef',
    });

    const normalizedFirst = normalizePdfBytes(first);
    const normalizedSecond = normalizePdfBytes(second);

    expect(bytesEqual(normalizedFirst, normalizedSecond)).toBe(true);
  });

  it('is idempotent: normalizing an already-normalized PDF yields identical bytes', () => {
    const input = buildPdf({
      creationDate: "D:20240101120000+05'00'",
      modDate: "D:20240102130000-03'30'",
      idFirst: '0123456789abcdef0123456789abcdef',
      idSecond: 'fedcba9876543210fedcba9876543210',
    });

    const once = normalizePdfBytes(input);
    const twice = normalizePdfBytes(once);

    expect(bytesEqual(twice, once)).toBe(true);
  });

  it('honors an explicit epoch override while remaining deterministic', () => {
    const input = buildPdf({
      creationDate: "D:20240101120000+00'00'",
      modDate: "D:20240102130000+00'00'",
      idFirst: 'aa',
      idSecond: 'bb',
    });

    // 2001-09-09T01:46:40Z
    const normalized = toText(normalizePdfBytes(input, 1_000_000_000));

    expect(normalized).toContain("/CreationDate (D:20010909014640+00'00')");
    expect(normalized).toContain("/ModDate (D:20010909014640+00'00')");
  });

  it('does not disturb bytes that carry no ambient nondeterminism', () => {
    const plain = toBytes('%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF');

    const normalized = normalizePdfBytes(plain);

    expect(bytesEqual(normalized, plain)).toBe(true);
  });

  it('exposes a fixed default epoch constant', () => {
    expect(DEFAULT_SOURCE_DATE_EPOCH_SECONDS).toBe(0);
  });
});
