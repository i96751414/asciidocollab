import { SPELLCHECK_LANGUAGE_OPTIONS, hasDictionary } from '@/lib/codemirror/spellcheck-languages';

// The selectable spellcheck languages registry (web mirror of the domain constant) — limited to
// the dictionary-backed languages that actually spell-check.

describe('SPELLCHECK_LANGUAGE_OPTIONS', () => {
  test('offers exactly the nine Hunspell-backed languages', () => {
    const codes = SPELLCHECK_LANGUAGE_OPTIONS.map((option) => option.code);
    expect(codes).toEqual(['en', 'es', 'fr', 'pt', 'de', 'it', 'uk', 'pl', 'tr']);
    expect(new Set(codes).size).toBe(codes.length); // no duplicates
  });

  test('every option has a non-empty human-readable label', () => {
    for (const option of SPELLCHECK_LANGUAGE_OPTIONS) {
      expect(option.label.length).toBeGreaterThan(0);
    }
  });

  test('does not offer languages Hunspell cannot check (CJK / Indic / Arabic-script)', () => {
    const codes = new Set(SPELLCHECK_LANGUAGE_OPTIONS.map((option) => option.code));
    for (const unsupported of ['zh', 'ja', 'hi', 'bn', 'ar', 'ur']) {
      expect(codes.has(unsupported)).toBe(false);
    }
  });
});

describe('hasDictionary', () => {
  test('is true for offered languages and false for unsupported / unknown codes', () => {
    expect(hasDictionary('en')).toBe(true);
    expect(hasDictionary('uk')).toBe(true);
    expect(hasDictionary('zh')).toBe(false); // Mandarin — not offered
    expect(hasDictionary('ja')).toBe(false);
    expect(hasDictionary('xx')).toBe(false); // unknown code
  });
});
