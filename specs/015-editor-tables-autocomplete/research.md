# Research: Editor Tables, Captions & Autocomplete

**Feature**: 015-editor-tables-autocomplete | **Date**: 2026-06-05

---

## 1. Grammar Extension: BlockTitle Token

**Decision**: Add `blockTitleToken` as an external token alongside the existing `headingToken`, `blockDelimToken`, etc.

**Rationale**: AsciiDoc block titles (`.Title` lines) start with a `.` at column 0, which conflicts with the existing external tokenizer's `.` case — currently used only for ordered-list markers (`.` followed by a space). The conflict is resolved by checking the character after `.`: if it is a non-space, non-dot, non-`[` character, we have a block title; otherwise we fall through to the ordered-list branch.

**Alternatives considered**:
- Inline rule in the grammar (no tokenizer change): rejected because the grammar's line-start context requires external tokenizer intervention the same way headings and delimiters do.
- Reuse `@specialize` on the existing ordered-list token: rejected because block title and ordered-list marker have no parent token in common.

**Key finding**: The grammar already defines `TableBlock`, `tableDelim`, `tableRow`, `tableCellMark` — no new grammar rules needed for table highlighting. Only `BlockTitle` is missing.

---

## 2. CodeMirror StateField Pattern for Table Context

**Decision**: Mirror `asciidoc-outline.ts`'s `outlineField` pattern: use `StateField.define<TableContext | null>` with `update` calling `ensureSyntaxTree` to walk `TableBlock` nodes.

**Rationale**: The outline field is already production-proven in this codebase. It uses `ensureSyntaxTree` with a viewport-based budget to avoid blocking on large files. Table context detection is similarly cursor-local and can be bounded to the cursor's viewport position.

**Key details**:
- `TableBlock` in the Lezer parse tree spans from the opening `|===` to the closing `|===` (inclusive).
- Cursor position check: `tableBlock.from <= cursorPos && cursorPos <= tableBlock.to`.
- Row/column index: computed by scanning the raw document text between `tableBlock.from` and the cursor line.
- The StateField returns `null` outside any table block; the React component renders the context toolbar conditionally on non-null.

**Alternatives considered**:
- Using a `ViewPlugin` instead of `StateField`: rejected because `StateField` results are serialisable and memoised by the transaction system; view plugins fire on every paint, not just content changes.

---

## 3. Table Operation Parsing Strategy

**Decision**: Parse table text as a sequence of lines, splitting cell markers by scanning for `|` that is not prefixed by a span count digit sequence.

**Rationale**: AsciiDoc table cells are delimited by `|` at the start of a cell, optionally preceded by a span specifier (`2+|`, `^3+|`, etc.). A simple line-by-line split on `|` would misparse cells with embedded `|` characters in cell content (rare but valid). The safer approach is a left-to-right character scan per row that respects span markers.

**Key finding**: Spanning cell syntax is `N+|` where `N` is a positive integer. Detection for conflict checking: scan each row text for occurrences matching `/\d+\+\|/`; if the running cell-position counter for such an occurrence overlaps a target column index, the operation is blocked.

**Alternatives considered**:
- Full Lezer-based cell parsing: rejected as over-engineered; the grammar does not annotate individual cells with column indices, and building that annotation would require a second pass anyway.
- Treating cells as always one-per-`|`: rejected because it breaks on span markers.

---

## 4. Column Spec Auto-Update Strategy

**Decision**: When adding or removing a column, update the `cols=` attribute if present: parse existing entries as an array of strings (`["1", "~", "2"]`), insert/remove the corresponding entry, and re-join.

**Rationale**: AsciiDoc column spec formats are diverse (e.g., `"1,~,2"`, `"1,1,1"`, `">1,<2"`). Preserving existing alignment directives while only inserting/removing entries at the correct index is safer than regenerating the whole spec.

**Key finding**: If no `cols=` line is present, column operations only modify cell content and do not inject a `cols=` attribute — the format table operation also does not add one. This matches user expectation: if the author never specified a col spec, auto-inserting one would be surprising.

**Alternatives considered**:
- Always regenerating `cols=` as `"1,1,...,1"`: rejected because it destroys existing alignment directives.

---

## 5. Format Table Implementation

**Decision**: For each column index, find the widest cell (in Unicode characters), then pad all cells in that column to that width using trailing spaces.

**Rationale**: AsciiDoc pipe tables only require `|` as the separator; extra spaces are ignored. Trailing-space padding produces a visually aligned table without changing semantics.

**Key finding**: The format operation must:
1. Operate only on `body` rows (and header rows before `===` separator if present).
2. Treat the delimiter lines (`|===`) as verbatim and not modify them.
3. Not modify the `cols=` spec line.
4. Return a new string (pure function — undo is handled by CodeMirror's transaction history).

---

## 6. Image Path Completion Source

**Decision**: Reuse the `createIncludeCompletionSource` factory pattern, adding an `imageExtensions` filter before returning candidates.

**Rationale**: The file list is already fetched by `useIncludeCompletions` from `/api/projects/:id/files`. Adding a separate image-filtered hook avoids a second fetch and keeps the completion sources symmetric.

**Key finding**: The AsciiDoc image macro has two forms:
- Block: `image::path[alt]` (double colon, at line start)
- Inline: `image:path[alt]` (single colon, mid-line)

Both forms should trigger image completions. The existing `createIncludeCompletionSource` uses a regex to detect the trigger text (after `include::`). A similar `createImageCompletionSource` will match after `image::` or `image:` (but not `image::` already matched — single-pass left-to-right regex handles this naturally).

**Alternatives considered**:
- Separate API endpoint for image files: rejected; the project file tree already contains all files; filtering client-side is sufficient.

---

## 7. Context Toolbar Positioning

**Decision**: Render `EditorTableContextToolbar` as a sibling div stacked directly below the main `EditorToolbar` inside `AsciidocEditor`, not as a floating overlay.

**Rationale**: A statically positioned second toolbar row is simpler to implement, doesn't require scroll position tracking or z-index management, and avoids obscuring content. The context toolbar is narrow (9 icon buttons) and fits in one row.

**Key finding**: The existing editor layout in `asciidoc-editor.tsx` is a flex column: `[EditorBanners] [EditorToolbar] [CodeMirror div]`. Inserting `[EditorTableContextToolbar]` between the toolbar and the editor area is a one-line render change.

---

## 8. Grammar Rebuild Integration

**Decision**: The grammar rebuild (`lezer-generator`) is a manual build step documented in `plan.md`. It is not automated as part of the test or dev watch cycle (aligning with the existing project convention).

**Key finding**: `package.json` in `apps/web` already has a `build:grammar` script (or equivalent) that calls `lezer-generator`. The build is invoked explicitly by the developer after grammar changes; the compiled parser JS is committed to source control alongside the grammar source.
