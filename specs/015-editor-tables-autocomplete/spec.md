# Feature Specification: Editor Tables, Captions & Autocomplete

**Feature Branch**: `015-editor-tables-autocomplete`

**Created**: 2026-06-05

**Status**: Draft

**Input**: User description: "lets add support in the editor for tables and captions; adding an image or including a file should have autocomplete"

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Insert a Table via Autocomplete or Toolbar (Priority: P1)

An author wants to add a table to their document. They either type the opening `|===` delimiter and see a smart snippet offered, or they click the Table button in the toolbar. Either action inserts a well-formed, ready-to-edit table skeleton with the correct delimiters, a header row, and a configurable number of columns.

**Why this priority**: Tables are one of the most frequently used structural elements in technical documentation. Inserting one from scratch requires memorising the AsciiDoc table DSL; autocomplete and a toolbar entry remove that friction and are the minimum useful increment.

**Independent Test**: A user opens an AsciiDoc file and types `|===` at the start of a new line. An autocomplete suggestion offers a pre-filled 2-column table skeleton. Accepting it inserts the full block and positions the cursor at the first cell. The test delivers standalone value independently of captions or image completions.

**Acceptance Scenarios**:

1. **Given** the cursor is at the start of a blank line and the user types `|===`, **When** the autocomplete menu appears, **Then** at least one option offers a table skeleton (header row + body row) with placeholders for cell content.
2. **Given** the user accepts a table skeleton snippet, **When** the insertion completes, **Then** the full `|===` block is inserted with a header row, a separator, and one data row; the cursor is positioned inside the first cell.
3. **Given** the toolbar is visible, **When** the user clicks the Table action, **Then** a table skeleton is inserted at the current cursor position using the same template as the snippet.
4. **Given** the cursor is inside a table block, **When** the user types `|` at the start of a new line, **Then** a new cell/row is offered as a completion option.
5. **Given** a table block is present in the document, **When** the syntax highlighter processes it, **Then** the column specification line, header row, cell separators (`|`), and closing delimiter are each visually distinct from surrounding prose.

---

### User Story 2 — Manage Table Structure with Context Toolbar (Priority: P1)

An author has a table in the document and needs to modify its structure: adding a row above or below the current position, removing a row, adding a column, removing a column, or moving a column left or right. When the cursor is anywhere inside a `|===` block, a context toolbar becomes visible with dedicated table management actions. The author clicks an action and the table text is rewritten to reflect the change.

**Why this priority**: Without structural editing support, authors must manually count and edit every row to add or remove a column — error-prone and time-consuming for anything beyond 3–4 rows. Context-sensitive actions eliminate this friction and are the key differentiator of this feature from a plain-text editor.

**Independent Test**: A user places the cursor inside any cell of a 3-column, 4-row table. The context toolbar appears. The user clicks "Add column right." A new empty column is appended to every row. The user then clicks "Remove row." The row at the cursor is deleted. Both operations leave the table's `|===` delimiters and column spec intact and syntactically valid. The test is demonstrable independently of autocomplete or caption features.

**Acceptance Scenarios**:

1. **Given** the cursor is positioned anywhere inside a `|===` block, **When** the editor detects the cursor position, **Then** a context toolbar becomes visible with table management actions (add row above, add row below, remove row, add column left, add column right, remove column, move column left, move column right).
2. **Given** the context toolbar is visible and the user clicks "Add row below," **When** the action executes, **Then** a new empty row is inserted immediately after the row containing the cursor; all other rows are unchanged.
3. **Given** the context toolbar is visible and the user clicks "Add row above," **When** the action executes, **Then** a new empty row is inserted immediately before the row containing the cursor.
4. **Given** the context toolbar is visible and the user clicks "Remove row," **When** the action executes, **Then** the row containing the cursor is deleted and the cursor moves to the nearest remaining row.
5. **Given** the context toolbar is visible and the user clicks "Add column right," **When** the action executes, **Then** a new empty cell is appended to every row in the table, and the column count in the column spec line is updated accordingly.
6. **Given** the context toolbar is visible and the user clicks "Add column left," **When** the action executes, **Then** a new empty cell is prepended to every row at the current column position, and the column spec is updated.
7. **Given** the context toolbar is visible and the user clicks "Remove column," **When** the action executes, **Then** the cell at the cursor's column position is removed from every row, and the column spec is updated.
8. **Given** the context toolbar is visible and the user clicks "Move column left," **When** the action executes, **Then** the column at the cursor swaps position with the column immediately to its left across all rows; if the column is already the first, the action is disabled.
9. **Given** the context toolbar is visible and the user clicks "Move column right," **When** the action executes, **Then** the column at the cursor swaps position with the column immediately to its right across all rows; if the column is already the last, the action is disabled.
10. **Given** the cursor moves outside the `|===` block, **When** the editor detects the cursor has left the table, **Then** the context toolbar is hidden.
11. **Given** a table has only one row remaining, **When** the user clicks "Remove row," **Then** the action is disabled (a table must retain at least one row).
12. **Given** a table has only one column remaining, **When** the user clicks "Remove column," **Then** the action is disabled (a table must retain at least one column).
13. **Given** the context toolbar is visible and the user clicks "Format table," **When** the action executes, **Then** every cell in every row is padded with trailing spaces so that the `|` pipe characters of each column are vertically aligned; the `|===` delimiters and the column spec line are left unchanged.
14. **Given** a table with varied cell content lengths (e.g., one cell with 2 characters and another in the same column with 30), **When** the user formats the table, **Then** all cells in that column are padded to the width of the longest cell so the pipes align.
15. **Given** a table contains a spanning cell (e.g., `2+|cell`) in any row that overlaps the target or source column, **When** the user attempts "Remove column," "Move column left," or "Move column right" for an affected column, **Then** the button is disabled and its tooltip explains that the operation is blocked due to a spanning cell conflict.
16. **Given** a table contains spanning cells but the target column is not overlapped by any span, **When** the user performs a column operation on that column, **Then** the operation proceeds normally as if no spanning cells were present.

---

### User Story 3 — Add a Caption to a Block (Priority: P1)

An author wants to label a table, image, or code listing with a caption (a numbered, titled label such as "Table 1. Employee Data" or "Figure 3. Architecture Diagram"). They type `.` at the start of a line immediately before a captionable block, or use a toolbar or keyboard shortcut to insert a caption line. The editor highlights the caption syntax distinctly and the caption is included in the rendered preview.

**Why this priority**: Captions are required for formal technical documents (standards, manuals, reports). Without caption support, the editor cannot produce publication-quality AsciiDoc. This is closely related to table support because tables almost always need captions in professional documents.

**Independent Test**: A user places their cursor on the line immediately before a `|===` table block and triggers the caption insertion action. A `.Table title` placeholder is inserted on the preceding line, and the editor highlights it as a caption token. The test is complete and independently demonstrable.

**Acceptance Scenarios**:

1. **Given** the cursor is on a blank line immediately before a captionable block (table, image, listing, example, sidebar), **When** the user types `.`, **Then** an autocomplete option offers a caption placeholder (`.Caption text`).
2. **Given** the user accepts a caption completion, **When** the insertion completes, **Then** a `.Caption text` line is inserted and the cursor is positioned on the caption text for editing.
3. **Given** a `.Title` or `.Caption` line is present in the document, **When** the syntax highlighter processes it, **Then** the caption line is rendered in a distinct style (e.g., muted or italic) that differs from both body text and headings.
4. **Given** a toolbar or keyboard shortcut for "Add caption" is triggered, **When** the cursor is adjacent to a captionable block, **Then** a caption line is inserted on the line immediately preceding the block.
5. **Given** a caption line is followed by a non-captionable construct (e.g., a paragraph), **When** the highlighter processes it, **Then** the caption is still highlighted correctly as a caption token; no error state is shown.

---

### User Story 4 — Autocomplete Image Paths (Priority: P1)

An author is inserting a block image (`image::`) or inline image (`image:`) into the document. As they type the path after `image::`, the editor shows completions from the image files available in the current project, filtered by the characters already typed. Selecting a completion inserts the full path and positions the cursor after the closing `[]` for attribute entry.

**Why this priority**: Image path autocomplete is the same class of problem as include path completion (already shipped in the editor). Adding it for images is low-effort relative to its usefulness: authors frequently misremember folder names or file extensions, and completion eliminates those typos.

**Independent Test**: A user types `image::` at the start of a line in an AsciiDoc file that belongs to a project containing uploaded image files. The autocomplete menu appears, listing the available image paths. Selecting one inserts `image::path/to/image.png[]` with the cursor between `[` and `]`. The test is demonstrable independently of table or caption support.

**Acceptance Scenarios**:

1. **Given** the user types `image::` on a new line, **When** the autocomplete menu appears, **Then** it lists image files available in the current project, filtered to files with common image extensions (`.png`, `.jpg`, `.jpeg`, `.gif`, `.svg`, `.webp`).
2. **Given** the user continues typing after `image::`, **When** additional characters narrow the match, **Then** the completion list filters in real time to paths starting with the typed prefix.
3. **Given** the user selects a completion from the list, **When** the selection is accepted, **Then** the full path is inserted and the cursor is placed between the `[` and `]` so the user can immediately type image attributes.
4. **Given** the user types `image:` (single colon, inline image), **When** the autocomplete menu appears, **Then** it offers the same project image paths as the block image variant.
5. **Given** the project contains no image files, **When** the user types `image::`, **Then** the completion list is empty (no suggestions); no error or loading state is shown.
6. **Given** image completions are scoped to the current project, **When** the list is displayed, **Then** it does not include files from other projects or paths outside the project boundary.

---

### User Story 5 — Autocomplete Include File Paths (Priority: P2)

An author typing `include::` sees project files offered as completions, filtered live as they type the path prefix. This is an enhancement of the include completion already present: it gains parity with image completions (same UX, same scoping rules) and adds support for triggering completions mid-path (e.g., after typing a folder name and `/`).

**Why this priority**: The include path completion was introduced in phase 014 but is not yet fully polished. This story brings it to the same level of refinement as image completions; it is slightly lower priority than tables and image autocomplete because a basic version already exists.

**Independent Test**: A user types `include::docs/` in a project where a `docs/` folder exists. Completions show only the files and subfolders inside `docs/`. The test is independent of all other stories.

**Acceptance Scenarios**:

1. **Given** the user types `include::`, **When** the autocomplete menu appears, **Then** it lists all files in the current project, not limited by extension.
2. **Given** the user types a partial folder path after `include::` (e.g., `include::chapters/`), **When** the slash is typed, **Then** completions narrow to files and folders within that directory.
3. **Given** the user selects a file completion, **When** the selection is accepted, **Then** the full path is inserted and the cursor is placed between `[` and `]`.
4. **Given** the project has no files matching the typed prefix, **When** the completion menu would appear, **Then** it shows no suggestions; no error state is shown.
5. **Given** include completions are scoped to the current project, **When** the list is displayed, **Then** it does not expose files from other projects or absolute filesystem paths.

---

### Edge Cases

- What happens when the user types `image::` but is inside an existing table cell? The autocomplete should still trigger normally.
- What happens when a caption line is at the very top of the document (no preceding content)? The caption should be highlighted correctly.
- What happens when an image path contains spaces or special characters? The completion should insert the path as-is; encoding is the user's responsibility.
- What happens if the project's file list changes (a new image is uploaded) while the editor is open? The completions should reflect the updated list on the next completion trigger without requiring a page reload.
- What happens when the user types an image path that does not match any project file? The completion list is empty; the user can still type any path freely.
- What happens with a table that spans many columns (e.g., 8+)? The skeleton snippet inserts a reasonable default (2 columns) regardless of how many columns the user ultimately needs.
- What happens when the user clicks "Remove column" on a table with cells that span multiple columns (e.g., `2+|cell`)? The editor checks all rows for span markers that originate in or overlap the target column. If any are found, the operation is blocked and the button shows a tooltip explaining the conflict. If no spanning cells affect the target column, the operation proceeds normally (FR-TM-011).
- What happens when the user attempts to move a column on a table with a complex column spec (e.g., `cols="1h,2,~"`)? The corresponding spec entries are swapped (e.g., `1h` and `2` exchange positions); width values and style modifiers travel with their column.
- What happens when "Format table" is applied to a table that contains spanning cells (e.g., `2+|cell`)? The formatter measures cell content widths as-is (including span markers) and aligns them; it does not validate or parse spans, so output may be visually uneven for spanning rows but remains syntactically valid.
- What happens when a cell contains a very long line (e.g., 500 characters)? The formatter pads all other cells in that column to match; there is no truncation or wrapping — the author is responsible for cell content length.
- What happens if the user undoes a table management action? Standard editor undo (Ctrl+Z) must restore the exact prior state of the table.

---

## Requirements *(mandatory)*

### Functional Requirements

**Table Authoring**

- **FR-TA-001**: The editor MUST provide an autocomplete trigger for table insertion when the user types `|===` at the start of a line, offering at minimum a 2-column table skeleton (column header row, separator, one data row, closing delimiter).
- **FR-TA-002**: The table skeleton snippet MUST position the cursor at the first cell on acceptance so the user can start typing immediately.
- **FR-TA-003**: The toolbar MUST include a "Table" action that inserts the same table skeleton at the current cursor position.
- **FR-TA-004**: The syntax highlighter MUST distinguish table delimiters (`|===`), column spec lines, header rows (separated by an empty line or `|===` after the opening delimiter), cell markers (`|`), and table body rows as distinct visual tokens.
- **FR-TA-005**: When the cursor is inside a table block (between `|===` delimiters), the editor MUST offer cell/row completion when the user presses `|` at the start of a line.

**Table Management (Context Toolbar)**

- **FR-TM-001**: When the cursor is positioned inside a `|===` block, the editor MUST display a context toolbar containing the following actions: Add row above, Add row below, Remove row, Add column left, Add column right, Remove column, Move column left, Move column right, Format table (see FR-TM-012).
- **FR-TM-002**: The context toolbar MUST become hidden when the cursor moves outside the `|===` block.
- **FR-TM-003**: "Add row above" and "Add row below" MUST insert a new row with one empty cell per column at the correct position; all existing rows MUST remain unchanged.
- **FR-TM-004**: "Remove row" MUST delete the row at the cursor position and move the cursor to the nearest remaining row. The action MUST be disabled when the table contains only one row.
- **FR-TM-005**: "Add column left" and "Add column right" MUST insert a new empty cell into every row at the correct column position. If a `cols=` attribute is present, a default weight entry of `1` MUST be inserted at the corresponding position in the column spec.
- **FR-TM-006**: "Remove column" MUST delete the cell at the cursor's column position from every row. The action MUST be disabled when the table contains only one column. If a `cols=` attribute is present, the corresponding spec entry MUST be removed.
- **FR-TM-007**: "Move column left" MUST swap the current column with the column immediately to its left across all rows; it MUST be disabled when the cursor is in the first column. If a `cols=` attribute is present, the corresponding spec entries MUST be swapped.
- **FR-TM-008**: "Move column right" MUST swap the current column with the column immediately to its right across all rows; it MUST be disabled when the cursor is in the last column. If a `cols=` attribute is present, the corresponding spec entries MUST be swapped.
- **FR-TM-009**: Every table management action MUST be fully reversible via the editor's standard undo mechanism (Ctrl+Z / Cmd+Z).
- **FR-TM-010**: Each context toolbar button MUST display a tooltip with its action name on hover.
- **FR-TM-012**: The context toolbar MUST include a "Format table" button that fires only when explicitly clicked (never automatically). When clicked, the editor MUST rewrite the table so that each cell is padded with trailing spaces to the width of the widest cell in its column, resulting in vertically aligned `|` pipe characters across all rows. The `|===` delimiter lines and any column spec line MUST be left unchanged. The action MUST be reversible via the standard undo mechanism.
- **FR-TM-011**: Before executing any column operation (remove column, move column left, move column right), the editor MUST inspect every row in the table for span markers (e.g., `2+|`, `3+|`) that originate in or overlap the source column or, for move operations, the destination column. If any such span is detected, the operation MUST be blocked and the corresponding toolbar button MUST display a non-blocking warning tooltip explaining that the operation cannot proceed because one or more spanning cells would be affected. Row operations (add row, remove row) are not subject to this check. Add column operations are also exempt, as inserting a column does not affect existing spans.

**Caption Authoring**

- **FR-CA-001**: The editor MUST recognise block title lines (lines beginning with `.` followed by a non-whitespace, non-`.`, non-`[` character) as a distinct syntax token and highlight them separately from body text and headings.
- **FR-CA-002**: When the user types `.` at the start of a blank line, the editor MUST offer an autocomplete option for a `.Caption text` placeholder.
- **FR-CA-003**: Accepting the caption completion MUST insert `.Caption text` and position the cursor on the caption text portion for immediate editing.
- **FR-CA-004**: The toolbar or a keyboard shortcut MUST provide an "Add caption" action that inserts a `.Block title` placeholder on the line immediately preceding the current block.
- **FR-CA-005**: Caption highlighting MUST apply regardless of whether the following block is a table, image, listing, example block, sidebar, or admonition.

**Image Path Autocomplete**

- **FR-IM-001**: The editor MUST trigger autocomplete after the user types `image::` (block image macro), offering project files filtered to common image extensions (`.png`, `.jpg`, `.jpeg`, `.gif`, `.svg`, `.webp`).
- **FR-IM-002**: The editor MUST trigger autocomplete after the user types `image:` (inline image macro) with the same file list and filtering behaviour as the block image variant.
- **FR-IM-003**: Image path completions MUST filter in real time as the user types additional characters after the macro prefix.
- **FR-IM-004**: Accepting an image path completion MUST insert the full path and position the cursor between `[` and `]` for attribute entry.
- **FR-IM-005**: Image path completions MUST be scoped to the current project and MUST NOT expose files from other projects or the host filesystem.
- **FR-IM-006**: If no project image files match the current prefix, the completion list MUST be empty; the editor MUST NOT display an error.

**Include Path Autocomplete (enhancement)**

- **FR-IN-001**: Include path completions MUST support mid-path triggering — after the user types a folder name followed by `/`, completions MUST narrow to the contents of that directory.
- **FR-IN-002**: Accepting an include path completion MUST insert the full path and position the cursor between `[` and `]`.
- **FR-IN-003**: Include path completions MUST be scoped to the current project (consistent with FR-IM-005).

### Key Entities

- **TableContextToolbar**: A context-sensitive toolbar that becomes visible when the cursor is inside a `|===` block, exposing table management actions (add/remove/move rows and columns). Hidden when the cursor is outside any table block.
- **TableSkeleton**: A pre-formatted AsciiDoc table snippet with configurable column count, column spec line, header row, and one data row, used for both autocomplete and toolbar insertion.
- **BlockTitle**: A line beginning with `.` immediately preceding a captionable block, carrying the caption text. Distinct from document attributes and comment lines.
- **ImageCompletionCandidate**: A project file path offered in autocomplete after `image::` or `image:`, filtered to recognised image file extensions.
- **IncludeCompletionCandidate**: A project file or folder path offered in autocomplete after `include::`, unfiltered by extension.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Authors can insert a correctly structured AsciiDoc table in under 10 seconds without consulting external documentation, using only the editor's autocomplete or toolbar.
- **SC-002**: Authors can add a caption to any block in under 5 seconds using autocomplete or the toolbar action, without needing to remember the `.Title` syntax.
- **SC-003**: Image path completions appear within 300 ms of typing `image::` or `image:`, matching the response-time benchmark established for other completion sources (spec 014, SC-008).
- **SC-004**: Include path completions correctly narrow to sub-directory contents after a `/` is typed, with no false positives from paths in other directories.
- **SC-005**: 100% of project image files (any file with a recognised image extension stored in the project) appear in image completions; no project images are silently omitted.
- **SC-006**: Table delimiters, column specs, header rows, cell markers, and caption lines are each visually distinct in the highlighted editor; a first-time user can identify a table structure and a caption at a glance.
- **SC-007**: Authors can add or remove a row or column from an existing table in under 5 seconds using the context toolbar, without manually editing the raw text of each row.
- **SC-008**: Authors can align a table's columns in under 2 seconds by clicking the "Format table" button; the result is visually consistent pipe alignment with no manual space counting required.

---

## Assumptions

- **A-001**: "Table support" includes both authoring assistance (autocomplete, toolbar insertion, syntax highlighting) and structural editing via a context toolbar (add/remove/move rows and columns). The context toolbar operates on the raw AsciiDoc text — it rewrites table rows in-place rather than providing a visual spreadsheet-style UI.
- **A-002**: The default table skeleton uses 2 columns. The user can manually change the column count after insertion; a column-count picker dialog is out of scope.
- **A-003**: Advanced table column spec syntax (e.g., `cols="1,~,>1"`, span operators `2+|`, cell styling `a|`) is highlighted as a generic column-spec token rather than being fully parsed. Full column-spec grammar support is deferred.
- **A-004**: Caption autocomplete triggers only when `.` is typed at the very start of a line (position 0). Captions mid-line or after other content are not triggered.
- **A-005**: Image files available for path completion are those already uploaded and stored as project files (the same set available to `include::` completion). External URLs are not offered as completions.
- **A-006**: The image file list for completions is fetched from the same project-file API used by include path completions. Real-time refresh occurs on the next completion trigger after a file is added; no push notification mechanism is required.
- **A-007**: The "Add caption" toolbar action inserts the caption on the line immediately above the block the cursor is currently inside or adjacent to. If the cursor is not near a captionable block, the action inserts `.Title` at the current line.
- **A-008**: This feature does not add a rendered preview of captions or tables; preview rendering is handled by the existing AsciiDoc preview panel.
- **A-009**: The include path completion enhancement (mid-path narrowing) refines the existing `createIncludeCompletionSource` implementation introduced in spec 014. No new API calls are required.

---

## Clarifications

### Session 2026-06-05

- Q: How should table management actions be triggered? → A: Context toolbar — a floating mini-toolbar (or toolbar section that activates) when the cursor is inside a `|===` block, showing add/remove/move actions.
- Q: How should the column spec (`cols=`) be handled when columns are added, removed, or moved? → A: Auto-update — insert a default weight of `1` for new columns; remove or swap the corresponding spec entry on remove or move.
- Q: What does "format table" mean functionally? → A: Column alignment — pad each cell with trailing spaces to the width of the widest cell in its column so `|` pipes form straight vertical lines; delimiters and column spec line are left unchanged.
- Q: Should "Format table" trigger automatically (on save, on cursor-leave) or only on demand? → A: On-demand only — fires exclusively when the "Format table" button in the context toolbar is clicked; never fires automatically.
- Q: How should column operations handle tables with spanning cells (`2+|`, `3+|`)? → A: Check all rows for spans that originate in or overlap the source/destination column; block the operation with a warning tooltip if any conflict is found. Operations on columns unaffected by spans proceed normally. Add column and row operations are exempt.
