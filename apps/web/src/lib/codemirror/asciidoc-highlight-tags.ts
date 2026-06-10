import { styleTags, tags as t } from '@lezer/highlight';

/**
 * Maps AsciiDoc Lezer node types to highlight tags. Kept in its own module — free of any
 * generated-parser import — so it is a single source of truth shared by the configured language
 * (`asciidoc-language.ts`) and the highlight-consistency tests, which build the parser from the
 * grammar source rather than the generated (ESM) `asciidoc-parser.js`.
 */
export const asciidocHighlightTags = styleTags({
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
  ListingBlock:       t.content,
  LiteralBlock:       t.content,
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
