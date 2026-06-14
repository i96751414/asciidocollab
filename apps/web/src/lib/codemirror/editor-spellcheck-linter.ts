import { linter } from '@codemirror/lint';
import type { Extension } from '@codemirror/state';
import { asciidocSpellcheckSource } from '@/lib/codemirror/asciidoc-spellcheck';

/**
 * Builds the prose spell-check lint extension bound to the given ignore-list accessor, language, and
 * enabled flag (US9/FR-063). Shared by the initial extension assembly and the hook's live
 * compartment reconfigure so both produce an identical lint source.
 *
 * @param getSpellIgnore - Returns the current per-user spell-check ignore list.
 * @param language - Document language for spell-check (ISO 639-1).
 * @param enabled - When false, spell-check produces no diagnostics regardless of language.
 * @returns A CodeMirror lint extension for prose spell-check.
 */
export function createSpellcheckLinter(
  getSpellIgnore: () => string[],
  language: string,
  enabled: boolean,
): Extension {
  return linter(asciidocSpellcheckSource(getSpellIgnore, language, enabled));
}
