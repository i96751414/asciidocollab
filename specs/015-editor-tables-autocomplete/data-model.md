# Data Model: Editor Tables, Captions & Autocomplete

**Feature**: 015-editor-tables-autocomplete | **Date**: 2026-06-05

All types are client-side only (no persistence layer changes).

---

## TableContext

Produced by `tableContextField: StateField<TableContext | null>`. Represents the parsed state of the table the cursor currently resides in.

```typescript
interface TableContext {
  /** Document position of the first character of the opening |=== delimiter */
  tableFrom: number;
  /** Document position one past the last character of the closing |=== delimiter */
  tableTo: number;
  /** 0-based index of the row containing the cursor (counting body rows only) */
  cursorRowIndex: number;
  /** 0-based index of the cell column containing the cursor */
  cursorColumnIndex: number;
  /** Total number of body rows (not counting header rows or delimiter lines) */
  rowCount: number;
  /** Total number of columns (derived from first body row cell count or cols= spec) */
  columnCount: number;
  /** True when a cols="…" or cols=N*… attribute entry is present on the table */
  hasColSpec: boolean;
}
```

---

## ParsedTable

Internal representation used by all table operation pure functions. Never crosses the boundary into React components; components always receive/emit raw strings.

```typescript
interface ParsedTableRow {
  /** Each cell's raw content string (trimmed, without leading |) */
  cells: string[];
  /** The original source line(s) as written (may span multiple lines for multi-line cells) */
  rawLines: string[];
}

interface ParsedTable {
  /** Opening delimiter line, e.g. "|===" */
  openDelim: string;
  /** The [cols="…"] attribute list line, or null if absent */
  colSpecLine: string | null;
  /** Parsed column spec entries in order, e.g. ["1", "~", ">2"], or null if absent */
  colSpecEntries: string[] | null;
  /** Header rows (before the first empty row separator), may be empty */
  headerRows: ParsedTableRow[];
  /** Body rows */
  bodyRows: ParsedTableRow[];
  /** Closing delimiter line, e.g. "|===" */
  closeDelim: string;
}
```

---

## TableOpResult

Discriminated union returned by operations that can be blocked (spanning cell conflict, minimum row/column constraint).

```typescript
type TableOpResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: string };
```

---

## BlockTitle

Represents a parsed `.Title` caption line produced by the new `blockTitleToken` grammar terminal.

No runtime TypeScript interface is needed — the Lezer parse tree node name is `"BlockTitle"` and is accessed via `cursor.name === "BlockTitle"` in any tree-walking code. The highlight tag `t.annotation` is assigned in `asciidoc-language.ts`.

---

## ImageCompletionCandidate

Produced by `createImageCompletionSource`. Extends the standard CodeMirror `Completion` type.

```typescript
// No new type needed — standard @codemirror/autocomplete Completion:
// { label: string; type: string; apply?: string }
// label: relative file path (e.g. "images/logo.svg")
// type: "file"
// apply: `${path}[alt text]` — on accept, cursor is placed between [ and ]
```

---

## State Transitions

### TableContext lifecycle

```
Document load / edit
      │
      ▼
EditorState transaction fires
      │
      ▼
tableContextField.update()
      │
      ├─ cursor inside TableBlock? ──No──► null (toolbar hidden)
      │
      └─ Yes ──► parse row/column indices ──► TableContext (toolbar visible)
```

### TableOpResult lifecycle (column remove example)

```
User clicks "Remove column" button
      │
      ▼
EditorTableContextToolbar reads tableText from state.doc
      │
      ▼
removeColumn(tableText, columnIndex)
      │
      ├─ span conflict? ──Yes──► { ok: false, reason: "..." } → button tooltip
      │
      └─ No ──► { ok: true, value: newTableText }
                │
                ▼
          view.dispatch({ changes: { from: tableFrom, to: tableTo, insert: newTableText } })
```
