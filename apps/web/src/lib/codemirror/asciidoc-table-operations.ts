/** Discriminated union result for table mutations that may be blocked by spans or constraints. */
export type TableOpResult<T> =
  | { /** Indicates the operation succeeded. */
  ok: true; /** New table text after the operation. */
  value: T }
  | { /** Indicates the operation was blocked. */
  ok: false; /** Human-readable explanation of why the operation was blocked. */
  reason: string };

/** A single parsed row from an AsciiDoc table. */
export interface ParsedTableRow {
  /** Cell text content in column order. */
  cells: string[];
  /** Raw source lines that produced this row. */
  rawLines: string[];
}

/** A fully parsed AsciiDoc table structure. */
export interface ParsedTable {
  /** Opening delimiter (`|===`). */
  openDelim: string;
  /** Full `[cols=...]` attribute line, or null if absent. */
  colSpecLine: string | null;
  /** Parsed column spec values, or null if absent. */
  colSpecEntries: string[] | null;
  /** Rows before the first blank line (header section). */
  headerRows: ParsedTableRow[];
  /** Rows after the first blank line (body section). */
  bodyRows: ParsedTableRow[];
  /** Closing delimiter (`|===`). */
  closeDelim: string;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function parseCells(line: string): string[] {
  const parts = line.split('|');
  return parts.slice(1).map((s) => s.trim());
}

function serializeRow(cells: string[]): string {
  return cells.map((c) => `|${c}`).join(' ');
}

function parseColSpecEntries(line: string): string[] | null {
  const match = line.match(/cols="([^"]*)"/);
  if (!match) return null;
  return match[1].split(',').map((s) => s.trim());
}

function colCount(table: ParsedTable): number {
  return (table.bodyRows[0] ?? table.headerRows[0])?.cells.length ?? 0;
}

function emptyRow(count: number): ParsedTableRow {
  const cells = Array.from({ length: count }, () => '');
  return { cells, rawLines: [serializeRow(cells)] };
}

/**
 * If `original` ended with `\n` and `result` does not, appends `\n`.
 * All public table operations call this to preserve a document's trailing newline.
 */
function preserveTrailingNewline(original: string, result: string): string {
  return original.endsWith('\n') && !result.endsWith('\n') ? result + '\n' : result;
}

/**
 * Inserts an empty cell (`| `) before the `insertAt`-th `|` in a raw row line.
 * Operating on the raw line (not on trimmed cells) preserves any existing column
 * padding that was added by formatTable.
 */
function insertCellIntoRawLine(rawLine: string, insertAt: number): string {
  const pipes: number[] = [];
  for (const [index, char] of [...rawLine].entries()) {
    if (char === '|') pipes.push(index);
  }
  const insertPos = insertAt < pipes.length ? pipes[insertAt] : rawLine.length;
  return rawLine.slice(0, insertPos) + '| ' + rawLine.slice(insertPos);
}

/**
 * Removes the cell at `columnIndex` from a raw row line, from its opening `|`
 * up to (but not including) the next `|`.  Preserves spacing of other columns.
 */
function removeCellFromRawLine(rawLine: string, columnIndex: number): string {
  const pipes: number[] = [];
  for (const [index, char] of [...rawLine].entries()) {
    if (char === '|') pipes.push(index);
  }
  if (columnIndex >= pipes.length) return rawLine;
  const start = pipes[columnIndex];
  const end = pipes[columnIndex + 1] ?? rawLine.length;
  return rawLine.slice(0, start) + rawLine.slice(end);
}

// ── parseTable ────────────────────────────────────────────────────────────────

/** Parses AsciiDoc table text into a structured representation. */
export function parseTable(text: string): ParsedTable {
  const lines = text.split('\n');
  let index = 0;

  let colSpecLine: string | null = null;
  let colSpecEntries: string[] | null = null;

  if (lines[index]?.startsWith('[')) {
    colSpecLine = lines[index];
    colSpecEntries = parseColSpecEntries(colSpecLine);
    index++;
  }

  const openDelim = lines[index++] ?? '|===';

  let closeIndex = lines.length - 1;
  while (closeIndex > index && lines[closeIndex].trim() === '') closeIndex--;
  const closeDelim = lines[closeIndex] ?? '|===';

  const middle = lines.slice(index, closeIndex);
  const firstEmpty = middle.findIndex((l) => l.trim() === '');

  let headerRows: ParsedTableRow[];
  let bodyLines: string[];

  if (firstEmpty === -1) {
    headerRows = [];
    bodyLines = middle.filter((l) => l.trim() !== '');
  } else {
    headerRows = middle
      .slice(0, firstEmpty)
      .filter((l) => l.trim() !== '')
      .map((l) => ({ cells: parseCells(l), rawLines: [l] }));
    bodyLines = middle.slice(firstEmpty + 1).filter((l) => l.trim() !== '');
  }

  const bodyRows = bodyLines.map((l): ParsedTableRow => ({ cells: parseCells(l), rawLines: [l] }));

  return { openDelim, colSpecLine, colSpecEntries, headerRows, bodyRows, closeDelim };
}

// ── serializeTable ────────────────────────────────────────────────────────────

/** Serializes a ParsedTable back into AsciiDoc table text. */
export function serializeTable(table: ParsedTable): string {
  const parts: string[] = [];

  if (table.colSpecLine !== null) {
    if (table.colSpecEntries === null) {
      parts.push(table.colSpecLine);
    } else {
      parts.push(`[cols="${table.colSpecEntries.join(',')}"]`);
    }
  }

  parts.push(table.openDelim);

  for (const row of table.headerRows) parts.push(row.rawLines[0] ?? serializeRow(row.cells));
  if (table.headerRows.length > 0) parts.push('');
  for (const row of table.bodyRows) parts.push(row.rawLines[0] ?? serializeRow(row.cells));

  parts.push(table.closeDelim);
  return parts.join('\n');
}

// ── checkSpanConflict ─────────────────────────────────────────────────────────

/** Returns true if `columnIndex` (or `targetIndex`) is covered by a spanning cell in `tableText`. */
export function checkSpanConflict(
  tableText: string,
  columnIndex: number,
  targetIndex?: number,
): boolean {
  const lines = tableText.split('\n');

  for (const line of lines) {
    if (line.startsWith('|===') || line.startsWith('[') || line.trim() === '') continue;

    // Scan each `|` in the row to compute column positions and detect span markers.
    // A span marker immediately precedes `|` in the form: N+ (possibly with alignment <,>,^)
    // e.g. '2+|', '^2+|', '>3+|'
    let colPos = 0;
    for (let index = 0; index < line.length; index++) {
      if (line[index] !== '|') continue;

      // Extract up to 20 chars before this | to find a span specifier
      const before = line.slice(Math.max(0, index - 20), index);
      const spanMatch = before.match(/(?<!\d)(\d+)\+[<>^.]*$/);
      const span = spanMatch ? Number.parseInt(spanMatch[1], 10) : 1;

      // Only spanning cells (span > 1) create conflicts
      if (span > 1) {
        for (let s = 0; s < span; s++) {
          const col = colPos + s;
          if (col === columnIndex) return true;
          if (targetIndex !== undefined && col === targetIndex) return true;
        }
      }

      colPos += span;
    }
  }

  return false;
}

// ── addRow ────────────────────────────────────────────────────────────────────

/** Inserts an empty row after body row `afterIndex` (-1 inserts before all rows). */
export function addRow(tableText: string, afterIndex: number): string {
  const table = parseTable(tableText);
  const cols = colCount(table);
  const newRow = emptyRow(cols);
  table.bodyRows.splice(afterIndex + 1, 0, newRow);
  return preserveTrailingNewline(tableText, serializeTable(table));
}

// ── removeRow ─────────────────────────────────────────────────────────────────

/** Removes a body row by index, or returns an error if it is the last row. */
export function removeRow(tableText: string, rowIndex: number): TableOpResult<string> {
  const table = parseTable(tableText);
  if (table.bodyRows.length <= 1) {
    return { ok: false, reason: 'Cannot remove the last row' };
  }
  table.bodyRows.splice(rowIndex, 1);
  return { ok: true, value: preserveTrailingNewline(tableText, serializeTable(table)) };
}

// ── addColumn ─────────────────────────────────────────────────────────────────

/** Inserts an empty column before (`before=true`) or after (`before=false`) `atIndex`. */
export function addColumn(tableText: string, atIndex: number, before: boolean): string {
  const table = parseTable(tableText);
  const insertAt = before ? atIndex : atIndex + 1;

  for (const row of [...table.headerRows, ...table.bodyRows]) {
    const originalRawLine = row.rawLines[0] ?? serializeRow(row.cells);
    row.cells.splice(insertAt, 0, '');
    row.rawLines = [insertCellIntoRawLine(originalRawLine, insertAt)];
  }

  if (table.colSpecEntries !== null) {
    table.colSpecEntries.splice(insertAt, 0, '1');
  }

  return preserveTrailingNewline(tableText, serializeTable(table));
}

// ── removeColumn ──────────────────────────────────────────────────────────────

/** Removes the column at `columnIndex`, or returns an error if blocked by spans or only one column remains. */
export function removeColumn(tableText: string, columnIndex: number): TableOpResult<string> {
  const table = parseTable(tableText);

  if (colCount(table) <= 1) {
    return { ok: false, reason: 'Cannot remove the last column' };
  }

  if (checkSpanConflict(tableText, columnIndex)) {
    return { ok: false, reason: `Column ${columnIndex + 1} is affected by a spanning cell` };
  }

  for (const row of [...table.headerRows, ...table.bodyRows]) {
    const originalRawLine = row.rawLines[0] ?? serializeRow(row.cells);
    row.cells.splice(columnIndex, 1);
    row.rawLines = [removeCellFromRawLine(originalRawLine, columnIndex)];
  }

  if (table.colSpecEntries !== null) {
    table.colSpecEntries.splice(columnIndex, 1);
  }

  return { ok: true, value: preserveTrailingNewline(tableText, serializeTable(table)) };
}

// ── moveColumn ────────────────────────────────────────────────────────────────

/** Swaps column `fromIndex` with its left or right neighbor, or returns an error if blocked. */
export function moveColumn(
  tableText: string,
  fromIndex: number,
  direction: 'left' | 'right',
): TableOpResult<string> {
  const table = parseTable(tableText);
  const cols = colCount(table);

  if (cols <= 1) {
    return { ok: false, reason: 'Cannot move the only column' };
  }

  const toIndex = direction === 'left' ? fromIndex - 1 : fromIndex + 1;

  if (toIndex < 0 || toIndex >= cols) {
    return { ok: false, reason: `Cannot move column ${fromIndex + 1} ${direction}` };
  }

  if (checkSpanConflict(tableText, fromIndex)) {
    return { ok: false, reason: `Column ${fromIndex + 1} is affected by a spanning cell` };
  }

  if (checkSpanConflict(tableText, toIndex)) {
    return { ok: false, reason: `Column ${toIndex + 1} is affected by a spanning cell` };
  }

  for (const row of [...table.headerRows, ...table.bodyRows]) {
    const temporary = row.cells[fromIndex];
    row.cells[fromIndex] = row.cells[toIndex];
    row.cells[toIndex] = temporary;
    row.rawLines = [serializeRow(row.cells)];
  }

  if (table.colSpecEntries !== null) {
    const temporary = table.colSpecEntries[fromIndex];
    table.colSpecEntries[fromIndex] = table.colSpecEntries[toIndex];
    table.colSpecEntries[toIndex] = temporary;
  }

  return { ok: true, value: preserveTrailingNewline(tableText, serializeTable(table)) };
}

// ── formatTable ───────────────────────────────────────────────────────────────

/** Pads each cell with trailing spaces so all columns align by maximum content width. */
export function formatTable(tableText: string): string {
  const table = parseTable(tableText);
  const all = [...table.headerRows, ...table.bodyRows];

  if (all.length === 0) return tableText;

  const cols = colCount(table);
  const widths = Array.from({ length: cols }, () => 0);

  for (const row of all) {
    for (let c = 0; c < row.cells.length && c < cols; c++) {
      widths[c] = Math.max(widths[c], [...row.cells[c]].length);
    }
  }

  for (const row of all) {
    for (let c = 0; c < row.cells.length && c < cols; c++) {
      const cell = row.cells[c];
      row.cells[c] = cell + ' '.repeat(Math.max(0, widths[c] - [...cell].length));
    }
    row.rawLines = [serializeRow(row.cells)];
  }

  return preserveTrailingNewline(tableText, serializeTable(table));
}
