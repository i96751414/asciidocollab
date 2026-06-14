/**
 * Presentation registry of selectable editor spellcheck/document languages — the web mirror of the
 * domain's `SPELLCHECK_LANGUAGES` / `SPELLCHECK_DICTIONARY_LANGUAGES` (web ⊥ domain: the web never
 * imports the domain). `hasDictionary` marks languages with a bundled Hunspell dictionary that
 * actually spell-check; the rest are valid document-language selections that produce no diagnostics
 * (Hunspell does not suit CJK / most Indic scripts). Keep this list in sync with the domain constant
 * and the dictionaries copied by `scripts/build-spellcheck-dictionary.mjs`.
 */
export interface SpellcheckLanguageOption {
  /** ISO 639-1 code (also the dictionary asset filename). */
  readonly code: string;
  /** Human-readable language name for the settings UI. */
  readonly label: string;
  /** Whether a Hunspell dictionary is bundled (and so spellcheck runs) for this language. */
  readonly hasDictionary: boolean;
}

export const SPELLCHECK_LANGUAGE_OPTIONS: readonly SpellcheckLanguageOption[] = [
  { code: 'en', label: 'English', hasDictionary: true },
  { code: 'zh', label: 'Mandarin Chinese', hasDictionary: false },
  { code: 'hi', label: 'Hindi', hasDictionary: false },
  { code: 'es', label: 'Spanish', hasDictionary: true },
  { code: 'fr', label: 'French', hasDictionary: true },
  { code: 'ar', label: 'Modern Standard Arabic', hasDictionary: false },
  { code: 'bn', label: 'Bengali', hasDictionary: false },
  { code: 'pt', label: 'Portuguese', hasDictionary: true },
  { code: 'ur', label: 'Urdu', hasDictionary: false },
  { code: 'de', label: 'German', hasDictionary: true },
  { code: 'it', label: 'Italian', hasDictionary: true },
  { code: 'uk', label: 'Ukrainian', hasDictionary: true },
  { code: 'ja', label: 'Japanese', hasDictionary: false },
  { code: 'pl', label: 'Polish', hasDictionary: true },
  { code: 'tr', label: 'Turkish', hasDictionary: true },
];

const DICTIONARY_CODES = new Set(
  SPELLCHECK_LANGUAGE_OPTIONS.filter((option) => option.hasDictionary).map((option) => option.code),
);

/** Whether a Hunspell dictionary is bundled for the given language code, so spellcheck can run. */
export function hasDictionary(code: string): boolean {
  return DICTIONARY_CODES.has(code);
}
