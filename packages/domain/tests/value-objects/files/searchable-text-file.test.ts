import { isSearchableTextFile } from '../../../src/value-objects/files/searchable-text-file';

const bytes = (text: string): Uint8Array => new TextEncoder().encode(text);

describe('isSearchableTextFile', () => {
  it('treats an empty file as text', () => {
    expect(isSearchableTextFile(new Uint8Array())).toBe(true);
  });

  it('accepts plain UTF-8 text regardless of extension', () => {
    expect(isSearchableTextFile(bytes('= Title\n\nSome content.'))).toBe(true);
    expect(isSearchableTextFile(bytes('id,name\n1,foo'))).toBe(true);
    expect(isSearchableTextFile(bytes('{"a":1}'))).toBe(true);
  });

  it('accepts multi-byte UTF-8 (accents, emoji)', () => {
    expect(isSearchableTextFile(bytes('café — naïve 🚀'))).toBe(true);
  });

  it('rejects content with a NUL byte', () => {
    expect(isSearchableTextFile(new Uint8Array([0x68, 0x00, 0x69]))).toBe(false);
  });

  it('rejects content dominated by non-text control bytes (binary)', () => {
    const binary = new Uint8Array(100).map((_, index) => (index % 2 === 0 ? 0x01 : 0x02));
    expect(isSearchableTextFile(binary)).toBe(false);
  });

  it('tolerates ordinary whitespace control bytes (tab/newline/CR)', () => {
    expect(isSearchableTextFile(bytes('a\tb\r\nc\n'))).toBe(true);
  });
});
