import { isAsciiDocumentFileName } from '../../src/value-objects/asciidoc-file-name';

describe('isAsciiDocumentFileName', () => {
  it.each([
    ['book.adoc', true],
    ['book.asciidoc', true],
    ['guide.asc', true],
    ['notes.ad', true],
    ['BOOK.ADOC', true],
    ['a.b.adoc', true],
    ['notes.txt', false],
    ['file.adoc.txt', false],
    ['noextension', false],
    ['', false],
    ['.adoc', false], // bare extension, no stem — matches the web copy
    ['.asciidoc', false],
  ])('isAsciiDocumentFileName(%j) === %s', (name, expected) => {
    expect(isAsciiDocumentFileName(name)).toBe(expected);
  });
});
