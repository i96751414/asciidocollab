import {
  parseTable,
  serializeTable,
  addRow,
  removeRow,
  addColumn,
  removeColumn,
  moveColumn,
  formatTable,
  checkSpanConflict,
} from '@/lib/codemirror/asciidoc-table-operations';

// ── Helpers ───────────────────────────────────────────────────────────────────

const TABLE_2COL = '|===\n|header1 |header2\n\n|cell1 |cell2\n|===';
const TABLE_3COL = '|===\n|h1 |h2 |h3\n\n|a |b |c\n|d |e |f\n|===';
const TABLE_NO_HEADER = '|===\n|a |b\n|c |d\n|===';
const TABLE_WITH_COLS = '[cols="1,2"]\n|===\n|a |b\n|===';
const TABLE_ONE_ROW = '|===\n|a |b\n|===';
const TABLE_ONE_COL = '|===\n|a\n|b\n|===';

// ── parseTable ────────────────────────────────────────────────────────────────

describe('parseTable', () => {
  test('parses a 2-column table with header and body rows', () => {
    const parsed = parseTable(TABLE_2COL);
    expect(parsed.openDelim).toBe('|===');
    expect(parsed.closeDelim).toBe('|===');
    expect(parsed.headerRows.length).toBe(1);
    expect(parsed.headerRows[0].cells).toEqual(['header1', 'header2']);
    expect(parsed.bodyRows.length).toBe(1);
    expect(parsed.bodyRows[0].cells).toEqual(['cell1', 'cell2']);
  });

  test('parses a 3-column table with multiple body rows', () => {
    const parsed = parseTable(TABLE_3COL);
    expect(parsed.bodyRows.length).toBe(2);
    expect(parsed.bodyRows[0].cells).toEqual(['a', 'b', 'c']);
    expect(parsed.bodyRows[1].cells).toEqual(['d', 'e', 'f']);
  });

  test('parses a table without header rows', () => {
    const parsed = parseTable(TABLE_NO_HEADER);
    expect(parsed.headerRows.length).toBe(0);
    expect(parsed.bodyRows.length).toBe(2);
    expect(parsed.bodyRows[0].cells).toEqual(['a', 'b']);
    expect(parsed.bodyRows[1].cells).toEqual(['c', 'd']);
  });

  test('parses colSpec when [cols=] line is present', () => {
    const parsed = parseTable(TABLE_WITH_COLS);
    expect(parsed.colSpecLine).not.toBeNull();
    expect(parsed.colSpecEntries).toEqual(['1', '2']);
  });

  test('sets colSpecLine null when no [cols=] line', () => {
    const parsed = parseTable(TABLE_2COL);
    expect(parsed.colSpecLine).toBeNull();
    expect(parsed.colSpecEntries).toBeNull();
  });

  test('preserves rawLines for each row', () => {
    const parsed = parseTable(TABLE_NO_HEADER);
    expect(parsed.bodyRows[0].rawLines).toBeDefined();
    expect(parsed.bodyRows[0].rawLines.length).toBeGreaterThan(0);
  });
});

// ── serializeTable ────────────────────────────────────────────────────────────

describe('serializeTable', () => {
  test('round-trips a simple table without header', () => {
    const parsed = parseTable(TABLE_NO_HEADER);
    const serialized = serializeTable(parsed);
    expect(serialized).toContain('|===');
    expect(serialized).toContain('|a');
    expect(serialized).toContain('|b');
  });

  test('includes colSpec line when present', () => {
    const parsed = parseTable(TABLE_WITH_COLS);
    const serialized = serializeTable(parsed);
    expect(serialized).toContain('[cols=');
  });

  test('includes empty separator between header and body rows', () => {
    const parsed = parseTable(TABLE_2COL);
    const serialized = serializeTable(parsed);
    expect(serialized).toContain('\n\n');
  });
});

// ── addRow ────────────────────────────────────────────────────────────────────

describe('addRow', () => {
  test('adds a row after the last body row', () => {
    const result = addRow(TABLE_NO_HEADER, 1);
    const parsed = parseTable(result);
    expect(parsed.bodyRows.length).toBe(3);
  });

  test('adds a row before all body rows (afterIndex = -1)', () => {
    const result = addRow(TABLE_NO_HEADER, -1);
    const parsed = parseTable(result);
    expect(parsed.bodyRows.length).toBe(3);
    expect(parsed.bodyRows[0].cells.every((c) => c === '')).toBe(true);
  });

  test('adds a row in the middle', () => {
    const result = addRow(TABLE_3COL, 0);
    const parsed = parseTable(result);
    expect(parsed.bodyRows.length).toBe(3);
    expect(parsed.bodyRows[1].cells.every((c) => c === '')).toBe(true);
  });

  test('new row has same number of empty cells as existing rows', () => {
    const result = addRow(TABLE_3COL, -1);
    const parsed = parseTable(result);
    expect(parsed.bodyRows[0].cells.length).toBe(3);
  });
});

// ── removeRow ─────────────────────────────────────────────────────────────────

describe('removeRow', () => {
  test('removes the specified body row', () => {
    const result = removeRow(TABLE_NO_HEADER, 0);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const parsed = parseTable(result.value);
      expect(parsed.bodyRows.length).toBe(1);
      expect(parsed.bodyRows[0].cells).toEqual(['c', 'd']);
    }
  });

  test('returns error when only one body row remains', () => {
    const result = removeRow(TABLE_ONE_ROW, 0);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('last');
    }
  });

  test('removes the last row of a multi-row table', () => {
    const result = removeRow(TABLE_3COL, 1);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const parsed = parseTable(result.value);
      expect(parsed.bodyRows.length).toBe(1);
    }
  });
});

// ── checkSpanConflict ─────────────────────────────────────────────────────────

describe('checkSpanConflict', () => {
  const TABLE_SPAN = '|===\n2+|wide |last\n|===';

  test('returns false for a table with no span markers', () => {
    expect(checkSpanConflict(TABLE_NO_HEADER, 0)).toBe(false);
    expect(checkSpanConflict(TABLE_NO_HEADER, 1)).toBe(false);
  });

  test('returns true when column is affected by a spanning cell', () => {
    expect(checkSpanConflict(TABLE_SPAN, 0)).toBe(true);
    expect(checkSpanConflict(TABLE_SPAN, 1)).toBe(true);
  });

  test('returns false for a column not affected by any span', () => {
    expect(checkSpanConflict(TABLE_SPAN, 2)).toBe(false);
  });

  test('checks targetIndex as well when provided', () => {
    expect(checkSpanConflict(TABLE_SPAN, 2, 0)).toBe(true);
    expect(checkSpanConflict(TABLE_SPAN, 2, 2)).toBe(false);
  });
});

// ── addColumn ─────────────────────────────────────────────────────────────────

describe('addColumn', () => {
  test('inserts an empty column before the given index', () => {
    const result = addColumn(TABLE_NO_HEADER, 0, true);
    const parsed = parseTable(result);
    expect(parsed.bodyRows[0].cells.length).toBe(3);
    expect(parsed.bodyRows[0].cells[0]).toBe('');
    expect(parsed.bodyRows[0].cells[1]).toBe('a');
  });

  test('inserts an empty column after the given index', () => {
    const result = addColumn(TABLE_NO_HEADER, 0, false);
    const parsed = parseTable(result);
    expect(parsed.bodyRows[0].cells.length).toBe(3);
    expect(parsed.bodyRows[0].cells[0]).toBe('a');
    expect(parsed.bodyRows[0].cells[1]).toBe('');
    expect(parsed.bodyRows[0].cells[2]).toBe('b');
  });

  test('inserts column in every body row', () => {
    const result = addColumn(TABLE_NO_HEADER, 0, true);
    const parsed = parseTable(result);
    expect(parsed.bodyRows[1].cells.length).toBe(3);
  });

  test('updates cols= spec when present', () => {
    const result = addColumn(TABLE_WITH_COLS, 0, true);
    const parsed = parseTable(result);
    expect(parsed.colSpecEntries?.length).toBe(3);
    expect(parsed.colSpecEntries?.[0]).toBe('1');
  });
});

// ── removeColumn ──────────────────────────────────────────────────────────────

describe('removeColumn', () => {
  test('removes the column at the given index from every row', () => {
    const result = removeColumn(TABLE_NO_HEADER, 0);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const parsed = parseTable(result.value);
      expect(parsed.bodyRows[0].cells.length).toBe(1);
      expect(parsed.bodyRows[0].cells[0]).toBe('b');
    }
  });

  test('returns error when only one column remains', () => {
    const result = removeColumn(TABLE_ONE_COL, 0);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('last');
    }
  });

  test('returns error when span conflict detected', () => {
    const tableSpan = '|===\n2+|wide |last\n|===';
    const result = removeColumn(tableSpan, 0);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('spanning');
    }
  });

  test('updates cols= spec when present', () => {
    const result = removeColumn(TABLE_WITH_COLS, 0);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const parsed = parseTable(result.value);
      expect(parsed.colSpecEntries?.length).toBe(1);
    }
  });
});

// ── moveColumn ────────────────────────────────────────────────────────────────

describe('moveColumn', () => {
  const TABLE_3COL_BODY = '|===\n|a |b |c\n|d |e |f\n|===';

  test('moves a column left', () => {
    const result = moveColumn(TABLE_3COL_BODY, 1, 'left');
    expect(result.ok).toBe(true);
    if (result.ok) {
      const parsed = parseTable(result.value);
      expect(parsed.bodyRows[0].cells[0]).toBe('b');
      expect(parsed.bodyRows[0].cells[1]).toBe('a');
    }
  });

  test('moves a column right', () => {
    const result = moveColumn(TABLE_3COL_BODY, 1, 'right');
    expect(result.ok).toBe(true);
    if (result.ok) {
      const parsed = parseTable(result.value);
      expect(parsed.bodyRows[0].cells[1]).toBe('c');
      expect(parsed.bodyRows[0].cells[2]).toBe('b');
    }
  });

  test('returns error when only one column exists', () => {
    const result = moveColumn(TABLE_ONE_COL, 0, 'left');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('only');
    }
  });

  test('returns error for left move at first column boundary', () => {
    const result = moveColumn(TABLE_NO_HEADER, 0, 'left');
    expect(result.ok).toBe(false);
  });

  test('returns error for right move at last column boundary', () => {
    const result = moveColumn(TABLE_NO_HEADER, 1, 'right');
    expect(result.ok).toBe(false);
  });

  test('returns error when span conflict exists', () => {
    const tableSpan = '|===\n2+|wide |last\n|===';
    const result = moveColumn(tableSpan, 0, 'right');
    expect(result.ok).toBe(false);
  });
});

// ── formatTable ───────────────────────────────────────────────────────────────

describe('formatTable', () => {
  test('pads cells to widest in their column', () => {
    const table = '|===\n|short |a longer cell\n|x |y\n|===';
    const formatted = formatTable(table);
    const lines = formatted.split('\n');
    const row1 = lines.find((l) => l.includes('short'));
    const row2 = lines.find((l) => l.includes('x') && l.includes('y'));
    expect(row1).toBeDefined();
    expect(row2).toBeDefined();
    // After formatting, 'x' should be padded to match 'short' width
    const cell2 = row2!.split('|')[1];
    expect(cell2?.length).toBeGreaterThanOrEqual('short'.length);
  });

  test('does not modify delimiter lines', () => {
    const table = '|===\n|a |b\n|===';
    const formatted = formatTable(table);
    const lines = formatted.split('\n');
    expect(lines[0]).toBe('|===');
    expect(lines.at(-1)).toBe('|===');
  });

  test('does not modify cols= spec line', () => {
    const formatted = formatTable(TABLE_WITH_COLS);
    const lines = formatted.split('\n');
    expect(lines[0]).toContain('[cols=');
  });

  test('returns a new string (does not mutate input)', () => {
    const original = TABLE_NO_HEADER;
    formatTable(original);
    expect(TABLE_NO_HEADER).toBe(original);
  });

  test('handles a table with only empty cells', () => {
    const table = '|===\n| | \n| | \n|===';
    expect(() => formatTable(table)).not.toThrow();
  });
});

describe('table-operations branch edge cases', () => {
  // A bracketed attribute line that is NOT a cols= spec: colSpecLine is kept but
  // colSpecEntries stays null, exercising the non-cols round-trip path.
  test('preserves a non-cols [%header] attribute line through serialize', () => {
    const table = '[%header]\n|===\n|a |b\n|===';
    const parsed = parseTable(table);
    expect(parsed.colSpecLine).toBe('[%header]');
    expect(parsed.colSpecEntries).toBeNull();
    expect(serializeTable(parsed)).toContain('[%header]');
  });

  test('formatTable handles a header-only table (no body rows)', () => {
    const headerOnly = '|===\n|a |b\n\n|===';
    const parsed = parseTable(headerOnly);
    expect(parsed.headerRows.length).toBeGreaterThan(0);
    expect(parsed.bodyRows.length).toBe(0);
    expect(() => formatTable(headerOnly)).not.toThrow();
  });

  test('removeColumn on a rowless table reports the last-column guard', () => {
    const empty = '|===\n|===';
    const result = removeColumn(empty, 0);
    expect(result.ok).toBe(false);
  });

  test('formatTable returns the input unchanged for a rowless table', () => {
    const empty = '|===\n|===';
    expect(formatTable(empty)).toBe(empty);
  });

  test('addColumn after the final column appends a trailing cell', () => {
    const result = addColumn(TABLE_2COL, 1, false);
    const parsed = parseTable(result);
    expect(parsed.bodyRows[0].cells.length).toBe(3);
  });

  test('moveColumn swaps cols= spec entries when present', () => {
    const result = moveColumn(TABLE_WITH_COLS, 0, 'right');
    expect(result.ok).toBe(true);
    if (result.ok) {
      const parsed = parseTable(result.value);
      expect(parsed.colSpecEntries).toEqual(['2', '1']);
    }
  });

  test('moveColumn reports a conflict when the destination column spans', () => {
    // `2+` spans columns 0 and 1; column 2 is clean. Moving col 2 left lands on a span.
    const tableSpan = '|===\n2+|wide |c\n|x |y |z\n|===';
    const result = moveColumn(tableSpan, 2, 'left');
    expect(result.ok).toBe(false);
  });
});
