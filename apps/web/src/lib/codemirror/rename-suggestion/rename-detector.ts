import { StateEffect, StateField, type EditorState, type Text } from '@codemirror/state';
import { extractSymbols, type ProjectSymbol } from '@asciidocollab/asciidoc-core';
import { ATTR_DEF_RE, ANCHOR_RE, covering } from '@/lib/codemirror/asciidoc-symbol-at-cursor';
import { INLINE_SET_RE } from '@/lib/codemirror/asciidoc-attribute-fold';
import type { DocumentRange, SymbolKind } from './types';

/**
 * Detection of a symbol **definition** under the cursor, for the rename-suggestion feature (033).
 *
 * Unlike `asciidoc-symbol-at-cursor` (which also matches reference sites to seed the refactor
 * dialog), this only recognises DEFINITION tokens — an attribute definition or an explicit anchor —
 * because a rename suggestion is triggered by editing the definition, never a reference.
 * Section-heading derived IDs are handled separately and are not matched here.
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

// `ATTR_DEF_RE`, `ANCHOR_RE`, and `covering` are the shared cursor-token primitives from
// `asciidoc-symbol-at-cursor` (the refactor dialog's detector); `INLINE_SET_RE` is the single
// `{set:}` grammar from `asciidoc-attribute-fold`. Reused here so the token boundaries stay in lock
// step across every symbol detector.
// The `{set:` prefix length, used to locate the name span within an inline-set token.
const SET_PREFIX_LENGTH = 5;
// A cheap gate: a section-heading line (levels 1–6; the level-0 document title is excluded). The
// authoritative detection + id derivation is delegated to extractSymbols; this only decides whether
// the cursor line is worth the full scan.
const SECTION_HEADING_LINE_RE = /^={2,6}\s+\S/;
// An explicit id set on the line before a heading (`[#id]` / `[[id]]`) overrides the derived id.
const EXPLICIT_ID_LINE_RE = /^\[(?:#|\[)[A-Za-z][\w:.-]*/;

/**
 * The open file's attributes inherited from the documents that include it (its ancestors along the
 * include path from the project main file). A heading's auto-generated id reflects an
 * `idprefix`/`idseparator`/`sectids` set by a PARENT above the include, so seeding the symbol scan
 * with these keeps the editor's derived id in step with the server (which seeds the same way via
 * `projectInheritedAttributes`) and the preview. Empty when the file inherits nothing or the seed has
 * not been supplied. The editor keeps this in sync via {@link setRenameSeedEffect}.
 */
export const setRenameSeedEffect = StateEffect.define<ReadonlyMap<string, string>>();
export const renameSeedField = StateField.define<ReadonlyMap<string, string> | undefined>({
  create: () => undefined,
  update(value, tr) {
    for (const effect of tr.effects) if (effect.is(setRenameSeedEffect)) return effect.value;
    return value;
  },
});

// Recognising a heading definition needs the WHOLE document's symbols (the block-boundary rule plus
// the `idprefix`/`idseparator`/`sectids` in scope), but `definitionAtCursor` is called repeatedly on
// the SAME immutable document — the state machine re-validates on settle, after the usage lookup, and
// again before Apply. Memoise per (`Text`, seed) so those repeated calls collapse to a single scan; a
// keystroke produces a new `Text` (and a seed change a new map identity), so either re-extracts once.
const symbolCache = new WeakMap<Text, { seed: ReadonlyMap<string, string> | undefined; symbols: ProjectSymbol[] }>();
function documentSymbols(text: Text, seed?: ReadonlyMap<string, string>): ProjectSymbol[] {
  const cached = symbolCache.get(text);
  if (cached && cached.seed === seed) return cached.symbols;
  const symbols = extractSymbols('', text.toString(), seed);
  symbolCache.set(text, { seed, symbols });
  return symbols;
}

/**
 * The symbol definition token under the cursor, or null when the cursor is not on one.
 *
 * Matches only definition sites (attribute `:name:`, anchor `[[id]]`/`[#id]`/`anchor:id[]`), so
 * editing a reference such as `{name}` or `<<id>>` never yields a match. Position-aware:
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

  // Section heading: the "symbol" is the heading's AUTO-GENERATED id. Delegate detection and id
  // derivation to extractSymbols — the single authority for the block-boundary rule (prose like
  // `text\n== Foo` absorbs the line and defines no id), the `idprefix`/`idseparator`/`sectids`
  // attributes, and the explicit-id override. Only an AUTO id is offered: an explicit `[#id]`/`[[id]]`
  // on the preceding line means editing the title does not change the reference target, and
  // `:sectids!:` means there is no id at all (extractSymbols then emits no section here). The cursor
  // may be anywhere on the heading line (the whole line is the definition).
  if (SECTION_HEADING_LINE_RE.test(text)) {
    const previous = line.number > 1 ? state.doc.line(line.number - 1).text : '';
    if (EXPLICIT_ID_LINE_RE.test(previous)) return null;
    const seed = state.field(renameSeedField, false);
    const section = documentSymbols(state.doc, seed).find(
      (symbol) => symbol.kind === 'section' && symbol.range.from >= line.from && symbol.range.from <= line.to,
    );
    if (section) return { kind: 'heading', name: section.name, range: { from: line.from, to: line.to } };
  }

  return null;
}
