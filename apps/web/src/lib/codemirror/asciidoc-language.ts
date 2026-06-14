import { LRLanguage, LanguageSupport } from '@codemirror/language';
import { parser } from './asciidoc-parser.js';
import { asciidocHighlightTags } from './asciidoc-highlight-tags';
import { sourceMixedWrap } from './asciidoc-source-highlight';

// `wrap` injects embedded source-language parsers into [source,<lang>] block bodies (US5);
// the injection is inert until the language's parser is lazily loaded.
const configuredParser = parser.configure({ props: [asciidocHighlightTags], wrap: sourceMixedWrap });

/** Build a new AsciiDoc `LRLanguage`. See {@link asciidoc} for why a fresh instance matters. */
function defineAsciidocLanguage(): LRLanguage {
  return LRLanguage.define({
    name: 'asciidoc',
    parser: configuredParser,
    languageData: {
      commentTokens: { line: '//' },
    },
  });
}

/**
 * The canonical AsciiDoc language (CM convention: an `xxxLanguage` singleton alongside the
 * `asciidoc()` support factory). Used for the initial editor mount and by direct-parse consumers.
 */
export const asciidocLanguage = defineAsciidocLanguage();

/**
 * Returns a CM6 LanguageSupport for AsciiDoc.
 *
 * Pass `{ fresh: true }` to wrap a brand-new `Language` instance instead of the {@link asciidocLanguage}
 * singleton. This is load-bearing for the source-highlight loader (US5/FR-017–019): when a
 * `[source,<lang>]` parser finishes loading it must force a re-parse so the wrap re-runs and injects
 * it — and CodeMirror only RESTARTS parsing when the `Language` object in the `language` facet
 * actually changes. Reconfiguring the language compartment with the same Language is a parse no-op,
 * which would leave the block un-highlighted forever; reconfiguring with a fresh one restarts it.
 */
export function asciidoc({ fresh = false }: { fresh?: boolean } = {}): LanguageSupport {
  return new LanguageSupport(fresh ? defineAsciidocLanguage() : asciidocLanguage);
}
