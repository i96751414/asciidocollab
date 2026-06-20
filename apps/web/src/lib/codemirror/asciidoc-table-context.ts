import { StateField } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';

/** Table position and shape context derived from the syntax tree at the cursor. */
export interface TableContext {
  /** Document offset where the table block starts. */
  tableFrom: number;
  /** Document offset where the table block ends. */
  tableTo: number;
  /** Zero-based index of the body row containing the cursor (-1 not possible; 0 = first body row). */
  cursorRowIndex: number;
  /** Zero-based index of the column containing the cursor. */
  cursorColumnIndex: number;
  /** Total number of body rows in the table (header rows not counted). */
  rowCount: number;
  /** Total number of columns in the table. */
  columnCount: number;
  /** Whether the table has a leading `[cols=...]` attribute line. */
  hasColSpec: boolean;
  /** True when the cursor is inside a header row (before the blank-line separator). */
  isInHeader: boolean;
}

/**
 * Reports whether a table's leading `[...]` block-attribute line marks the first row as a header via
 * the explicit `options="header"` long form or the `%header` / `[header,…]` shorthands (FR-046). This
 * is the single source of truth for explicit-header detection, shared by the cursor-context parser
 * here and the header-cell bolding decoration (asciidoc-block-decorations.ts), so the two never
 * disagree on what counts as a header.
 */
export function tableHasExplicitHeader(attributeLine: string): boolean {
  return /options\s*=\s*"[^"]*\bheader\b/i.test(attributeLine) || /(?:\[|,|%)\s*header\b/i.test(attributeLine);
}

/**
 * Parses table structure and cursor position from the raw table text.
 *
 * @param text - The table block text (the `|===…|===` slice; may start with a `[...]` attribute line).
 * @param cursorOffset - Cursor offset relative to `text`.
 * @param explicitHeaderOption - True when the table's (separate) block-attribute line declares a header
 *   via `[%header]` / `options="header"`. The `TableBlock` node does not include that line, so the
 *   caller (the field) detects it on the preceding sibling and passes it here — keeping this parser in
 *   agreement with the header-cell decoration, which detects the same option from the same line.
 */
export function parseTableContext(
  text: string,
  cursorOffset: number,
  explicitHeaderOption = false,
): Omit<TableContext, 'tableFrom' | 'tableTo'> | null {
  const lines = text.split('\n');
  let hasColSpec = false;
  let startLineIndex = 0;

  if (lines[0]?.startsWith('[')) {
    hasColSpec = true;
    startLineIndex = 1;
  }
  // An explicit header option (`[%header]` / `options="header"`) marks the first content row as a
  // header even without a blank-line separator after it (applied post-classification below). The
  // option may be passed by the caller (production: attr line is outside the TableBlock node) or be
  // present inline in `text` (a `[...]` first line, as in direct-call tests).
  const explicitHeader = explicitHeaderOption || (hasColSpec && tableHasExplicitHeader(lines[0] ?? ''));

  // Identify which line number the cursor is on.
  let cursorLine = -1;
  let charOffset = 0;
  for (const [index, line] of lines.entries()) {
    const lineStart = charOffset;
    const lineEnd = charOffset + line.length;
    if (cursorOffset >= lineStart && cursorOffset <= lineEnd) cursorLine = index;
    charOffset += line.length + 1;
  }

  // Separate header rows from body rows, tracking both text and line indices.
  // Using line indices (not text content) prevents misidentification when two rows
  // have identical text — indexOf on text would always return the first match.
  const headerLines: string[] = [];
  const bodyLines: string[] = [];
  const headerLineIndices: number[] = [];
  const bodyLineIndices: number[] = [];
  let foundHeaderSeparator = false;

  for (let index = startLineIndex + 1; index < lines.length; index++) {
    const line = lines[index];
    if (line.startsWith('|===')) break;
    if (!foundHeaderSeparator && line.trim() === '') {
      foundHeaderSeparator = true;
      continue;
    }
    if (line.trim() !== '') {
      if (foundHeaderSeparator) {
        bodyLines.push(line);
        bodyLineIndices.push(index);
      } else {
        headerLines.push(line);
        headerLineIndices.push(index);
      }
    }
  }

  // An explicit header option with NO blank-line separator: promote the first content row to the
  // header set and treat the rest as body, so this parser agrees with the header-cell decoration.
  // Only when there is a body row to keep (a lone header row stays a single completable body row).
  if (explicitHeader && !foundHeaderSeparator && headerLines.length > 1) {
    bodyLines.push(...headerLines.slice(1));
    bodyLineIndices.push(...headerLineIndices.slice(1));
    headerLines.length = 1;
    headerLineIndices.length = 1;
    foundHeaderSeparator = true;
  }

  // For tables without a header/body separator every content row is a body row.
  const effectiveBodyLines = foundHeaderSeparator ? bodyLines : headerLines;
  const effectiveBodyLineIndices = foundHeaderSeparator ? bodyLineIndices : headerLineIndices;
  const effectiveHeaderLineIndices = foundHeaderSeparator ? headerLineIndices : [];

  if (effectiveBodyLines.length === 0) return null;

  const rowCount = effectiveBodyLines.length;
  const allContentLines = [...(foundHeaderSeparator ? headerLines : []), ...effectiveBodyLines];
  const columnCount = allContentLines.length === 0
    ? 0
    : Math.max(...allContentLines.map((line) => line.split('|').length - 1));

  // Determine cursor row index and column using line numbers, not text matching.
  let cursorRowIndex = 0;
  let cursorColumnIndex = 0;
  let isInHeader = false;

  if (cursorLine >= 0) {
    const bodyIndex = effectiveBodyLineIndices.indexOf(cursorLine);
    const headerIndex = effectiveHeaderLineIndices.indexOf(cursorLine);

    if (bodyIndex !== -1) {
      cursorRowIndex = bodyIndex;
    } else if (headerIndex !== -1) {
      isInHeader = true;
      cursorRowIndex = 0;
    }

    const lineText = lines[cursorLine] ?? '';
    if (lineText.trim() !== '' && !lineText.startsWith('|===') && !lineText.startsWith('[')) {
      const lineStart = text.lastIndexOf('\n', cursorOffset - 1) + 1;
      const cursorInLine = cursorOffset - lineStart;
      const beforeCursor = lineText.slice(0, cursorInLine);
      cursorColumnIndex = (beforeCursor.match(/\|/g) ?? []).length - 1;
      if (cursorColumnIndex < 0) cursorColumnIndex = 0;
    }
  }

  return { cursorRowIndex, cursorColumnIndex, rowCount, columnCount, hasColSpec, isInHeader };
}

export const tableContextField = StateField.define<TableContext | null>({
  create() {
    return null;
  },

  update(value, tr) {
    if (!tr.docChanged && !tr.selection) return value;

    const cursorPos = tr.state.selection.main.head;
    const tree = syntaxTree(tr.state);
    let found: TableContext | null = null;

    tree.cursor().iterate((node) => {
      // Skip every non-table block's subtree — TableBlock is always a direct child of
      // Document in this grammar, so we never need to descend into paragraphs etc.
      if (node.name !== 'TableBlock' && node.name !== 'Document') return false;
      if (node.name !== 'TableBlock') return; // descend into Document
      if (cursorPos < node.from || cursorPos > node.to) return false; // wrong table

      const tableText = tr.state.doc.sliceString(node.from, node.to);
      const cursorOffset = cursorPos - node.from;
      // The `[%header]`/`options="header"` attribute line is a SEPARATE node before TableBlock, so
      // read it off the preceding sibling and pass the header signal in — the decoration reads the
      // same line, so both agree on whether the first row is a header.
      const previous = node.node.prevSibling;
      const explicitHeaderOption = previous
        ? tableHasExplicitHeader(tr.state.doc.sliceString(previous.from, previous.to))
        : false;
      const context = parseTableContext(tableText, cursorOffset, explicitHeaderOption);

      if (context) {
        found = { tableFrom: node.from, tableTo: node.to, ...context };
      }
      return false; // don't descend into tableBody/tableRow children
    });

    return found;
  },
});
