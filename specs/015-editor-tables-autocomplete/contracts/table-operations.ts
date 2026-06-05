/**
 * Contract: asciidoc-table-operations
 *
 * All functions are pure (no side effects, no CodeMirror imports).
 * Input is always the raw AsciiDoc text of a complete table block
 * (from the opening |=== to the closing |===, inclusive of both delimiter lines).
 * Output is a new string or a TableOpResult discriminated union.
 *
 * These signatures constitute the public API contract for the table
 * operations module. Implementations must conform exactly; tests are
 * written against this contract, not internal helpers.
 */

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export type TableOpResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: string };

// ---------------------------------------------------------------------------
// Core parsing (used internally by all operations; also exported for testing)
// ---------------------------------------------------------------------------

export interface ParsedTableRow {
  cells: string[];
  rawLines: string[];
}

export interface ParsedTable {
  openDelim: string;
  colSpecLine: string | null;
  colSpecEntries: string[] | null;
  headerRows: ParsedTableRow[];
  bodyRows: ParsedTableRow[];
  closeDelim: string;
}

/** Parse the raw text of an AsciiDoc table block into a structured representation. */
export declare function parseTable(text: string): ParsedTable;

/** Serialize a ParsedTable back to AsciiDoc source text. Inverse of parseTable. */
export declare function serializeTable(table: ParsedTable): string;

// ---------------------------------------------------------------------------
// Row operations
// ---------------------------------------------------------------------------

/**
 * Insert an empty row immediately after the given 0-based row index.
 * afterIndex = -1 inserts before all body rows.
 * Never blocked.
 */
export declare function addRow(tableText: string, afterIndex: number): string;

/**
 * Remove the body row at the given 0-based index.
 * Blocked when only 1 body row remains (reason: "Cannot remove the last row").
 */
export declare function removeRow(
  tableText: string,
  rowIndex: number,
): TableOpResult<string>;

// ---------------------------------------------------------------------------
// Column operations
// ---------------------------------------------------------------------------

/**
 * Insert an empty column at the given 0-based column index.
 * when before=true: insert before atIndex; when false: insert after atIndex.
 * If a cols= spec is present, inserts a "1" entry at the corresponding position.
 * Never blocked.
 */
export declare function addColumn(
  tableText: string,
  atIndex: number,
  before: boolean,
): string;

/**
 * Remove the column at the given 0-based index from every row.
 * Blocked when: only 1 column remains, OR checkSpanConflict(tableText, columnIndex) is true.
 * Reason strings:
 *   "Cannot remove the last column"
 *   "Column ${columnIndex + 1} is affected by a spanning cell"
 * If a cols= spec is present, removes the corresponding entry.
 */
export declare function removeColumn(
  tableText: string,
  columnIndex: number,
): TableOpResult<string>;

/**
 * Move the column at fromIndex one step in the given direction.
 * Blocked when: only 1 column remains, OR either source or target is affected by a spanning cell.
 * Reason strings:
 *   "Cannot move the only column"
 *   "Column ${source + 1} is affected by a spanning cell"
 *   "Column ${target + 1} is affected by a spanning cell"
 * If a cols= spec is present, swaps the corresponding entries.
 */
export declare function moveColumn(
  tableText: string,
  fromIndex: number,
  direction: 'left' | 'right',
): TableOpResult<string>;

// ---------------------------------------------------------------------------
// Format operation
// ---------------------------------------------------------------------------

/**
 * Pad each cell in every row with trailing spaces so all cells in the same
 * column have the same display width (Unicode code point count).
 * Delimiter lines (|===) and the cols= line are not modified.
 * Returns a new table text string; undo is handled by CodeMirror's history.
 */
export declare function formatTable(tableText: string): string;

// ---------------------------------------------------------------------------
// Span conflict detection (exported for use in toolbar disabled-state logic)
// ---------------------------------------------------------------------------

/**
 * Return true if any row contains a spanning cell marker (e.g. "2+|") that
 * overlaps columnIndex or targetIndex (when provided).
 *
 * A spanning cell at position p with span N occupies columns p through p+N-1.
 * Conflict exists if columnIndex (or targetIndex) falls within [p, p+N-1].
 */
export declare function checkSpanConflict(
  tableText: string,
  columnIndex: number,
  targetIndex?: number,
): boolean;
