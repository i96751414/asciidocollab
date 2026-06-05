import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import type { Extension } from '@codemirror/state';

/**
 * AsciiDoc syntax highlight style using CSS custom properties (--ad-*).
 * Each editor theme defines these variables on .asciidoc-editor[data-theme="..."],
 * so swapping `data-theme` instantly re-colours all tokens with no extension reload.
 */
export const asciidocHighlightStyle = HighlightStyle.define([
  // Document structure — headings
  { tag: t.heading1, color: 'var(--ad-heading)', fontWeight: 'bold', fontSize: '1.4em' },
  { tag: t.heading2, color: 'var(--ad-heading)', fontWeight: 'bold', fontSize: '1.2em' },
  { tag: t.heading3, color: 'var(--ad-heading)', fontWeight: 'bold', fontSize: '1.1em' },
  { tag: t.heading4, color: 'var(--ad-heading-dim)', fontWeight: 'bold' },
  { tag: t.heading5, color: 'var(--ad-heading-dim)', fontWeight: 'bold' },
  { tag: t.heading6, color: 'var(--ad-heading-dim)', fontWeight: 'bold' },
  // Inline marks
  { tag: t.strong,     fontWeight: 'bold' },
  { tag: t.emphasis,   fontStyle: 'italic' },
  { tag: t.monospace,  fontFamily: 'monospace', backgroundColor: 'var(--ad-mono-bg)' },
  // Comments
  { tag: t.blockComment, color: 'var(--ad-comment)', fontStyle: 'italic' },
  { tag: t.lineComment,  color: 'var(--ad-comment)', fontStyle: 'italic' },
  // Document directives and block markers
  { tag: t.meta,          color: 'var(--ad-meta)' },
  { tag: t.keyword,       color: 'var(--ad-keyword)', fontWeight: 'bold' },
  // Links and references
  { tag: t.link,          color: 'var(--ad-link)', textDecoration: 'underline' },
  // Values and identifiers
  { tag: t.string,        color: 'var(--ad-string)' },
  { tag: t.number,        color: 'var(--ad-number)' },
  { tag: t.labelName,     color: 'var(--ad-label)' },
  { tag: t.attributeName, color: 'var(--ad-attr)' },
  { tag: t.attributeValue, color: 'var(--ad-string)' },
  { tag: t.typeName,      color: 'var(--ad-type)' },
  { tag: t.className,     color: 'var(--ad-type)', fontWeight: 'bold' },
  { tag: t.special(t.string), color: 'var(--ad-special)' },
]);

/** Returns a CM6 Extension that applies AsciiDoc syntax highlighting. */
export function asciidocHighlighting(): Extension {
  return syntaxHighlighting(asciidocHighlightStyle);
}
