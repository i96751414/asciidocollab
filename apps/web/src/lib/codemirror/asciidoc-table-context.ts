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

/** Parses table structure and cursor position from the raw table text. */
export function parseTableContext(
  text: string,
  cursorOffset: number,
): Omit<TableContext, 'tableFrom' | 'tableTo'> | null {
  const lines = text.split('\n');
  let hasColSpec = false;
  let startLineIndex = 0;

  if (lines[0]?.startsWith('[')) {
    hasColSpec = true;
    startLineIndex = 1;
  }

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
      const context = parseTableContext(tableText, cursorOffset);

      if (context) {
        found = { tableFrom: node.from, tableTo: node.to, ...context };
      }
      return false; // don't descend into tableBody/tableRow children
    });

    return found;
  },
});
