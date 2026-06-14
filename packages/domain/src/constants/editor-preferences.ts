export const FONT_SIZE_MIN = 8;
export const FONT_SIZE_MAX = 32;
export const DEFAULT_FONT_SIZE = 14;
export const DEFAULT_THEME = 'default' as const;
export const DEFAULT_SCROLL_SYNC_ENABLED = false;
export const DEFAULT_PREVIEW_STYLE = 'asciidocollab' as const;

/**
 * Selectable editor spellcheck languages (ISO 639-1 codes). The user can pick any of these as the
 * document language; spellcheck only produces diagnostics for languages with a bundled Hunspell
 * dictionary (see {@link SPELLCHECK_DICTIONARY_LANGUAGES}). The rest are valid selections that yield
 * no diagnostics (Hunspell does not suit CJK / most Indic scripts) — which, together with the
 * enable/disable flag, lets spellcheck be effectively turned off.
 */
export const SPELLCHECK_LANGUAGES = [
  'en', 'zh', 'hi', 'es', 'fr', 'ar', 'bn', 'pt', 'ur', 'de', 'it', 'uk', 'ja', 'pl', 'tr',
] as const;

/** The subset of SPELLCHECK_LANGUAGES that has a bundled Hunspell dictionary and actually spell-checks. */
export const SPELLCHECK_DICTIONARY_LANGUAGES = [
  'en', 'es', 'fr', 'pt', 'de', 'it', 'uk', 'pl', 'tr',
] as const;

/** A selectable spellcheck/document language code (one of {@link SPELLCHECK_LANGUAGES}). */
export type SpellcheckLanguage = (typeof SPELLCHECK_LANGUAGES)[number];

export const DEFAULT_SPELLCHECK_LANGUAGE = 'en' as const;
export const DEFAULT_SPELLCHECK_ENABLED = true;

const SPELLCHECK_LANGUAGE_SET: ReadonlySet<string> = new Set(SPELLCHECK_LANGUAGES);

/** Whether `value` is one of the selectable spellcheck languages. */
export function isSpellcheckLanguage(value: string): value is SpellcheckLanguage {
  return SPELLCHECK_LANGUAGE_SET.has(value);
}
