import { EditorView, GutterMarker, gutter, type BlockInfo } from '@codemirror/view';
import { codeFolding, foldable, foldedRanges, foldEffect, unfoldEffect } from '@codemirror/language';
import type { EditorState, Extension } from '@codemirror/state';
import { buildFoldMarker } from '@/lib/codemirror/fold-marker';

/**
 * The folded range overlapping the line spanning `[from, to]` (the earliest-starting one if several),
 * or null when the line has no fold. For the gutter's rendered lines this is the fold that starts on
 * the line: folds end on a newline boundary, so a following visible line's `from` never coincides with
 * a range's `to`. Mirrors `@codemirror/language`'s internal `findFold` (which reads a non-exported
 * state field) using the public {@link foldedRanges}.
 *
 * @param state - The current editor state.
 * @param from - The line's start offset.
 * @param to - The line's end offset.
 * @returns The folded range on the line, or null.
 */
export function findFoldOnLine(state: EditorState, from: number, to: number): { from: number; to: number } | null {
  let found: { from: number; to: number } | null = null;
  foldedRanges(state).between(from, to, (rangeFrom, rangeTo) => {
    if (!found || found.from > rangeFrom) found = { from: rangeFrom, to: rangeTo };
  });
  return found;
}

/**
 * A gutter cell carrying the line number and, for foldable/folded lines, a fold chevron in a reserved
 * slot beside the number (styled in `asciidoc-theme.ts`). Replaces the separate line-number and
 * fold-gutter columns with one.
 */
class LineFoldMarker extends GutterMarker {
  /**
   * @param lineNumber - The 1-based line number to display.
   * @param foldable - True when the line can be folded (and is not already folded).
   * @param folded - True when a fold starts on this line.
   */
  constructor(
    readonly lineNumber: number,
    readonly foldable: boolean,
    readonly folded: boolean,
  ) {
    super();
  }

  /**
   * @param other - The marker CodeMirror is comparing against for reuse.
   * @returns True when the rendered cell would be identical.
   */
  eq(other: LineFoldMarker): boolean {
    return (
      other.lineNumber === this.lineNumber && other.foldable === this.foldable && other.folded === this.folded
    );
  }

  /**
   * Builds the cell: a right-aligned line number, plus a fold chevron overlay for foldable/folded lines.
   *
   * @returns The gutter cell DOM node.
   */
  toDOM(): HTMLElement {
    const cell = document.createElement('span');
    const classes = ['cm-lnfold'];
    if (this.foldable || this.folded) classes.push('cm-lnfold-foldable');
    if (this.folded) classes.push('cm-lnfold-folded');
    cell.className = classes.join(' ');
    const number = document.createElement('span');
    number.className = 'cm-lnfold-num';
    number.textContent = String(this.lineNumber);
    cell.append(number);
    if (this.foldable || this.folded) {
      const chevron = buildFoldMarker(!this.folded);
      chevron.classList.add('cm-lnfold-chev');
      cell.append(chevron);
    }
    return cell;
  }
}

/** Builds the marker for one gutter line: its number and fold state. */
function lineFoldMarker(view: EditorView, line: BlockInfo): LineFoldMarker {
  const { state } = view;
  const lineNumber = state.doc.lineAt(line.from).number;
  const folded = findFoldOnLine(state, line.from, line.to);
  const canFold = folded === null && foldable(state, line.from, line.to) !== null;
  return new LineFoldMarker(lineNumber, canFold, folded !== null);
}

/**
 * A single gutter that shows line numbers and folds sections: a fold chevron sits beside the line
 * number on every foldable line, so folding needs no separate column of its own. Replaces
 * `lineNumbers()` plus `foldGutter()`, and carries `codeFolding()` — the fold state the old
 * `foldGutter()` used to provide.
 *
 * @returns The combined line-number + fold gutter extension.
 */
export function lineNumbersWithFold(): Extension {
  return [
    codeFolding(),
    gutter({
      class: 'cm-lnfold-gutter',
      lineMarker: (view, line) => lineFoldMarker(view, line),
      // Recompute on doc edits (numbers shift), viewport moves (new visible lines), and fold changes.
      lineMarkerChange: (update) =>
        update.docChanged ||
        update.viewportChanged ||
        update.transactions.some((tr) =>
          tr.effects.some((effect) => effect.is(foldEffect) || effect.is(unfoldEffect)),
        ),
      domEventHandlers: {
        // Click a foldable/folded line's cell to toggle it — the same gesture as the stock fold gutter.
        click(view, line) {
          const folded = findFoldOnLine(view.state, line.from, line.to);
          if (folded !== null) {
            view.dispatch({ effects: unfoldEffect.of(folded) });
            return true;
          }
          const range = foldable(view.state, line.from, line.to);
          if (range === null) return false;
          view.dispatch({ effects: foldEffect.of(range) });
          return true;
        },
      },
    }),
  ];
}
