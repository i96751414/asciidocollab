import { LRLanguage, LanguageSupport } from '@codemirror/language';
import { styleTags, tags as t } from '@lezer/highlight';
import { parser } from './asciidoc-parser.js';

const asciidocHighlightProperties = styleTags({
  DocumentTitle:      t.heading1,
  Heading1:           t.heading2,
  Heading2:           t.heading3,
  Heading3:           t.heading4,
  Heading4:           t.heading5,
  Heading5:           t.heading6,
  Bold:               t.strong,
  Italic:             t.emphasis,
  Monospace:          t.monospace,
  Highlight:          t.special(t.string),
  Subscript:          t.number,
  Superscript:        t.special(t.number),
  CommentLine:        t.lineComment,
  CommentBlock:       t.blockComment,
  AttributeEntry:     t.meta,
  AttributeReference: t.variableName,
  BlockMacro:         t.macroName,
  InlineMacro:        t.link,
  CrossReference:     t.link,
  Footnote:           t.string,
  ListingBlock:       t.blockComment,
  ExampleBlock:       t.string,
  SidebarBlock:       t.typeName,
  QuoteBlock:         t.quote,
  PassthroughBlock:   t.processingInstruction,
  OpenBlock:          t.labelName,
  StemBlock:          t.special(t.keyword),
  AdmonitionParagraph: t.keyword,
  AdmonitionBlock:    t.keyword,
  TableBlock:         t.className,
  tableDelim:         t.separator,
  tableRow:           t.content,
  tableCellMark:      t.operator,
  BlockTitle:         t.annotation,
  OrderedListItem:    t.list,
  UnorderedListItem:  t.list,
  ChecklistItem:      t.list,
  DescriptionList:    t.labelName,
});

export const asciidocLanguage = LRLanguage.define({
  name: 'asciidoc',
  parser: parser.configure({ props: [asciidocHighlightProperties] }),
  languageData: {
    commentTokens: { line: '//' },
  },
});

/** Returns a CM6 LanguageSupport instance for AsciiDoc. */
export function asciidoc(): LanguageSupport {
  return new LanguageSupport(asciidocLanguage);
}
