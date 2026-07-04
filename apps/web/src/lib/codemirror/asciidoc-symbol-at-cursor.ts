import type { EditorView } from '@codemirror/view';
import type { RenameSymbolKind } from '@/lib/api/projects';

/** A renameable symbol detected under the editor cursor, ready to seed the refactor dialog. */
export interface CursorSymbol {
  /** Which refactor kind the symbol maps to (id/anchor vs attribute). */
  kind: RenameSymbolKind;
  /** The symbol's name (the id for anchors/xrefs, the attribute name for attributes). */
  name: string;
}

// Attribute reference `{name}` and definition `:name:` / `:name!:` (line-anchored).
const ATTR_REF_RE = /\{([A-Za-z0-9][\w-]*)\}/g;
/** Attribute definition `:name:` / `:name!:`, anchored to the start of the line. */
export const ATTR_DEF_RE = /^:([A-Za-z0-9][\w-]*)!?:/g;
/** Explicit anchors: `[[id]]`, `[#id]`, and the `anchor:id[` macro opener. */
export const ANCHOR_RE = /\[\[([A-Za-z][\w:.-]*)\]\]|\[#([A-Za-z][\w:.-]*)\]|anchor:([A-Za-z][\w:.-]*)\[/g;
// Cross-references: angle-bracket `<<id>>` / `<<id,label>>` and the `xref:target[…]` macro.
const XREF_ANGLE_RE = /<<([^<>,\]]+)(?:,[^<>]*)?>>/g;
const XREF_MACRO_RE = /xref:([^\s[\]]+)\[[^\]]*\]/g;

/** The match of `re` whose token covers `pos` within `line` (end-inclusive), or null. */
export function covering(line: string, pos: number, re: RegExp): RegExpMatchArray | null {
  for (const match of line.matchAll(re)) {
    const start = match.index ?? 0;
    if (pos >= start && pos <= start + match[0].length) return match;
  }
  return null;
}

/** The fragment id of an xref target (`path#id` / `#id` → `id`), trimmed. */
function xrefFragment(target: string): string {
  const trimmed = target.trim();
  return trimmed.includes('#') ? trimmed.slice(trimmed.lastIndexOf('#') + 1) : trimmed;
}

/**
 * The renameable AsciiDoc symbol under the cursor, or null when the cursor is not on one. Used to
 * pre-fill the refactor dialog: an attribute reference/definition maps to the `attribute` kind; an
 * anchor or cross-reference maps to the `anchor` kind (find-usages/rename key off the anchor id).
 * Position-aware so it never picks a token elsewhere on the line.
 */
export function symbolAtCursor(view: Pick<EditorView, 'state'>): CursorSymbol | null {
  const head = view.state.selection.main.head;
  const line = view.state.doc.lineAt(head);
  const text = line.text;
  const pos = head - line.from;

  const attributeReference = covering(text, pos, ATTR_REF_RE);
  if (attributeReference) return { kind: 'attribute', name: attributeReference[1] };

  const attributeDefinition = covering(text, pos, ATTR_DEF_RE);
  if (attributeDefinition) return { kind: 'attribute', name: attributeDefinition[1] };

  const anchor = covering(text, pos, ANCHOR_RE);
  if (anchor) {
    const name = anchor[1] ?? anchor[2] ?? anchor[3];
    if (name) return { kind: 'anchor', name };
  }

  const xref = covering(text, pos, XREF_ANGLE_RE) ?? covering(text, pos, XREF_MACRO_RE);
  if (xref) {
    const name = xrefFragment(xref[1]);
    if (name) return { kind: 'anchor', name };
  }

  return null;
}
