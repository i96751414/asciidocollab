import type { EditorState } from '@codemirror/state';
import { headingToId } from '@/lib/asciidoc/extraction';
import type { DocumentRange, SymbolKind } from './types';

/**
 * Detection of a symbol **definition** under the cursor, for the rename-suggestion feature (033).
 *
 * Unlike `asciidoc-symbol-at-cursor` (which also matches reference sites to seed the refactor
 * dialog), this only recognises DEFINITION tokens — an attribute definition or an explicit anchor —
 * because a rename suggestion is triggered by editing the definition, never a reference (FR-004).
 * Section-heading derived IDs are handled separately (US3) and are not matched here.
 */

/** A definition token recognised under the cursor. */
export interface DefinitionMatch {
  /** Which kind of symbol the definition declares. */
  kind: SymbolKind;
  /** The symbol name (attribute name, or anchor id). */
  name: string;
  /** The definition token's absolute range in the document. */
  range: DocumentRange;
}

// Attribute definition `:name:` / `:name!:`, anchored to the start of the line.
const ATTR_DEF_RE = /^:([A-Za-z0-9][\w-]*)!?:/g;
// Inline attribute assignment `{set:name:value}` / `{set:name!}` (FR-040) — an attribute definition
// in body text. Mirrors INLINE_SET_RE in asciidoc-attribute-fold.ts.
const INLINE_SET_RE = /\{set:([A-Za-z0-9][\w-]*)(?:!|:[^}\n]*)\}/g;
// The `{set:` prefix length, used to locate the name span within an inline-set token.
const SET_PREFIX_LENGTH = 5;
// Explicit anchors: `[[id]]`, `[#id]`, and the `anchor:id[` macro opener.
const ANCHOR_RE = /\[\[([A-Za-z][\w:.-]*)\]\]|\[#([A-Za-z][\w:.-]*)\]|anchor:([A-Za-z][\w:.-]*)\[/g;
// A section heading (levels 1–6; the level-0 document title is excluded) and its title text.
const SECTION_HEADING_RE = /^(={2,6})\s+(\S.*?)\s*$/;
// An explicit id set on the line before a heading (`[#id]` / `[[id]]`) overrides the derived id.
const EXPLICIT_ID_LINE_RE = /^\[(?:#|\[)[A-Za-z][\w:.-]*/;

/**
 * The match of `re` whose token covers `pos` within `line` (end-inclusive), or null.
 *
 * @param line - The line text to scan.
 * @param pos - The cursor offset within the line.
 * @param re - The (global) pattern to match against.
 * @returns The covering match, or null when the cursor is not on a match.
 */
function covering(line: string, pos: number, re: RegExp): RegExpMatchArray | null {
  for (const match of line.matchAll(re)) {
    const start = match.index ?? 0;
    if (pos >= start && pos <= start + match[0].length) return match;
  }
  return null;
}

/**
 * The symbol definition token under the cursor, or null when the cursor is not on one.
 *
 * Matches only definition sites (attribute `:name:`, anchor `[[id]]`/`[#id]`/`anchor:id[]`), so
 * editing a reference such as `{name}` or `<<id>>` never yields a match (FR-004). Position-aware:
 * it never picks a token elsewhere on the line.
 *
 * @param state - The current editor state (cursor + document).
 * @returns The definition under the cursor, or null.
 */
export function definitionAtCursor(state: EditorState): DefinitionMatch | null {
  const head = state.selection.main.head;
  const line = state.doc.lineAt(head);
  const text = line.text;
  const pos = head - line.from;

  const attribute = covering(text, pos, ATTR_DEF_RE);
  if (attribute) {
    const start = attribute.index ?? 0;
    return {
      kind: 'attribute',
      name: attribute[1],
      range: { from: line.from + start, to: line.from + start + attribute[0].length },
    };
  }

  // Inline `{set:name:value}` assignment — only when the cursor is on the NAME (editing the value is
  // not a rename). The whole token is the range so the reused rename excludes this definition itself.
  const inlineSet = covering(text, pos, INLINE_SET_RE);
  if (inlineSet) {
    const start = inlineSet.index ?? 0;
    const nameStart = start + SET_PREFIX_LENGTH;
    const name = inlineSet[1];
    if (pos >= nameStart && pos <= nameStart + name.length) {
      return {
        kind: 'attribute',
        name,
        range: { from: line.from + start, to: line.from + start + inlineSet[0].length },
      };
    }
  }

  const anchor = covering(text, pos, ANCHOR_RE);
  if (anchor) {
    const name = anchor[1] ?? anchor[2] ?? anchor[3];
    if (name) {
      const start = anchor.index ?? 0;
      return {
        kind: 'anchor',
        name,
        range: { from: line.from + start, to: line.from + start + anchor[0].length },
      };
    }
  }

  // Section heading: the "symbol" is the heading's AUTO-GENERATED id (US3). Only offered when the
  // heading has no explicit id — an explicit `[#id]`/`[[id]]` on the preceding line overrides the
  // derived id, so editing the text does not change the reference target (FR-005). The cursor may be
  // anywhere on the heading line (the whole line is the definition).
  const heading = SECTION_HEADING_RE.exec(text);
  if (heading) {
    const previous = line.number > 1 ? state.doc.line(line.number - 1).text : '';
    if (!EXPLICIT_ID_LINE_RE.test(previous)) {
      return { kind: 'heading', name: headingToId(heading[2]), range: { from: line.from, to: line.to } };
    }
  }

  return null;
}
