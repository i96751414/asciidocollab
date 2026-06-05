# Implementation Plan: Editor Tables, Captions & Autocomplete

**Branch**: `015-editor-tables-autocomplete` | **Date**: 2026-06-05 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/015-editor-tables-autocomplete/spec.md`

---

## Summary

Add table and caption authoring support to the CodeMirror 6 editor, extend autocomplete to cover image paths and polished include paths, and introduce a context-sensitive toolbar that appears when the cursor is inside a `|===` block, exposing structural table editing actions (add/remove/move rows and columns, format). All changes are confined to `apps/web`; no domain, infrastructure, or API modifications are required.

---

## Technical Context

**Language/Version**: TypeScript 6.x, React 19

**Primary Dependencies**: CodeMirror 6 (`@codemirror/state`, `@codemirror/view`, `@codemirror/autocomplete`, `@codemirror/language`), `@lezer/lr` (grammar rebuild via `lezer-generator`), shadcn/ui + Radix UI + Tailwind CSS

**Storage**: N/A — all logic is client-side; no new API endpoints or database changes

**Testing**: Jest + Testing Library (`apps/web/tests/`)

**Target Platform**: Desktop browser

**Project Type**: Frontend web application — editor feature extension

**Performance Goals**: Completions appear within 300 ms; table operations (add/remove/move/format) complete in < 100 ms for tables up to 200 rows

**Constraints**: No new npm packages without justification; must integrate with the existing CodeMirror extension stack in `useEditorMount`; grammar changes require a `lezer-generator` rebuild step

**Scale/Scope**: Single editor instance; tables up to ~50 columns × 200 rows; files up to 5 000 lines

---

## Constitution Check

### Governance (constitution.md v2.0.0)

| Principle | Status | Notes |
|-----------|--------|-------|
| Clean Code — small functions, intent-revealing names | ✅ Pass | Table operations are pure functions with single responsibilities; context toolbar is a single-responsibility component |
| TDD — red-green-refactor, no production code before failing test | ✅ Pass | Every pure function in `asciidoc-table-operations.ts` has a test written first; component tests precede UI wiring |
| Seam Testing — in-memory fakes for repositories | ✅ N/A | No domain repositories touched; all logic is client-side pure functions and React components |
| Commit discipline — conventional commits, one logical change per commit | ✅ Pass | Each delivery phase maps to one or more conventional commits |
| Quality Gates — `pnpm lint`, `pnpm typecheck`, unit tests green before commit | ✅ Pass | `apps/web` lint and typecheck must pass after each phase |

### Architecture (architecture_constitution.md v2.4.0)

| Rule | Status | Notes |
|------|--------|-------|
| Layer boundaries — changes confined to delivery layer | ✅ Pass | All changes are in `apps/web`; no domain/infra/shared packages touched |
| No `any` types in production code | ✅ Pass | All new code uses strict TypeScript types |
| No `as` casts in production code | ✅ Pass | Use discriminated union results (`TableOpResult`) instead of casts |
| Test files in `tests/` root (not `__tests__`) | ✅ Pass | All new test files follow `apps/web/tests/` convention |
| CodeMirror 6 mandate | ✅ Pass | All editor extensions use CodeMirror 6 APIs |
| No new Prisma schema changes | ✅ N/A | Feature is entirely client-side |

### Security (security_constitution.md v1.0.0)

| Rule | Status | Notes |
|------|--------|-------|
| No cross-project file access | ✅ Pass | Image completions use the same project-scoped `/projects/:id/files` endpoint as include completions |
| Input validation at boundary | ✅ Pass | Table text is always read from `state.doc` (trusted editor state); no user-supplied raw strings reach table operations directly |

**No violations. No entries required in Complexity Tracking.**

---

## Project Structure

### Documentation (this feature)

```text
specs/015-editor-tables-autocomplete/
├── plan.md              ← this file
├── research.md          ← Phase 0 output
├── data-model.md        ← Phase 1 output
├── contracts/
│   └── table-operations.ts   ← Phase 1 output
└── tasks.md             ← Phase 2 output (/speckit-tasks)
```

### Source Code

All changes are in `apps/web/src/`:

```text
apps/web/src/
├── lib/codemirror/
│   ├── asciidoc.grammar              ← extend: add blockTitleToken + BlockTitle rule
│   ├── asciidoc-block-tokens.ts      ← extend: add blockTitleToken recognizer
│   ├── asciidoc-language.ts          ← extend: add BlockTitle → t.annotation style tag
│   ├── asciidoc-completions.ts       ← extend: table snippet, caption, image path sources
│   ├── asciidoc-table-operations.ts  ← NEW: pure functions for table manipulation
│   └── asciidoc-table-context.ts     ← NEW: StateField tracking cursor-in-table position
├── hooks/
│   ├── use-include-completions.ts    ← extend: expose image-filtered variant
│   ├── use-table-context.ts          ← NEW: React hook reading tableContextField
│   └── use-editor-mount.ts           ← extend: wire tableContextField + image completions
└── components/editor/
    ├── editor-toolbar.tsx             ← extend: add Table + Caption buttons to BLOCKS group
    ├── editor-table-context-toolbar.tsx ← NEW: context toolbar shown inside table blocks
    └── asciidoc-editor.tsx            ← extend: render EditorTableContextToolbar
```

### Test Files

```text
apps/web/tests/
├── lib/codemirror/
│   ├── asciidoc-table-operations.test.ts  ← unit: pure functions (most comprehensive)
│   └── asciidoc-completions.test.ts       ← unit: image + caption + table snippet sources
└── components/editor/
    └── editor-table-context-toolbar.test.tsx ← component: render + action callbacks
```

---

## Delivery Phases

### Phase A — Grammar: BlockTitle Token

**Goal**: Syntax-highlight `.Title` (caption) lines as a distinct token.

1. Add `blockTitleToken` to the `@external tokens` declaration in `asciidoc.grammar`
2. Add `BlockTitle { blockTitleToken }` rule; add `BlockTitle |` to the `block` alternatives
3. Implement `blockTitleToken` recognizer in `asciidoc-block-tokens.ts`:
   - Triggers at line start when `.` is followed by any non-whitespace, non-`.`, non-`[` character
   - Consumes to end of line
4. Add `BlockTitle: t.annotation` to the style tags in `asciidoc-language.ts`
5. Rebuild parser: `lezer-generator src/lib/codemirror/asciidoc.grammar --output src/lib/codemirror/asciidoc-parser.js`

**Commits**: `feat(015): add BlockTitle grammar token for caption highlighting`

---

### Phase B — Completions: Table Snippet, Caption, Image Paths

**Goal**: Autocomplete for table insertion, caption insertion, and image paths.

1. **Table skeleton snippet** in `asciidoc-completions.ts`:
   - Trigger: `|===` typed at column 0
   - Inserts a 2-column skeleton: `|===\n|col1 |col2\n\n|cell1 |cell2\n|===\n`
   - Cursor lands on first cell

2. **Caption completion** in `asciidoc-completions.ts`:
   - Trigger: `.` at column 0 on a blank line
   - Offers single option: `.Caption text` placeholder
   - Cursor selects "Caption text" for immediate overwrite

3. **Image path completion source** in `asciidoc-completions.ts`:
   - Factory `createImageCompletionSource(paths: string[] | (() => string[]))` matching the existing `createIncludeCompletionSource` pattern
   - Triggers after `image::` and `image:` (single colon)
   - Filters paths to `.png`, `.jpg`, `.jpeg`, `.gif`, `.svg`, `.webp`
   - On accept: inserts path and positions cursor between `[` and `]`

4. **Include mid-path narrowing** in `asciidoc-completions.ts`:
   - Update `createIncludeCompletionSource` to support sub-directory narrowing after `/`

5. **Wiring**:
   - Extend `useIncludeCompletions` (or add `useImageCompletions`) to expose image-filtered paths
   - Wire `createImageCompletionSource` into `useEditorMount`'s `autocompletion()` call

**Commits**: `feat(015): add table snippet, caption, and image path completions`

---

### Phase C — Table Context StateField

**Goal**: Track whether the cursor is inside a `|===` block and expose row/column position.

1. Implement `tableContextField: StateField<TableContext | null>` in `asciidoc-table-context.ts`:
   - On each transaction, walk the syntax tree to find `TableBlock` nodes
   - If the cursor's document position falls between a `TableBlock`'s `from` and `to`, record context
   - Parse the raw text between delimiters to compute `cursorRowIndex`, `cursorColumnIndex`, `rowCount`, `columnCount`, `hasColSpec`
   - Returns `null` when cursor is outside any table

2. Implement `useTableContext(view: EditorView | null): TableContext | null` hook in `use-table-context.ts`

3. Wire `tableContextField` into `useEditorMount`'s `EditorState.create` extensions array

**Commits**: `feat(015): add tableContextField StateField for cursor-in-table detection`

---

### Phase D — Table Operations (Pure Functions)

**Goal**: All structural table editing as pure, fully-tested functions.

Implement in `asciidoc-table-operations.ts`:

1. `parseTable(text: string): ParsedTable` — split text into delimiter lines, optional col-spec line, header rows, body rows, and cell arrays
2. `serializeTable(table: ParsedTable): string` — inverse of parse; preserves col-spec line
3. `addRow(text: string, afterIndex: number): string` — insert empty row; never blocked
4. `removeRow(text: string, rowIndex: number): TableOpResult<string>` — blocked when only 1 row remains
5. `addColumn(text: string, atIndex: number, before: boolean): string` — inserts empty cell in every row; updates `cols=` spec with `1` entry at the matching position
6. `removeColumn(text: string, columnIndex: number): TableOpResult<string>` — checks `checkSpanConflict`; removes cell from every row and corresponding col-spec entry
7. `moveColumn(text: string, fromIndex: number, direction: 'left' | 'right'): TableOpResult<string>` — checks both source and target for span conflicts; swaps cells and col-spec entries
8. `formatTable(text: string): string` — pads each cell to widest cell in its column
9. `checkSpanConflict(text: string, columnIndex: number, targetIndex?: number): boolean` — scans rows for `N+|` markers affecting `columnIndex` or `targetIndex`

**Commits**: `feat(015): implement table operations pure functions`

---

### Phase E — Context Toolbar UI

**Goal**: Floating context toolbar visible when cursor is inside a `|===` block.

1. Implement `EditorTableContextToolbar` in `editor-table-context-toolbar.tsx`:
   - Props: `view: EditorView`, `context: TableContext`, `tableText: string`, `tableFrom: number`
   - Renders buttons: Add row above, Add row below, Remove row, Add column left, Add column right, Remove column, Move column left, Move column right, Format table
   - Each button calls the corresponding table operation, then dispatches the result as a document change
   - Disabled states: Remove row (1 row left), Remove/Move column (1 column left, or span conflict detected)
   - Tooltip on each button (action name + reason if disabled)

2. Wire into `AsciiDocEditor`:
   - Read `tableContext` via `useTableContext(viewReference.current)`
   - Render `<EditorTableContextToolbar>` below the main toolbar when `tableContext !== null`

**Commits**: `feat(015): add EditorTableContextToolbar context-sensitive toolbar`

---

### Phase F — Static Toolbar Additions

**Goal**: Table and Caption insert buttons in the main toolbar's BLOCKS group.

1. Add to `BLOCKS` array in `editor-toolbar.tsx`:
   - `Table` — inserts the same 2-column skeleton as the snippet completion
   - `Caption` — inserts `.Caption text` with cursor on the text

**Commits**: `feat(015): add Table and Caption buttons to editor toolbar`

---

## Complexity Tracking

No constitution violations. No entries required.
