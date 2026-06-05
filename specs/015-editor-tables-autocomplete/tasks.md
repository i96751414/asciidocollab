---

description: "Task list for feature 015: Editor Tables, Captions & Autocomplete"
---

# Tasks: Editor Tables, Captions & Autocomplete

**Input**: Design documents from `specs/015-editor-tables-autocomplete/`

**Prerequisites**: plan.md ✅ | spec.md ✅ | research.md ✅ | data-model.md ✅ | contracts/table-operations.ts ✅

**Tests**: TDD required — every pure function and every component has a failing test written before implementation (per plan.md constitution check and architecture_constitution.md).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1–US5)
- Exact file paths are included in all descriptions

## Path Conventions

| App    | Source root          | Test root              |
|--------|----------------------|------------------------|
| `apps/web` | `apps/web/src/`  | `apps/web/tests/`      |

All changes are confined to `apps/web/`. No domain, infrastructure, or API modifications.

---

## Phase 1: Setup

**Purpose**: Confirm the existing CodeMirror extension stack and lezer build tooling before implementation begins.

- [X] T001 Verify lezer-generator build script in `apps/web/package.json` and confirm existing table grammar rules (`TableBlock`, `tableDelim`, `tableRow`, `tableCellMark`) in `apps/web/src/lib/codemirror/asciidoc.grammar`

---

## Phase 2: User Story 1 — Insert a Table via Autocomplete or Toolbar (Priority: P1) 🎯 MVP

**Goal**: Authors can insert a 2-column table skeleton from an autocomplete trigger (`|===` at column 0), a cell/row completion while inside a table block, and a toolbar button — with proper syntax highlighting for all table elements.

**Independent Test**: Type `|===` at the start of a new line → autocomplete offers a skeleton → accepting inserts the block with cursor at first cell. Click the toolbar Table button at an empty line → same skeleton is inserted. Syntax highlighting visually distinguishes delimiters, header rows, and cell markers. No other story is required to demonstrate these outcomes.

### Tests for User Story 1 (TDD — write before implementation) ⚠️

> **Write these tests FIRST and confirm they FAIL before any implementation below.**

- [X] T002 [US1] Write failing tests for table skeleton snippet trigger (`|===` at column 0) and cell/row completion trigger (`|` at line start inside table block) in `apps/web/tests/lib/codemirror/asciidoc-completions.test.ts`

### Implementation for User Story 1

- [X] T003 [US1] Implement table skeleton snippet source (trigger: `|===` at column 0; inserts 2-column skeleton with header, separator, body row; cursor at first cell) in `apps/web/src/lib/codemirror/asciidoc-completions.ts` (depends on T002)
- [X] T004 [US1] Implement cell/row completion trigger inside `|===` blocks (`|` at line start offers a new row completion) in `apps/web/src/lib/codemirror/asciidoc-completions.ts` (depends on T003)
- [X] T005 [P] [US1] Verify and add highlight style tags for existing table tokens (`tableDelim`, `tableRow`, `tableCellMark`) in `apps/web/src/lib/codemirror/asciidoc-language.ts`
- [X] T006 [US1] Add Table button to BLOCKS group in `apps/web/src/components/editor/editor-toolbar.tsx` (inserts same 2-column skeleton as the snippet at cursor position; depends on T003)

**Checkpoint**: User Story 1 is fully functional and testable independently — table insertion via autocomplete, cell completion, and toolbar button all work with syntax highlighting.

---

## Phase 3: User Story 2 — Manage Table Structure with Context Toolbar (Priority: P1)

**Goal**: When the cursor is inside a `|===` block, a context toolbar appears with 9 structural editing actions (add/remove/move rows and columns, format). All actions are backed by pure functions, reversible via undo, and respect span conflict constraints.

**Independent Test**: Place cursor inside a 3-column, 4-row table → context toolbar appears → click "Add column right" → a new empty column is added to every row → click "Remove row" → row at cursor is deleted. Both operations leave `|===` delimiters and column spec intact. Toolbar disappears when cursor leaves the table.

### Tests for User Story 2 (TDD — write before implementation) ⚠️

> **Write these tests FIRST and confirm they FAIL before any implementation below.**

- [X] T007 [P] [US2] Write failing unit tests for all 9 table operation pure functions (`parseTable`, `serializeTable`, `addRow`, `removeRow`, `addColumn`, `removeColumn`, `moveColumn`, `formatTable`, `checkSpanConflict`) covering normal cases, edge cases, and `TableOpResult` error paths in `apps/web/tests/lib/codemirror/asciidoc-table-operations.test.ts`
- [X] T008 [P] [US2] Write failing component tests for `EditorTableContextToolbar` (renders all 9 buttons, disabled states for last-row/last-column/span-conflict, tooltip text on hover, action callbacks dispatch view changes) in `apps/web/tests/components/editor/editor-table-context-toolbar.test.tsx`

### Implementation for User Story 2

- [X] T009 [P] [US2] Implement `TableContext` interface and `tableContextField: StateField<TableContext | null>` (walk syntax tree on each transaction to detect cursor inside `TableBlock`; compute `cursorRowIndex`, `cursorColumnIndex`, `rowCount`, `columnCount`, `hasColSpec`) in `apps/web/src/lib/codemirror/asciidoc-table-context.ts` — **TDD note**: do not commit this task before T008's component tests are written and failing
- [X] T010 [US2] Implement `useTableContext(view: EditorView | null): TableContext | null` React hook in `apps/web/src/hooks/use-table-context.ts` (depends on T009)
- [X] T011 [US2] Implement `parseTable(text: string): ParsedTable` and `serializeTable(table: ParsedTable): string` in `apps/web/src/lib/codemirror/asciidoc-table-operations.ts` (depends on T007)
- [X] T012 [US2] Implement `addRow(tableText, afterIndex)` and `removeRow(tableText, rowIndex): TableOpResult<string>` in `apps/web/src/lib/codemirror/asciidoc-table-operations.ts` (depends on T011)
- [X] T013 [US2] Implement `checkSpanConflict(tableText, columnIndex, targetIndex?)` in `apps/web/src/lib/codemirror/asciidoc-table-operations.ts` (depends on T011)
- [X] T014 [US2] Implement `addColumn(tableText, atIndex, before)`, `removeColumn(tableText, columnIndex): TableOpResult<string>`, and `moveColumn(tableText, fromIndex, direction): TableOpResult<string>` including `cols=` spec updates in `apps/web/src/lib/codemirror/asciidoc-table-operations.ts` (depends on T012, T013)
- [X] T015 [US2] Implement `formatTable(tableText)` (pad each cell to widest cell in its column with trailing spaces; leave delimiter lines and `cols=` line unchanged) in `apps/web/src/lib/codemirror/asciidoc-table-operations.ts` (depends on T011)
- [X] T016 [US2] Wire `tableContextField` into `EditorState.create` extensions array in `apps/web/src/hooks/use-editor-mount.ts` (depends on T009)
- [X] T017 [US2] Implement `EditorTableContextToolbar` component (props: `view`, `context`, `tableText`, `tableFrom`; all 9 action buttons; correct disabled states; tooltips on each button; dispatches `view.dispatch` on action) in `apps/web/src/components/editor/editor-table-context-toolbar.tsx` (depends on T008, T014, T015)
- [X] T018 [US2] Wire `EditorTableContextToolbar` into `AsciiDocEditor`: read `tableContext` via `useTableContext`, render toolbar between `EditorToolbar` and the CodeMirror div when `tableContext !== null` in `apps/web/src/components/editor/asciidoc-editor.tsx` (depends on T016, T017)

**Checkpoint**: User Story 2 is fully functional and testable independently — context toolbar appears/disappears with cursor position, all structural operations modify the table correctly, format aligns columns, and undo restores prior state.

---

## Phase 4: User Story 3 — Add a Caption to a Block (Priority: P1)

**Goal**: Caption lines (`.Title` syntax) are syntax-highlighted as a distinct token. Typing `.` at column 0 offers an autocomplete placeholder. A toolbar button inserts a caption at the current line.

**Independent Test**: Place cursor on the line before a `|===` table, click the Caption toolbar button → `.Block title` placeholder is inserted on that line and highlighted in a distinct style (muted/italic). Separately, type `.` at column 0 → autocomplete offers `.Caption text` → accepting it positions cursor on the caption text for editing.

### Tests for User Story 3 (TDD — write before implementation) ⚠️

> **Write these tests FIRST and confirm they FAIL before any implementation below.**

- [X] T019 [US3] Write failing tests for caption completion source (`.` at column 0 on a blank line offers `.Caption text` placeholder; cursor positioned on caption text after accept) in `apps/web/tests/lib/codemirror/asciidoc-completions.test.ts`

### Implementation for User Story 3

- [X] T020 [US3] Add `blockTitleToken` to `@external tokens` declaration and add `BlockTitle { blockTitleToken }` rule with `BlockTitle |` added to the `block` alternatives in `apps/web/src/lib/codemirror/asciidoc.grammar`
- [X] T021 [P] [US3] Implement `blockTitleToken` recognizer in `apps/web/src/lib/codemirror/asciidoc-block-tokens.ts` (triggers at line start when `.` is followed by non-whitespace, non-`.`, non-`[` character; consumes to end of line; depends on T020)
- [X] T022 [P] [US3] Add `BlockTitle: t.annotation` style tag to the highlight style tags in `apps/web/src/lib/codemirror/asciidoc-language.ts` (depends on T020)
- [X] T023 [US3] Rebuild the Lezer parser by running `lezer-generator src/lib/codemirror/asciidoc.grammar --output src/lib/codemirror/asciidoc-parser.js` from `apps/web/` (depends on T021, T022)
- [X] T024 [US3] Add caption completion source (`.` at column 0 → `.Caption text` placeholder with cursor selecting "Caption text") to `apps/web/src/lib/codemirror/asciidoc-completions.ts` (depends on T019, T023)
- [X] T025 [US3] Add Caption button to BLOCKS group in `apps/web/src/components/editor/editor-toolbar.tsx` (inserts `.Block title` on the line immediately preceding the current block; if the cursor is not adjacent to a captionable block, insert `.Block title` at the current cursor line instead; depends on T024)

**Checkpoint**: User Story 3 is fully functional and testable independently — `.Title` lines are highlighted, caption autocomplete triggers on `.` at column 0, and the toolbar Caption button inserts a caption placeholder.

---

## Phase 5: User Story 4 — Autocomplete Image Paths (Priority: P1)

**Goal**: Typing `image::` or `image:` triggers path completions from the project's file list, filtered to image extensions. Accepting inserts the full path with cursor between `[` and `]`.

**Independent Test**: In a project with uploaded image files, type `image::` → autocomplete lists `.png`, `.jpg`, `.svg`, etc. files → selecting one inserts `image::path/to/image.png[]` with cursor between `[` and `]`. Works for inline `image:` as well.

### Tests for User Story 4 (TDD — write before implementation) ⚠️

> **Write these tests FIRST and confirm they FAIL before any implementation below.**

- [X] T026 [US4] Write failing tests for `createImageCompletionSource` (triggers after `image::` and `image:`; filters to `.png`, `.jpg`, `.jpeg`, `.gif`, `.svg`, `.webp`; cursor positioned between `[` and `]` on accept; empty list when no image files match) in `apps/web/tests/lib/codemirror/asciidoc-completions.test.ts`

### Implementation for User Story 4

- [X] T027 [US4] Implement `createImageCompletionSource(paths: string[] | (() => string[]))` factory in `apps/web/src/lib/codemirror/asciidoc-completions.ts` (triggers after `image::` and `image:`; filters by image extensions; on accept inserts path and positions cursor between `[` and `]`; mirrors `createIncludeCompletionSource` pattern; depends on T026)
- [X] T028 [US4] Extend `useIncludeCompletions` to expose an image-filtered paths variant (reuse same fetch, filter client-side by extension) in `apps/web/src/hooks/use-include-completions.ts` (depends on T027)
- [X] T029 [US4] Wire `createImageCompletionSource` into the `autocompletion()` call in `apps/web/src/hooks/use-editor-mount.ts` (depends on T028)

**Checkpoint**: User Story 4 is fully functional and testable independently — `image::` and `image:` both trigger filtered image path completions from the current project.

---

## Phase 6: User Story 5 — Autocomplete Include File Paths Enhancement (Priority: P2)

**Goal**: Include path completions gain mid-path narrowing — after the user types a folder name followed by `/`, completions narrow to the contents of that directory only.

**Independent Test**: Type `include::docs/` in a project where a `docs/` folder exists → completions show only files and subdirectories inside `docs/`, not files in other directories. Selecting a file inserts the full path with cursor between `[` and `]`.

### Tests for User Story 5 (TDD — write before implementation) ⚠️

> **Write these tests FIRST and confirm they FAIL before any implementation below.**

- [X] T030 [US5] Write failing tests for mid-path narrowing in `createIncludeCompletionSource` (`include::docs/` narrows to files under `docs/`; `include::chapters/intro/` narrows to files under that nested path; no cross-directory false positives) in `apps/web/tests/lib/codemirror/asciidoc-completions.test.ts`

### Implementation for User Story 5

- [X] T031 [US5] Update `createIncludeCompletionSource` to support sub-directory narrowing after `/` (filter the path list to entries with the typed prefix; resolve completions relative to the prefix) and add an `apply` function to each option that appends `[]` and places the cursor between them (FR-IN-002) in `apps/web/src/lib/codemirror/asciidoc-completions.ts` (depends on T030)

**Checkpoint**: User Story 5 is fully functional and testable independently — `include::` completions narrow correctly to sub-directory contents after a `/` is typed.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Verify quality gates pass across all user stories.

- [X] T032 [P] Run `pnpm lint` in `apps/web` and fix all reported issues across changed files
- [X] T033 [P] Run `pnpm typecheck` in `apps/web` and fix all type errors (no `any`, no `as` casts in production code per architecture constitution)
- [X] T034 Run `pnpm test` in `apps/web` and confirm all tests in `apps/web/tests/` pass green

---

## Phase 8: Architecture Refactors (Post-Feature, P2)

**Purpose**: Resolve architectural drift identified by architecture-guard. Non-blocking — complete after spec 015 ships. See full migration plan in `specs/015-editor-tables-autocomplete/architecture-migration-plan.md`.

- [ ] T035 Split `apps/web/src/lib/codemirror/asciidoc-completions.ts` into per-source modules (`asciidoc-path-completions.ts`, `asciidoc-table-completions.ts`, `asciidoc-caption-completions.ts`, `asciidoc-attribute-completions.ts`) and reduce the original to a barrel re-export; split `apps/web/tests/lib/codemirror/asciidoc-completions.test.ts` into matching per-source test files (RT-001)
- [ ] T036 Extract the `EditorState.create` extensions array from `apps/web/src/hooks/use-editor-mount.ts` into a pure `createAsciiDocExtensions(config)` factory in `apps/web/src/lib/codemirror/asciidoc-editor-extensions.ts`; add a unit test for the factory; `useEditorMount` becomes lifecycle-only (RT-002)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **US1 (Phase 2)**: Depends on Phase 1 completion
- **US2 (Phase 3)**: Depends on Phase 1 completion; independent of US1
- **US3 (Phase 4)**: Depends on Phase 1 completion; independent of US1 and US2
- **US4 (Phase 5)**: Depends on Phase 1 completion; independent of US1–US3
- **US5 (Phase 6)**: Depends on Phase 1 completion; independent of US1–US4
- **Polish (Phase 7)**: Depends on all desired user stories being complete

> **No foundational blocking phase**: Every user story is independent and can begin after T001. P1 stories can be worked in parallel across team members.

### Within US2: Detailed Dependency Graph

```
T007 [P] ─────────────────────────────────┐
T008 [P] ──────────────────────────────┐  │
T009 [P] → T010                        │  │
           T009 → T016                 │  │
                                       ▼  ▼
                               T011 (depends on T007)
                               T011 → T012
                               T011 → T013
                               T011 → T015
                               T012 + T013 → T014
                               T014 + T015 + T008 → T017
                               T016 + T017 → T018
```

### Within US3: Dependency Graph

```
T019 (tests)
T020 (grammar) → T021 [P] ──┐
                T022 [P] ──┤
                            ▼
                          T023 (rebuild)
                          T019 + T023 → T024 → T025
```

### Parallel Opportunities

**At Phase 2 (US1) start:**
- T002 (test), T005 (style tags — different file) can start together

**At Phase 3 (US2) start:**
- T007, T008, T009 can all run concurrently (three different files)

**At Phase 4 (US3) after T020:**
- T021 and T022 can run concurrently (different files, both depend only on T020)

**Across stories (with multiple developers):**
- Developer A: US1 (Phase 2)
- Developer B: US2 (Phase 3)
- Developer C: US3 (Phase 4)
- Developer D: US4 (Phase 5), then US5 (Phase 6)

---

## Parallel Example: User Story 2

```bash
# Launch all three starting tasks together:
Task T007: "Write failing unit tests for table operations in apps/web/tests/lib/codemirror/asciidoc-table-operations.test.ts"
Task T008: "Write failing component tests for EditorTableContextToolbar in apps/web/tests/components/editor/editor-table-context-toolbar.test.tsx"
Task T009: "Implement tableContextField StateField in apps/web/src/lib/codemirror/asciidoc-table-context.ts"

# After T007 completes → start T011 (parseTable/serializeTable)
# After T009 completes → start T010 (useTableContext hook)
# T010 and T011 can proceed in parallel (different files)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001)
2. Complete Phase 2: US1 (T002–T006)
3. **STOP and VALIDATE**: Can authors insert a table skeleton via autocomplete and toolbar with syntax highlighting?
4. Demo if ready

### Incremental Delivery (Priority Order)

1. T001 → Foundation
2. T002–T006 → US1 complete (table autocomplete + toolbar) — **Shippable**
3. T007–T018 → US2 complete (context toolbar + structural editing) — **Shippable**
4. T019–T025 → US3 complete (caption authoring) — **Shippable**
5. T026–T029 → US4 complete (image path completions) — **Shippable**
6. T030–T031 → US5 complete (include path enhancement) — **Shippable**
7. T032–T034 → Polish + quality gates

### Full Parallel Team Strategy

With 4 developers after T001:
- **Dev A**: US1 (T002–T006)
- **Dev B**: US2 (T007–T018)
- **Dev C**: US3 (T019–T025)
- **Dev D**: US4 (T026–T029) then US5 (T030–T031)

Stories complete independently; polish phase requires all stories done.

---

## Notes

- `[P]` tasks touch different files with no shared incomplete dependencies — safe to parallelize
- `[Story]` label maps each task to the user story it delivers (traceability to spec.md)
- TDD is mandatory for all pure functions (`asciidoc-table-operations.ts`) and all components; write tests first, confirm they fail, then implement
- Grammar rebuild (T023) is a manual CLI step; commit the rebuilt `asciidoc-parser.js` alongside the grammar source
- No new npm packages are needed; all functionality uses the existing CodeMirror 6 and shadcn/ui stack
- Quality gates: `pnpm lint` + `pnpm typecheck` must pass in `apps/web` after each phase
- Undo support is free — all table operations dispatch via `view.dispatch({ changes: ... })` and CodeMirror's history extension handles undo automatically
