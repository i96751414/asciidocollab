# Tasks: File Tree UX Improvements & Project Page Consistency

**Input**: Design documents from `specs/013-file-tree-ux/`

**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅

**Tests**: Included — TDD is NON-NEGOTIABLE per project constitution. Write tests first and verify they fail before implementing.

**Organization**: Tasks are grouped by user story. US3 (Error Area) is implemented before US2 (Find in Tree) because the error lift and expand-state lift in US3/US2 are prerequisites for the Find architecture.

**Phase mapping** (tasks.md phases vs plan.md phases):

| Tasks Phase | Plan Phase | Content |
|-------------|------------|---------|
| Phase 1 (Setup) | — | Baseline green |
| Phase 2 (Foundational) | — | Empty; proceed immediately |
| Phase 3 | Phase 1 | US1 — Alphabetical Sort |
| Phase 4 | Phase 2 | US3 — Error Area |
| Phase 5 | Phase 3 | US2 — Find in Tree |
| Phase 6 | Phase 4 | US4 — Visual Consistency |

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to ([US1]–[US4])
- Exact file paths included in every description

## Path Conventions

| Source root | Test root |
|---|---|
| `apps/web/src/` | `apps/web/tests/` |

A test for `apps/web/src/components/file-tree/file-tree.tsx` → `apps/web/tests/components/file-tree/file-tree.test.tsx`

---

## Phase 1: Setup

**Purpose**: Establish a green baseline before any changes.

- [X] T001 Run `pnpm --filter @asciidocollab/web test` and confirm all existing tests pass — record any pre-existing failures before touching code

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: No shared infrastructure is needed for this UI-only feature. No tasks in this phase — proceed directly to user story phases.

**Checkpoint**: Foundation ready — begin Phase 3 immediately after T001.

---

## Phase 3: User Story 1 — Alphabetically Sorted File Tree (Priority: P1) 🎯 MVP

**Goal**: All tree levels render in case-insensitive alphabetical order, including after SSE mutations (create, rename, move).

**Independent Test**: Open a project with files and folders in arbitrary server order; verify every tree level renders alphabetically. Create a file and verify it appears at its correct alphabetical position, not appended to the end.

### Tests for User Story 1

> **Write these tests FIRST. Confirm they FAIL before implementing.**

- [X] T002 [US1] Write failing test in `apps/web/tests/components/file-tree/file-tree.test.tsx` asserting tree items at each level render in case-insensitive alphabetical order on initial load — include a test case with filenames that start with numbers, underscores, and accented characters (e.g., `_foo`, `2bar`, `ärch`) to validate `localeCompare { sensitivity: 'base' }` locale-awareness (spec Edge Case)
- [X] T003 [US1] Write failing test in `apps/web/tests/components/file-tree/file-tree.test.tsx` asserting a `created` SSE event inserts the new file at its correct alphabetical position (not appended)
- [X] T004 [US1] Write failing test in `apps/web/tests/components/file-tree/file-tree.test.tsx` asserting a `renamed` SSE event re-positions the file to its new alphabetical position

### Implementation for User Story 1

- [X] T005 [US1] Add `sortChildren(node: FileTreeNode): FileTreeNode` pure recursive helper in `apps/web/src/components/file-tree/file-tree.tsx` — sort each `children` array using `localeCompare` with `{ sensitivity: 'base' }`; apply to the tree root in `fetchTree`
- [X] T006 [US1] Apply `sortChildren` inside `applyEvent` in `apps/web/src/components/file-tree/file-tree.tsx` after `created`, `renamed`, and `moved` mutations — re-sort only the affected parent node's children array

**Checkpoint**: All T002–T006 tests green. File tree renders alphabetically on load and after mutations.

---

## Phase 4: User Story 3 — File Errors Outside Tree Items (Priority: P2)

> **Implementation order note**: US3 is implemented before US2 because the `onError` prop lift cleans up `FileTreeActions` — a prerequisite for the Find feature's expand-state lift in Phase 5.

**Goal**: File operation errors (create, rename, delete failures and validation) appear in a dismissible banner in the panel header area — never inside tree item rows.

**Independent Test**: Trigger a file naming error; verify the error appears in a `role="alert"` element outside the tree rows and that tree item heights are unaffected.

### Tests for User Story 3

> **Write these tests FIRST. Confirm they FAIL before implementing.**

- [X] T007 [P] [US3] Update `apps/web/tests/components/file-tree/file-tree-actions.test.tsx` — add failing test asserting an invalid-name operation calls the `onError` prop with the error message string (not renders an inline `<span>`)
- [X] T008 [P] [US3] Add failing test in `apps/web/tests/components/file-tree/file-tree.test.tsx` asserting a `role="alert"` error banner element renders in the panel header area (outside tree rows) after a failed file operation
- [X] T009 [P] [US3] Update `apps/web/tests/components/file-tree/file-tree-node.test.tsx` — add failing test asserting the `onError` prop is threaded through `FileTreeNode` to its `FileTreeActions` child

### Implementation for User Story 3

- [X] T010 [P] [US3] Add `onError: (message: string | null) => void` prop to `FileTreeActions` in `apps/web/src/components/file-tree/file-tree-actions.tsx` — remove internal `error` state and the inline `{error && <span>}` render; call `onError` wherever the error string was previously set
- [X] T011 [P] [US3] Add `onError: (message: string | null) => void` prop to `FileTreeNode` interface and component in `apps/web/src/components/file-tree/file-tree-node.tsx` — pass it through to `FileTreeActions`
- [X] T012 [US3] Add `operationError` state (`string | null`) to `FileTree` in `apps/web/src/components/file-tree/file-tree.tsx` — render dismissible banner `<div role="alert">` with `text-destructive` styling in the panel header area between the "Files" label row and the tree content; pass `onError={setOperationError}` down through `FileTreeNode`

**Checkpoint**: All T007–T012 tests green. Errors appear in the header banner; tree row heights are stable.

---

## Phase 5: User Story 2 — Find File in Tree (Priority: P2)

**Goal**: A find panel lets users search by filename, navigate forward/backward through matches with keyboard, and auto-expands collapsed ancestor folders for each match.

**Independent Test**: Trigger find (Ctrl+F), type a partial name, verify the first match is highlighted and visible. Press next-match and verify it cycles through all matches, expanding collapsed folders automatically.

### Tests for User Story 2

> **Write these tests FIRST. Confirm they FAIL before implementing.**

- [X] T013 [P] [US2] Write failing tests in `apps/web/tests/hooks/use-find-in-tree.test.ts` covering: `buildMatchList` DFS traversal, first-match selection on query change, `nextMatch`/`prevMatch` cycling, wrap-around at end/beginning, auto-expand of ancestor folders, `dismiss` restoring pre-search expand snapshot, "no matches" state, **empty tree** (tree with zero children — `matchCount === 0`, no crash, "no matches" indicator shown; spec Edge Case), and **match deletion mid-session** (currently-selected match node is removed from the tree via SSE — hook rebuilds match list and either advances to next match or enters "no matches" state gracefully; spec Edge Case)
- [X] T014 [P] [US2] Write failing tests in `apps/web/tests/components/file-tree/find-panel.test.tsx` covering: renders search input and navigation buttons, typing updates query via `onQueryChange`, ↑/↓ buttons fire `onNext`/`onPrev`, match counter displays `currentMatchIndex + 1 of matchCount`, dismiss button fires `onDismiss`

### Lift Expand State (prerequisite for Find hook)

- [X] T015 [US2] Update `apps/web/tests/components/file-tree/file-tree-node.test.tsx` — update existing expand/collapse tests to pass controlled `isExpanded: boolean` and `onToggle: (nodeId: string) => void` props instead of relying on internal state
- [X] T016 [US2] Replace `const [isExpanded, setIsExpanded] = useState(false)` in `FileTreeNode` with controlled props `isExpanded: boolean` and `onToggle: (nodeId: string) => void` in `apps/web/src/components/file-tree/file-tree-node.tsx` — remove internal expand state entirely
- [X] T017 [US2] Add `expandedState: Map<string, boolean>` to `FileTree` state and implement `toggleExpand(nodeId: string)` helper in `apps/web/src/components/file-tree/file-tree.tsx` — pass `isExpanded={expandedState.get(node.id) ?? false}` and `onToggle={toggleExpand}` to every `FileTreeNode` call (including recursive calls through `DragDropZone`)

### Implement Hook and Component

- [X] T018 [P] [US2] Implement `useFindInTree` hook in `apps/web/src/hooks/use-find-in-tree.ts` with signature `(tree: FileTreeNode | null, expandedState: Map<string, boolean>, setExpandedState: (s: Map<string, boolean>) => void)` — implement `buildMatchList` DFS storing **full `FileTreeNode` references** per match (not just IDs) plus pre-computed `ancestorIds`; expand ancestors on match navigation; snapshot and restore `preSearchExpandedIds` on dismiss; expose `currentMatch: FileTreeNode | null` in the return value. Add a comment noting the hook owns full expand-map write access during an active session.
- [X] T019 [P] [US2] Implement `FindPanel` component in `apps/web/src/components/file-tree/find-panel.tsx` — render text input, `ChevronUp`/`ChevronDown` Lucide icon buttons, `n of m` match counter, and `X` dismiss button; accept props `{ query, onQueryChange, matchCount, currentMatchIndex, onNext, onPrev, onDismiss }`

### Wire into FileTree

- [X] T020 [US2] Add failing integration test in `apps/web/tests/components/file-tree/file-tree.test.tsx` — verify Ctrl+F opens `FindPanel`, typing a query highlights the first match, next/prev buttons cycle matches, Escape dismisses the panel and restores expand state
- [X] T021 [US2] Wire `FindPanel` and `useFindInTree` into `FileTree` in `apps/web/src/components/file-tree/file-tree.tsx` — add `onKeyDown` Ctrl+F/Cmd+F handler on the container div; render `FindPanel` between the header row and the error banner; pass `setExpandedState` as a wrapper `(s) => setExpandedState(s)` (not the raw React dispatcher) to satisfy the hook's plain callback type; on match navigation call `onSelectFile(node.id, node.name, node.path, node.type)` using `currentMatch` from the hook return value

**Checkpoint**: All T013–T021 tests green. Find panel opens, searches, navigates, expands ancestors, and dismisses correctly.

---

## Phase 6: User Story 4 — Project Page Visual Consistency (Priority: P3)

**Goal**: Project editor page looks cohesive — collapse buttons use Lucide icons, header links use consistent styles, panels use consistent padding.

**Independent Test**: Open the project page; verify no raw unicode `‹`/`›` characters in collapse buttons, all header links have the same text-sm style class, and panels have consistent padding.

### Tests for User Story 4

> **Write these tests FIRST. Confirm they FAIL before implementing.**

- [X] T022 [US4] Update `apps/web/tests/app/(dashboard)/projects/[id]/project-editor-layout.test.tsx` — add failing tests asserting `ChevronLeft` and `ChevronRight` icon elements are rendered (not raw unicode characters) for the sidebar and preview collapse/expand controls
- [X] T022b [US4] Add failing test in `apps/web/tests/app/(dashboard)/projects/[id]/project-editor-layout.test.tsx` asserting all header navigation links (Back, Settings, Members) include class tokens `text-sm` and `text-muted-foreground` — must fail before T024 is implemented
- [X] T022c [US4] Add failing test in `apps/web/tests/app/(dashboard)/projects/[id]/project-editor-layout.test.tsx` asserting content panel wrapper has `p-4` class and preview empty-state element has `text-sm` and `text-muted-foreground` classes — must fail before T025 is implemented

### Implementation for User Story 4

- [X] T023 [US4] Replace `‹`/`›` unicode collapse/expand buttons with `<Button variant="ghost" size="icon"><ChevronLeft className="h-4 w-4" /></Button>` and `<Button variant="ghost" size="icon"><ChevronRight className="h-4 w-4" /></Button>` in `apps/web/src/app/(dashboard)/dashboard/projects/[id]/project-editor-layout.tsx`
- [X] T024 [US4] Audit and unify all header link styles in `apps/web/src/app/(dashboard)/dashboard/projects/[id]/project-editor-layout.tsx` — ensure Back, Settings, and Members links all use `text-sm text-muted-foreground hover:text-foreground` with no inconsistent overrides *(T022b must be failing before this task starts)*
- [X] T025 [US4] Review and align panel padding and empty-state typography in `apps/web/src/app/(dashboard)/dashboard/projects/[id]/project-editor-layout.tsx` — verify content panel uses `p-4`, preview panel empty-state uses consistent `text-sm text-muted-foreground` styling, and file tree panel header has consistent `p-2` vertical padding *(T022c must be failing before this task starts)*

**Checkpoint**: All T022–T025 tests green (including T022b and T022c). No unicode collapse chars; consistent header and panel styling.

---

## Final Phase: Polish & Cross-Cutting Concerns

- [X] T026 [P] Run full quality gate from repo root: `pnpm --filter @asciidocollab/web lint && pnpm --filter @asciidocollab/web typecheck && pnpm --filter @asciidocollab/web test` — resolve any remaining lint, type, or test failures
- [ ] T027 Start dev server and perform visual browser verification — confirm alphabetical sort, find panel keyboard flow, error banner placement, and visual consistency on the project page for both owner and member roles; explicitly validate SC-002 (locate any file in a 50-item 3-level tree using find in under 10 seconds) and SC-005 (no new visual inconsistency reports — this criterion requires team reviewer sign-off before the phase is considered complete)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: No tasks — proceed to Phase 3
- **US1 — Alphabetical Sort (Phase 3)**: No story dependencies — start after T001
- **US3 — Error Area (Phase 4)**: No dependency on US1 (different concerns, both touch `file-tree.tsx` so must be sequential with US1)
- **US2 — Find in Tree (Phase 5)**: **MUST** wait for US1 (alphabetical sort) and US3 (error lift + `FileTreeActions` cleanup) to complete
- **US4 — Visual Consistency (Phase 6)**: Independent — can start after US1 if desired, but logically last (P3)
- **Polish (Final)**: All user stories complete

### User Story Dependencies

```
US1 (Phase 3) ──────────────────────────────┐
                                             ▼
US3 (Phase 4) ──────────────────────────> US2 (Phase 5)
                                             
US4 (Phase 6) — independent from US1/US2/US3
```

### Within Each User Story

1. Tests MUST be written and FAIL before implementation
2. Test files first, then source files
3. For US2: expand-state lift (T015–T017) before hook implementation (T018–T019)
4. Integration/wiring tasks last within each story

### Parallel Opportunities

**Within Phase 4 (US3) — tests can start in parallel:**
- T007 (`file-tree-actions.test.tsx`) ‖ T008 (`file-tree.test.tsx`) ‖ T009 (`file-tree-node.test.tsx`)

**Within Phase 4 (US3) — implementations can start in parallel:**
- T010 (`file-tree-actions.tsx`) ‖ T011 (`file-tree-node.tsx`)

**Within Phase 5 (US2) — initial tests can start in parallel:**
- T013 (`use-find-in-tree.test.ts`) ‖ T014 (`find-panel.test.tsx`)

**Within Phase 5 (US2) — hook and component can be built in parallel (after T015–T017):**
- T018 (`use-find-in-tree.ts`) ‖ T019 (`find-panel.tsx`)

---

## Parallel Example: User Story 3 (Error Area)

```bash
# Tests phase — launch all three test updates in parallel:
Task: "Update file-tree-actions.test.tsx with onError test" (T007)
Task: "Add error banner test to file-tree.test.tsx" (T008)
Task: "Update file-tree-node.test.tsx with onError passthrough test" (T009)

# Implementation phase — T010 and T011 can run in parallel:
Task: "Update FileTreeActions with onError prop" (T010)
Task: "Add onError passthrough to FileTreeNode" (T011)
# Then: T012 (FileTree banner) after T010 and T011 complete
```

## Parallel Example: User Story 2 (Find in Tree)

```bash
# Initial test tasks — launch in parallel:
Task: "Write useFindInTree hook tests" (T013)
Task: "Write FindPanel component tests" (T014)

# After expand-state lift (T015-T017) — hook and component in parallel:
Task: "Implement useFindInTree hook" (T018)
Task: "Implement FindPanel component" (T019)
# Then: T020 (integration test) and T021 (wire into FileTree) after T018+T019
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: baseline green (T001)
2. Complete Phase 3: US1 Alphabetical Sort (T002–T006)
3. **STOP and VALIDATE**: Open project page in browser; confirm alphabetical ordering
4. Deploy/demo if ready

### Incremental Delivery

1. T001 → baseline green
2. T002–T006 → US1 (alphabetical sort) → demo
3. T007–T012 → US3 (error area) → demo
4. T013–T021 → US2 (find in tree) → demo
5. T022–T022c, T023–T025 → US4 (visual consistency) → demo
6. T026–T027 → polish + visual sign-off

### Quality Gate (run after each phase)

```bash
pnpm --filter @asciidocollab/web lint
pnpm --filter @asciidocollab/web typecheck
pnpm --filter @asciidocollab/web test
```

---

## Notes

- [P] tasks = different files, no blocking dependency — safe to run concurrently
- [Story] label maps each task to its user story for traceability
- TDD is NON-NEGOTIABLE (project constitution): every test must be red before the implementation that makes it green
- US2 (Find) cannot begin until both US1 (sort) and US3 (error area) are complete — `expandedState` lift and `FileTreeActions` cleanup are prerequisites
- The error area for file operations is scoped to the file tree panel (not global toast), per spec assumption
- Alphabetical sort is purely client-side; server order is not relied upon
- No API contract changes; no new packages required
