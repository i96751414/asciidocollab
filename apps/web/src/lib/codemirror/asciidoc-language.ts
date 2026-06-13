import { LRLanguage, LanguageSupport } from '@codemirror/language';
import { parser } from './asciidoc-parser.js';
import { asciidocHighlightTags } from './asciidoc-highlight-tags';
import { sourceMixedWrap } from './asciidoc-source-highlight';

export const asciidocLanguage = LRLanguage.define({
  name: 'asciidoc',
  // `wrap` injects embedded source-language parsers into [source,<lang>] block
  // bodies (US5); the injection is inert until the language's parser is loaded.
  parser: parser.configure({ props: [asciidocHighlightTags], wrap: sourceMixedWrap }),
  languageData: {
    commentTokens: { line: '//' },
  },
});

/** Returns a CM6 LanguageSupport instance for AsciiDoc. */
export function asciidoc(): LanguageSupport {
  return new LanguageSupport(asciidocLanguage);
}
