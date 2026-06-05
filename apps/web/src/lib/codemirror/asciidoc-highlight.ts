import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import type { Extension } from '@codemirror/state';

export const asciidocHighlightStyle = HighlightStyle.define([
  // Document structure
  { tag: t.heading1,        color: '#2563eb', fontWeight: 'bold', fontSize: '1.4em' },
  { tag: t.heading2,        color: '#2563eb', fontWeight: 'bold', fontSize: '1.2em' },
  { tag: t.heading3,        color: '#2563eb', fontWeight: 'bold', fontSize: '1.1em' },
  { tag: t.heading4,        color: '#3b82f6', fontWeight: 'bold' },
  { tag: t.heading5,        color: '#60a5fa', fontWeight: 'bold' },
  { tag: t.heading6,        color: '#93c5fd', fontWeight: 'bold' },
  // Inline marks
  { tag: t.strong,          fontWeight: 'bold' },
  { tag: t.emphasis,        fontStyle: 'italic' },
  { tag: t.monospace,       fontFamily: 'monospace', backgroundColor: 'rgba(0,0,0,0.07)' },
  // Blocks
  { tag: t.blockComment,    color: '#6b7280', fontStyle: 'italic' },
  { tag: t.lineComment,     color: '#6b7280', fontStyle: 'italic' },
  { tag: t.meta,            color: '#9333ea' },
  { tag: t.keyword,         color: '#dc2626', fontWeight: 'bold' },
  { tag: t.link,            color: '#0ea5e9', textDecoration: 'underline' },
  { tag: t.string,          color: '#059669' },
  { tag: t.number,          color: '#d97706' },
  { tag: t.labelName,       color: '#9333ea' },
  { tag: t.attributeName,   color: '#7c3aed' },
  { tag: t.attributeValue,  color: '#059669' },
  { tag: t.typeName,        color: '#0284c7' },
  { tag: t.className,       color: '#0284c7', fontWeight: 'bold' },
  { tag: t.special(t.string), color: '#d97706' },
]);

/** Returns a CM6 Extension that applies AsciiDoc syntax highlighting. */
export function asciidocHighlighting(): Extension {
  return syntaxHighlighting(asciidocHighlightStyle);
}
