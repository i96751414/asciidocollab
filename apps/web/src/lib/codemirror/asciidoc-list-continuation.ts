/**
 * CodeMirror 6 Enter command that auto-continues AsciiDoc lists.
 *
 * Registered at `Prec.high` so it is consulted before `defaultKeymap`'s newline binding:
 * when the cursor is on a recognized list item the command continues or exits the list in a
 * single transaction (one undo step) and returns `true` to consume the keystroke;
 * otherwise it returns `false` and the plain newline runs unchanged.
 */
import { keymap, type EditorView } from '@codemirror/view';
import { Prec, type EditorState } from '@codemirror/state';
import { syntaxTree, ensureSyntaxTree } from '@codemirror/language';
import type { SyntaxNode } from '@lezer/common';
import { parseListMarker, type ListMarker } from './asciidoc-list-item';

/**
 * Verbatim / delimited block node kinds inside which a leading `*` or `.` is literal text, so
 * continuation must be suppressed. The literal `....` block (`LiteralBlock`) is added
 * by feature 021 alongside the blocks the grammar already covers.
 */
const SUPPRESSING_BLOCKS = new Set([
  'ListingBlock', 'LiteralBlock', 'PassthroughBlock', 'CommentBlock',
  'TableBlock', 'CsvTableBlock', 'DsvTableBlock',
]);

/**
 * Returns the marker text (without a trailing space) to emit for the continued item:
 * checklists reset to an unchecked box keeping their `*`/`-` marker; explicit ordered
 * items advance to the next number; every other family reuses its own marker.
 */
function nextMarkerText(marker: ListMarker): string {
  if (marker.kind === 'checklist') return `${marker.marker} [ ]`;
  if (marker.kind === 'ordered' && marker.ordinal !== null) return `${marker.ordinal + 1}.`;
  return marker.marker;
}

/**
 * Walks the syntax-tree ancestry at `pos` looking for an enclosing verbatim/delimited block.
 * The cursor's direct node inside such a block is typically an internal error node, so the
 * suppressing block is found as an ancestor, not the node itself.
 */
function isInVerbatimBlock(state: EditorState, pos: number): boolean {
  const tree = ensureSyntaxTree(state, pos) ?? syntaxTree(state);
  let node: SyntaxNode | null = tree.resolveInner(pos, -1);
  while (node) {
    if (SUPPRESSING_BLOCKS.has(node.name)) return true;
    node = node.parent;
  }
  return false;
}

/**
 * Enter command: continues or exits an AsciiDoc list in a single transaction, or falls through.
 *
 * Continue (recognized, non-empty item): replaces any selection and inserts `\n` + the item's
 * leading indentation + the continued marker + a space, leaving the cursor after the marker;
 * text after the cursor moves into the new item. Exit (empty item):
 * removes the marker, leaving an ordinary blank line at the original indentation.
 * Fall through (not a list, or inside a verbatim block): returns `false` so `defaultKeymap`
 * inserts a plain newline. A single `dispatch` per Enter means a single undo
 * step on both the native-history and Yjs-UndoManager paths.
 *
 * @param view - The active editor view.
 * @returns `true` when the keystroke was handled, `false` to fall through to the next binding.
 */
export function continueList(view: EditorView): boolean {
  const { state } = view;
  // Read-only documents must never be mutated. The default newline command checks this, but
  // ours runs first (Prec.high) and dispatches programmatically, which the readOnly facet does
  // not block — so guard explicitly (otherwise a read-only viewer's Enter would edit the doc,
  // and on the collab path the shared Y.Text).
  if (state.readOnly) return false;
  const range = state.selection.main;
  // Parse (and check suppression) at the line where content resumes after the edit — the start
  // of the selection, which equals the cursor for a collapsed range. Using the selection HEAD
  // would key off the wrong line for a multi-line or backward selection.
  const line = state.doc.lineAt(range.from);
  const marker = parseListMarker(line.text);
  if (!marker) return false;
  if (isInVerbatimBlock(state, range.from)) return false;

  if (marker.isEmpty) {
    // Exit: drop everything after the indentation, leaving a blank, still-indented line.
    const from = line.from + marker.indent.length;
    view.dispatch({
      changes: { from, to: line.to, insert: '' },
      selection: { anchor: from },
      userEvent: 'delete',
      scrollIntoView: true,
    });
    return true;
  }

  // Don't continue when the edit starts within the indentation or the marker itself (e.g. Enter
  // at column 0 of a bullet) — inserting there would duplicate the marker (`* * x`). Fall through
  // to a plain newline instead, which pushes the item down.
  if (range.from < line.from + marker.contentStart) return false;

  // Continue: replace any selection with the new line + indent + continued marker + space.
  const insert = `\n${marker.indent}${nextMarkerText(marker)} `;
  view.dispatch({
    changes: { from: range.from, to: range.to, insert },
    selection: { anchor: range.from + insert.length },
    userEvent: 'input',
    scrollIntoView: true,
  });
  return true;
}

/** Enter keymap extension, at `Prec.high` so it precedes `defaultKeymap` (see contract). */
export const listContinuationKeymap = Prec.high(
  keymap.of([{ key: 'Enter', run: continueList }]),
);
