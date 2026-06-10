import { LRLanguage, LanguageSupport } from '@codemirror/language';
import { parser } from './asciidoc-parser.js';
import { asciidocHighlightTags } from './asciidoc-highlight-tags';

export const asciidocLanguage = LRLanguage.define({
  name: 'asciidoc',
  parser: parser.configure({ props: [asciidocHighlightTags] }),
  languageData: {
    commentTokens: { line: '//' },
  },
});

/** Returns a CM6 LanguageSupport instance for AsciiDoc. */
export function asciidoc(): LanguageSupport {
  return new LanguageSupport(asciidocLanguage);
}
