import {
  canonicalSourceLanguageName,
  listSourceLanguageTokens,
  resolveSourceLanguage,
} from '@/lib/codemirror/source-languages';

describe('source-languages allow-list', () => {
  describe('canonicalSourceLanguageName', () => {
    test('resolves canonical names', () => {
      expect(canonicalSourceLanguageName('javascript')).toBe('JavaScript');
      expect(canonicalSourceLanguageName('python')).toBe('Python');
      expect(canonicalSourceLanguageName('rust')).toBe('Rust');
    });

    test('resolves common aliases', () => {
      expect(canonicalSourceLanguageName('js')).toBe('JavaScript');
      expect(canonicalSourceLanguageName('ts')).toBe('TypeScript');
      expect(canonicalSourceLanguageName('py')).toBe('Python');
      expect(canonicalSourceLanguageName('bash')).toBe('Shell');
      expect(canonicalSourceLanguageName('cpp')).toBe('C++');
    });

    test('is case-insensitive and trims whitespace', () => {
      expect(canonicalSourceLanguageName('  JavaScript ')).toBe('JavaScript');
      expect(canonicalSourceLanguageName('TS')).toBe('TypeScript');
    });

    test('returns null for unknown / unsupported languages', () => {
      expect(canonicalSourceLanguageName('cobol')).toBeNull();
      expect(canonicalSourceLanguageName('')).toBeNull();
      expect(canonicalSourceLanguageName(null)).toBeNull();
      expect(canonicalSourceLanguageName(undefined)).toBeNull();
    });
  });

  describe('listSourceLanguageTokens', () => {
    test('returns a sorted, non-empty list of tokens', () => {
      const tokens = listSourceLanguageTokens();
      expect(tokens.length).toBeGreaterThan(10);
      expect(tokens).toContain('js');
      expect(tokens).toContain('python');
      expect([...tokens]).toEqual([...tokens].toSorted());
    });
  });

  describe('resolveSourceLanguage', () => {
    test('returns a LanguageDescription for an allowed language', () => {
      const description = resolveSourceLanguage('javascript');
      expect(description).not.toBeNull();
      expect(description?.name).toBe('JavaScript');
      // The description loads lazily — we never call load() in unit tests.
      expect(typeof description?.load).toBe('function');
    });

    test('resolves via alias', () => {
      expect(resolveSourceLanguage('py')?.name).toBe('Python');
    });

    test('returns null for languages outside the allow-list', () => {
      expect(resolveSourceLanguage('cobol')).toBeNull();
      expect(resolveSourceLanguage('')).toBeNull();
    });
  });
});
