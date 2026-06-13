import {
  extractSourceLanguage,
  collectSourceLanguages,
} from '@/lib/codemirror/asciidoc-source-highlight';

describe('extractSourceLanguage (FR-017/018)', () => {
  test('resolves a known language from a [source,lang] declaration', () => {
    expect(extractSourceLanguage('[source,ruby]')).toBe('Ruby');
    expect(extractSourceLanguage('[source, js]')).toBe('JavaScript');
    expect(extractSourceLanguage('[source,python]')).toBe('Python');
  });

  test('returns null for an unknown language (no injection)', () => {
    expect(extractSourceLanguage('[source,cobol]')).toBeNull();
  });

  test('returns null for a non-source attribute line', () => {
    expect(extractSourceLanguage('[cols="1,1"]')).toBeNull();
    expect(extractSourceLanguage('plain text')).toBeNull();
  });
});

describe('collectSourceLanguages', () => {
  test('returns the distinct resolved languages declared in a document', () => {
    const source = [
      '[source,js]',
      '----',
      'x',
      '----',
      '',
      '[source,python]',
      '----',
      'y',
      '----',
      '',
      '[source,js]', // duplicate
      '----',
      'z',
      '----',
    ].join('\n');
    expect(collectSourceLanguages(source).toSorted()).toEqual(['JavaScript', 'Python']);
  });

  test('ignores unknown languages', () => {
    expect(collectSourceLanguages('[source,brainfuck]\n----\n+\n----\n')).toEqual([]);
  });
});
