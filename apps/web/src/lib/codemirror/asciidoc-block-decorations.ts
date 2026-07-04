import { ViewPlugin, Decoration, EditorView, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { RangeSetBuilder, type Extension } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import type { Tree } from '@lezer/common';
import { tableHasExplicitHeader } from './asciidoc-table-context';

/**
 * Block-marker decorations layered on top of the grammar's token colours (feature 030).
 *
 * Two structural cues the grammar cannot express by token tag alone, because they recede or emphasise
 * only PART of a node whose body must stay readable:
 *
 *  - The leading `.` of a block title recedes to muted markup (the title text stays a foreground
 *    caption), mirroring how a heading's `=` marker recedes.
 *  - In a table, every `|` cell separator recedes to muted markup, and — when the table is a HEADER
 *    table — the first row's cell contents go bold so the column headings read as headings.
 *
 * The active authority for what IS a block title / table is the parsed syntax tree, so this walks the
 * tree (never a text heuristic) and then text-scans only WITHIN a confirmed `TableBlock` range to find
 * its pipes and header row. The pure {@link computeBlockMarkerRanges} is exported and unit-tested.
 */

/** Muted-markup class for the leading `.` of a block title. */
export const BLOCK_TITLE_MARKER_CLASS = 'cm-ad-block-title-marker';
/** Muted-markup class for a table `|` cell separator. */
export const TABLE_SEP_CLASS = 'cm-ad-table-sep';
/** Bold class for a header-row cell's content. */
export const TABLE_HEADER_CELL_CLASS = 'cm-ad-table-header-cell';
/** Bold class for the `stem:` (or `latexmath:`/`asciimath:`) prefix of an inline stem macro. */
export const STEM_PREFIX_CLASS = 'cm-ad-stem-prefix';
/** Math-chip class for the `[…]` formula body of an inline stem macro. */
export const STEM_BODY_CLASS = 'cm-ad-stem-body';

/** A half-open character range carrying the CSS class to mark it with. */
export interface BlockMarkerRange {
  /** Document offset of the range's first character. */
  from: number;
  /** Document offset just past the range's last character. */
  to: number;
  /** CSS class applied to the range. */
  cls: string;
}

/** A physical line of a table block, with its absolute document offsets. */
interface BlockLine {
  start: number;
  end: number;
  text: string;
}

/** Splits the text in `[from, to)` into physical lines carrying their absolute offsets. */
function splitLines(text: string, from: number, to: number): BlockLine[] {
  const lines: BlockLine[] = [];
  let lineStart = from;
  for (let index = from; index < to; index++) {
    if (text[index] === '\n') {
      lines.push({ start: lineStart, end: index, text: text.slice(lineStart, index) });
      lineStart = index + 1;
    }
  }
  if (lineStart < to) lines.push({ start: lineStart, end: to, text: text.slice(lineStart, to) });
  return lines;
}

/** Returns the text of the line immediately preceding the line-start offset `from` (or ''). */
function lineBefore(text: string, from: number): string {
  if (from === 0 || text[from - 1] !== '\n') return '';
  const end = from - 1;
  let start = end - 1;
  while (start >= 0 && text[start] !== '\n') start--;
  return text.slice(start + 1, end);
}

/** A table cell's trimmed-text range plus the body-line index it sits on. */
interface TableCell {
  from: number;
  to: number;
  lineIndex: number;
}

/**
 * Number of columns declared by a `cols="…"` spec, or null when there is none. A bare integer
 * (`cols=3`) is that many equal columns; a comma list (`cols="2,1"`) is one column per entry; a `N*`
 * repeat factor (`cols="3*"`, `cols="2*,1"`) contributes N columns. The width/alignment of each entry
 * is irrelevant to the count.
 */
function tableColumnCount(attributeLine: string): number | null {
  // Quoted values may contain the `,` separator (`cols="2,1"`); an unquoted value stops at the first
  // `,`/`]`/space so a following attribute (`cols=3,options=…`) is not swallowed.
  const match = attributeLine.match(/\bcols\s*=\s*(?:"([^"]*)"|([^,\]\s]+))/i);
  if (!match) return null;
  const spec = (match[1] ?? match[2]).trim();
  if (/^\d+$/.test(spec)) return Number.parseInt(spec, 10);
  let count = 0;
  for (const entry of spec.split(',')) {
    const repeat = entry.trim().match(/^(\d+)\s*\*/);
    count += repeat ? Number.parseInt(repeat[1], 10) : 1;
  }
  return count > 0 ? count : null;
}

/** Collects pipe/header-cell ranges for one confirmed `TableBlock` spanning `[from, to)`. */
function collectTableRanges(ranges: BlockMarkerRange[], text: string, from: number, to: number): void {
  const lines = splitLines(text, from, to);
  // lines[0] is the opening `|===` fence; the last line is the closing fence. Body rows sit between.
  const body = lines.slice(1, Math.max(1, lines.length - 1));
  if (body.length === 0) return;

  // Recede every `|` separator and collect each non-empty cell's trimmed-text range in document
  // order. A row is a run of `columnCount` cells and MAY span several physical lines (a header with
  // one cell per line), so cells — not lines — are the unit for finding the header.
  const cells: TableCell[] = [];
  let firstLineCellCount = 0;
  for (const [lineIndex, line] of body.entries()) {
    if (line.text.length === 0) continue;
    const pipePositions: number[] = [];
    for (let index = 0; index < line.text.length; index++) {
      if (line.text[index] === '|') {
        ranges.push({ from: line.start + index, to: line.start + index + 1, cls: TABLE_SEP_CLASS });
        pipePositions.push(index);
      }
    }
    if (firstLineCellCount === 0) firstLineCellCount = pipePositions.length;
    for (let pipe = 0; pipe < pipePositions.length; pipe++) {
      const cellStart = pipePositions[pipe] + 1;
      const cellEnd = pipe + 1 < pipePositions.length ? pipePositions[pipe + 1] : line.text.length;
      const segment = line.text.slice(cellStart, cellEnd);
      const trimmed = segment.trim();
      if (trimmed.length === 0) continue;
      const leading = segment.length - segment.trimStart().length;
      const absStart = line.start + cellStart + leading;
      cells.push({ from: absStart, to: absStart + trimmed.length, lineIndex });
    }
  }
  if (cells.length === 0) return;

  // Column count from the cols spec, else the cell count of the first content line.
  const columnCount = tableColumnCount(lineBefore(text, from)) ?? (firstLineCellCount || 1);

  // Header when the block declares it (`[%header]`/`options="header"`) OR — implicitly — when the
  // first row (its last cell) is immediately followed by a blank line (Asciidoctor's rule).
  const explicit = tableHasExplicitHeader(lineBefore(text, from));
  let implicit = false;
  if (!explicit && cells.length > columnCount) {
    const headerEndLine = cells[columnCount - 1].lineIndex;
    const nextLine = body[headerEndLine + 1];
    implicit = nextLine !== undefined && nextLine.text.trim() === '';
  }
  if (!explicit && !implicit) return;

  // Bold the header row — the first `columnCount` cells, however many physical lines they span.
  for (const cell of cells.slice(0, columnCount)) {
    ranges.push({ from: cell.from, to: cell.to, cls: TABLE_HEADER_CELL_CLASS });
  }
}

/**
 * Compute every block-marker range for the document `text` parsed into `tree`. Returns ranges sorted
 * by start offset (then end), ready to feed a {@link RangeSetBuilder}.
 *
 * @param tree - The parsed AsciiDoc syntax tree.
 * @param text - The full document text the tree was parsed from.
 * @returns The block-marker ranges in document order.
 */
export function computeBlockMarkerRanges(tree: Tree, text: string): BlockMarkerRange[] {
  const ranges: BlockMarkerRange[] = [];
  tree.iterate({
    enter: (node) => {
      switch (node.name) {
        case 'BlockTitle': {
          // The leading `.` (always the block-title's first character).
          ranges.push({ from: node.from, to: node.from + 1, cls: BLOCK_TITLE_MARKER_CLASS });
          break;
        }
        case 'TableBlock': {
          collectTableRanges(ranges, text, node.from, node.to);
          break;
        }
        case 'InlineStem': {
          // Split `stem:[…]` into the bold prefix and the chip-backed formula body. This is done HERE
          // (post-parse) rather than via grammar child nodes ON PURPOSE: the grammar matches the whole
          // macro as one ATOMIC token (`stemMark`) so a bare `stem:` in prose never opens a span. The
          // boundary is exact — `stemMark` is `(prefix) "[" ![\]\n]* "]"`, so the first `[` after the
          // node start is always the formula opener and contains no nested `[`.
          const bracket = text.indexOf('[', node.from);
          if (bracket > node.from && bracket < node.to) {
            ranges.push(
              { from: node.from, to: bracket, cls: STEM_PREFIX_CLASS },
              { from: bracket, to: node.to, cls: STEM_BODY_CLASS },
            );
          }
          break;
        }
      }
    },
  });
  ranges.sort((a, b) => a.from - b.from || a.to - b.to);
  return ranges;
}

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const text = view.state.doc.toString();
  for (const range of computeBlockMarkerRanges(syntaxTree(view.state), text)) {
    builder.add(range.from, range.to, Decoration.mark({ class: range.cls }));
  }
  return builder.finish();
}

/**
 * CM6 extension that recedes block-title `.` markers and table `|` separators and bolds table header
 * cells, layered over the grammar's token highlighting.
 *
 * @returns The block-decorations view plugin.
 */
export function asciidocBlockDecorations(): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = buildDecorations(view);
      }

      update(update: ViewUpdate) {
        // The decorations derive from the parse tree, which is rebuilt on edits; recompute when the
        // document changes or the viewport scrolls (a newly-revealed table/title must pick them up).
        if (update.docChanged || update.viewportChanged) {
          this.decorations = buildDecorations(update.view);
        }
      }
    },
    { decorations: (plugin) => plugin.decorations },
  );
}
