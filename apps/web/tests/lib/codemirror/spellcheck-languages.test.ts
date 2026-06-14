import { SPELLCHECK_LANGUAGE_OPTIONS, hasDictionary } from '@/lib/codemirror/spellcheck-languages';

// The selectable spellcheck/document languages registry (web mirror of the domain constant).

describe('SPELLCHECK_LANGUAGE_OPTIONS', () => {
  test('offers all 15 required languages', () => {
    const codes = SPELLCHECK_LANGUAGE_OPTIONS.map((option) => option.code);
    expect(codes).toEqual(['en', 'zh', 'hi', 'es', 'fr', 'ar', 'bn', 'pt', 'ur', 'de', 'it', 'uk', 'ja', 'pl', 'tr']);
    expect(new Set(codes).size).toBe(codes.length); // no duplicates
  });

  test('every option has a non-empty human-readable label', () => {
    for (const option of SPELLCHECK_LANGUAGE_OPTIONS) {
      expect(option.label.length).toBeGreaterThan(0);
    }
  });

  test('exactly the nine Hunspell-backed languages are marked hasDictionary', () => {
    const withDict = SPELLCHECK_LANGUAGE_OPTIONS.filter((option) => option.hasDictionary).map((option) => option.code);
    expect(withDict).toEqual(['en', 'es', 'fr', 'pt', 'de', 'it', 'uk', 'pl', 'tr']);
  });
});

describe('hasDictionary', () => {
  test('is true for a bundled language and false for a CJK/Indic one or an unknown code', () => {
    expect(hasDictionary('en')).toBe(true);
    expect(hasDictionary('uk')).toBe(true);
    expect(hasDictionary('zh')).toBe(false); // Mandarin — no Hunspell
    expect(hasDictionary('ja')).toBe(false);
    expect(hasDictionary('xx')).toBe(false); // unknown code
  });
});
