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
  // A role-based inline span `[.role]#text#` is a styled span. EVERY role span gets this generic
  // highlight class (FR-021b) — it reuses the highlight/marked-span tag that the theme already
  // colours, so all five themes show role spans. A KNOWN role earns an ADDITIONAL distinct emphasis
  // via the registry-driven decoration (`inline-style-registry.ts`), layered on top of this base.
  RoleSpan:           t.special(t.string),
  CommentLine:        t.lineComment,
  CommentBlock:       t.blockComment,
  AttributeEntry:     t.meta,
  AttributeReference: t.variableName,
  // An inline `{set:}` assignment is an attribute DEFINITION in body text, so it shares the
  // attribute-entry colour (`t.meta`) rather than the (theme-unstyled) reference tag.
  InlineSet:          t.meta,
  BlockMacro:         t.macroName,
  InlineMacro:        t.link,
  CrossReference:     t.link,
  // A cross-reference's target id reads as a link (the navigation anchor); its optional display
  // label reads as body text, distinct from the target (FR-045). The `<<`/`>>` delimiters (and the
  // single guard char the opener consumes) share the target's link colour.
  xrefOpen:           t.link,
  xrefClose:          t.link,
  XrefTarget:         t.link,
  XrefLabel:          t.string,
  // A table column-format specifier line `[cols="1,>2"]` — highlighted distinctly from a generic
  // block-attribute line (FR-046). `t.attributeValue` reads as a value/spec, not plain meta.
  TableCols:          t.attributeValue,
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
  CsvTableBlock:      t.className,
  DsvTableBlock:      t.className,
  tableDelim:         t.separator,
  tableRow:           t.content,
  tableCellMark:      t.operator,
  Conditional:        t.keyword,
  BlockAttributeLine: t.meta,
  ThematicBreak:      t.contentSeparator,
  PageBreak:          t.special(t.contentSeparator),
  Passthrough:        t.special(t.string),
  InlineAnchor:       t.labelName,
  BiblioAnchor:       t.special(t.labelName),
  Replacement:        t.character,
  Entity:             t.special(t.character),
  Callout:            t.special(t.number),
  UiMacro:            t.macroName,
  InlineStem:         t.special(t.macroName),
  Link:               t.link,
  SmartQuote:         t.quote,
  HardBreak:          t.escape,
  BlockTitle:         t.annotation,
  OrderedListItem:    t.list,
  UnorderedListItem:  t.list,
  ChecklistItem:      t.list,
  Continuation:       t.list,
  DescriptionList:    t.labelName,
  DescriptionContinuation: t.labelName,
});
