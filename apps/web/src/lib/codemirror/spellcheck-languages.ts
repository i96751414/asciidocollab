/**
 * Presentation registry of selectable editor spellcheck languages — the web mirror of the domain's
 * `SPELLCHECK_LANGUAGES` (web ⊥ domain: the web never imports the domain). The list is limited to
 * languages with a bundled Hunspell dictionary that actually spell-check; languages Hunspell cannot
 * meaningfully check (CJK / most Indic / Arabic-script) are intentionally absent — to turn spellcheck
 * off, the user disables it. Keep this in sync with the domain constant and the dictionaries copied
 * by `scripts/build-spellcheck-dictionary.mjs`.
 */
export interface SpellcheckLanguageOption {
  /** ISO 639-1 code (also the dictionary asset filename). */
  readonly code: string;
  /** Human-readable language name for the settings UI. */
  readonly label: string;
}

export const SPELLCHECK_LANGUAGE_OPTIONS: readonly SpellcheckLanguageOption[] = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'de', label: 'German' },
  { code: 'it', label: 'Italian' },
  { code: 'uk', label: 'Ukrainian' },
  { code: 'pl', label: 'Polish' },
  { code: 'tr', label: 'Turkish' },
];

const DICTIONARY_CODES = new Set(SPELLCHECK_LANGUAGE_OPTIONS.map((option) => option.code));

/** Whether a Hunspell dictionary is bundled for the given language code, so spellcheck can run. */
export function hasDictionary(code: string): boolean {
  return DICTIONARY_CODES.has(code);
}
