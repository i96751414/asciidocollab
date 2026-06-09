---
description: "Task list for Persist & Restore File Selection"
---

# Tasks: Persist & Restore File Selection

**Input**: Design documents from `/specs/019-persist-file-selection/`

**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓, data-model.md ✓, contracts/ ✓

**Tests**: REQUIRED. The project constitution mandates TDD (Principle II, NON-NEGOTIABLE) — every unit gets a failing test before implementation. Test tasks are ordered first within each phase.

**Organization**: Tasks are grouped by user story. The feature is frontend-only (`apps/web`); no API/domain/DB work.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no incomplete dependencies)
- **[Story]**: US1 / US2 / US3 (maps to spec.md user stories)

## Path Conventions (apps/web)

- Source: `apps/web/src/...`  ·  Tests: `apps/web/tests/...` (mirror, drop `src/`)  ·  E2E: `apps/web/e2e/...`
- Never use `__tests__/` or co-located tests (Architecture Constitution P0).

---

## Phase 1: Setup

**Purpose**: Confirm the workspace is ready; no new dependencies are introduced.

- [x] T001 [P] Confirm Jest (`apps/web/jest.config.cjs`) picks up `apps/web/tests/hooks/use-last-selection.test.ts` and the Playwright config picks up `apps/web/e2e/project-file-restore.spec.ts`; confirm no new runtime dependencies are required (uses existing React, CodeMirror 6, `localStorage`).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The shared `useLastSelection` persistence hook used by ALL user stories.

**⚠️ CRITICAL**: US1, US2, and US3 all consume this hook — it must exist first.

- [x] T002 [P] Write FAILING unit tests for `useLastSelection` in `apps/web/tests/hooks/use-last-selection.test.ts` covering contract cases C1–C12 from `contracts/last-selection-storage.md`: returns null when empty (C1) / returns parsed value (C2) / malformed JSON → null without throwing (C3) / non-finite or `<1` `line` dropped (C4) / `rememberFile` writes entry and drops prior `line` (C5) / folder passed → no write (C6) / `rememberLine` merges into existing entry (C7) / `rememberLine` with no entry → no fabricated entry (C8) / `clearLastSelection` removes key (C9) / `localStorage` throwing → safe no-op, read returns null (C10) / two `projectId`s isolated for the same user (C11) / **two `userId`s isolated for the same project — user A never reads user B's value (C12, FR-011)**.
- [x] T003 Implement `useLastSelection(userId, projectId)` in `apps/web/src/hooks/use-last-selection.ts` to make T002 pass: export `LastSelection` interface (`nodeId`, `nodeName`, `nodeType`, `path`, optional 1-based `line`); a named key helper `lastSelectionKey(userId, projectId)` → `asciidocollab:last-selection:${userId}:${projectId}` (no magic strings; **user-scoped per FR-011**); guarded `try/catch` `localStorage` access with a type-guard validator (narrow `unknown`, no `any`/`as`, mirroring `use-editor-preferences.ts`); `readLastSelection`, `rememberFile` (skip folders, drop prior `line`), `rememberLine` (merge only when an entry exists), `clearLastSelection`.

**Checkpoint**: Persistence seam ready and unit-tested — user-story wiring can begin.

---

## Phase 3: User Story 1 - Resume on the last opened file (Priority: P1) 🎯 MVP

**Goal**: Returning to a project auto-re-selects the file the user last had open, **reveals it in the tree (expanding collapsed ancestor folders + scroll into view)**, with no manual action; works across in-app navigation and browser reload, independently per project.

**Independent Test**: Select a file (nested in collapsed folders), navigate to Settings, return to the project → same file selected, its folders expanded and node scrolled into view, content shown. Reload → still restored. Two projects each restore their own file.

### Tests for User Story 1 ⚠️ (write first, must fail)

- [x] T004 [P] [US1] Add FAILING Playwright E2E `apps/web/e2e/project-file-restore.spec.ts`: select a file → click Settings → return to project → same file is selected/shown; **select a file nested in collapsed folders, return → ancestor folders are expanded and the node is visible/highlighted (FR-012)**; hard reload → still selected; open a second project, select a different file, switch back → each project restores independently; brand-new project → no file forced open.
- [x] T005 [P] [US1] Extend `apps/web/tests/app/(dashboard)/projects/[id]/project-editor-layout.test.tsx` (fetch mocked): with a stored `LastSelection`, the layout auto-selects that file once on mount; selecting a file calls `rememberFile`; with no stored selection, nothing is auto-selected; **the layout renders its default/interactive state immediately even while restore is unresolved or fails — restore never blocks the view (FR-010)**.
- [x] T006 [P] [US1] Extend `apps/web/tests/components/file-tree/file-tree.test.tsx` for tree reveal (cases R1–R7 from `contracts/tree-reveal-on-select.md`): mounting/setting a `selectedNodeId` nested in collapsed folders expands its ancestors and scrolls it into view (R1); reveal runs once the async tree loads (R2); a root/visible node needs no expand but still scrolls, no error (R3); **manually collapsing a folder that holds the already-selected node does NOT re-expand it (R4)**; `selectedNodeId=null` is a no-op (R5); changing to a new hidden node reveals it (R6); an unchanged `selectedNodeId` re-render does not re-reveal (R7).

### Implementation for User Story 1

- [x] T007 [US1] Thread the current user id into the layout: in `apps/web/src/app/(dashboard)/dashboard/projects/[id]/page.tsx` pass `currentUserId` (already returned by `getProjectAccess`) into `ProjectEditorLayout`, and add a `userId: string` prop to `project-editor-layout.tsx`. Then persist file selection: wrap the `FileTree` `onSelectFile` handler to call `useLastSelection(userId, projectId).rememberFile({ nodeId, nodeName, nodeType, path })` alongside the existing `selectFile`.
- [x] T008 [US1] In the same layout, restore on mount: read `readLastSelection()` (from the user-scoped `useLastSelection(userId, projectId)`) and auto-`selectFile(...)` exactly once via a one-shot `hasRestoredReference` ref; no-op when none stored. Restoration MUST NOT block first paint (FR-010). (Makes T004/T005 file-restore cases pass.)
- [x] T009 [P] [US1] Auto-reveal in `apps/web/src/components/file-tree/file-tree.tsx`: add an effect keyed on `selectedNodeId` + `tree` (NOT `expandedState`) that, when `selectedNodeId` changes to a node whose ancestors are collapsed, calls the existing `revealSelected(selectedNodeId)` and scrolls it into view (reuse the `handleRevealFile` pattern); guard with a last-revealed ref to avoid redundant work (R7) and to not fight manual collapse (R4). No change to `useFileTreeUIState`. (Makes T006 pass and the T004 reveal scenario pass.)

**Checkpoint**: US1 fully functional (restore + reveal) — MVP deliverable.

---

## Phase 4: User Story 2 - Resume at the last cursor line in AsciiDoc files (Priority: P2)

**Goal**: For restored AsciiDoc files, return the cursor to the remembered line (scrolled into view), clamped to the closest valid line if the document shrank.

**Independent Test**: Put cursor on line ~40 of an `.adoc`, navigate away and back → editor opens at ~line 40. Shorten the doc below 40, return → cursor on last line, no error. Non-AsciiDoc files get no line behavior.

**Depends on**: Phase 2 (hook), and shares the layout/editor with US1.

### Tests for User Story 2 ⚠️ (write first, must fail)

- [x] T010 [P] [US2] Extend `apps/web/tests/hooks/use-editor-mount.test.ts`: `initialLine=N` places the cursor at the start of line N with `scrollIntoView`; `initialLine` greater than `doc.lines` clamps to the last line (no error); `initialLine` `<1`/undefined → cursor stays at default; the jump applies once on mount and does not re-fire on re-render.
- [x] T011 [P] [US2] Extend `apps/web/tests/components/editor/asciidoc-editor.test.tsx`: `onCursorLineChange` fires with the 1-based line when the cursor moves; an `initialLine` prop is threaded into the mount; omitting `onCursorLineChange` causes no error.
- [x] T012 [US2] Extend `apps/web/e2e/project-file-restore.spec.ts` with AsciiDoc line-restore and clamp scenarios. (Edits T004's file — run after T004.)

### Implementation for User Story 2

- [x] T013 [US2] Add optional `initialLine` to `useEditorMount` in `apps/web/src/hooks/use-editor-mount.ts`: after the `EditorView` is created in the mount effect, if `initialLine` is provided, dispatch a selection to the start of `min(max(initialLine,1), view.state.doc.lines)` with `scrollIntoView: true`. (Makes T010 pass.)
- [x] T014 [US2] Thread props through `AsciiDocEditor` in `apps/web/src/components/editor/asciidoc-editor.tsx`: accept `initialLine?` (pass to `useEditorMount`) and `onCursorLineChange?(line)` (invoke from the existing `onCursorChange` with `line`). (Makes T011 pass.)
- [x] T015 [US2] In `project-editor-layout.tsx`, wire line persistence and restore: debounce (~500ms) `rememberLine(line)` from `onCursorLineChange` for AsciiDoc files only (FR-006); pass `initialLine` to `ContentArea`/`AsciiDocEditor` only for the restored file on the first restore mount (restore-once via the ref from T008). (Makes T012 pass.)

**Checkpoint**: US1 + US2 both work independently.

---

## Phase 5: User Story 3 - Graceful fallback when the remembered file is gone (Priority: P3)

**Goal**: When the remembered file no longer exists, no error is shown; the view falls back to the default no-file state and stale memory is cleared so it is not retried.

**Independent Test**: Select a file, delete it, return to the project → no error, default empty state; reload → does not try to reopen it.

**Depends on**: Phase 2 (hook) and US1 (restore path).

### Tests for User Story 3 ⚠️ (write first, must fail)

- [x] T016 [P] [US3] Extend `apps/web/tests/hooks/use-file-selection.test.tsx`: a non-OK (HTTP 404) content response sets a `notFound` signal and does NOT populate `content`/`error` (graceful, no throw).
- [x] T017 [P] [US3] Extend `apps/web/tests/app/(dashboard)/projects/[id]/project-editor-layout.test.tsx`: when restore selects a file whose content fetch 404s, `clearLastSelection` is called, the view resets to no-selection (no error UI), and a subsequent mount does not retry the missing file.

### Implementation for User Story 3

- [x] T018 [US3] In `apps/web/src/hooks/use-file-selection.ts`, check `response.ok`: on a non-OK content response, surface a `notFound` flag on `FileContentState` (leave `error` null for 404) instead of reading the body — no throw. (Makes T016 pass.)
- [x] T019 [US3] In `project-editor-layout.tsx`, when a restore-initiated selection reports `notFound`, call `clearLastSelection()` and reset the selection to null (no error shown). (Makes T017 pass.)

**Checkpoint**: All three stories independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [x] T020 [P] Lint + type-check the package: `npx eslint apps/web` and `npx tsc -p apps/web/tsconfig.json --noEmit`; fix any findings (zero `any`/`as` in production code).
- [x] T021 [P] Coverage: `pnpm --filter @asciidocollab/web exec jest --coverage`; ensure the new/changed files are covered and thresholds do not regress.
- [ ] T022 Run the `quickstart.md` manual verification (US1 restore + nested-folder reveal, US2 line restore, US3 deleted-file fallback, non-AsciiDoc file, `localStorage` inspection, the SC-003 "restore is perceptibly instant / no flash of empty state" check, and the two-accounts-same-browser isolation check for FR-011).
- [x] T023 Run the full pre-merge gate: `rm -rf apps/web/.next` (e2e gotcha) then `pnpm gate`. (Quality, unit+coverage, integration, and e2e all green; the lone e2e failure — a test-setup bug clicking an already-auto-expanded folder — was fixed and the full 86-test e2e suite re-verified green on a fresh isolated stack.)

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (P1)** → no deps.
- **Foundational (P2)** → after Setup; **blocks all user stories** (T003 is imported by every story).
- **US1 (P3)** → after Foundational.
- **US2 (P4)** → after Foundational; touches the same editor/layout as US1 (sequence after US1 to avoid layout-file churn, though logically independent).
- **US3 (P5)** → after Foundational + US1 (reuses the restore path).
- **Polish (P6)** → after the desired stories.

### Key task dependencies

- T003 blocks T007, T008, T015, T019 (all consume the hook; all pass `userId`).
- T007 → T008 (same file; persist before restore wiring). T007 also edits `page.tsx` to supply `userId`, which every later hook call depends on. T008's one-shot ref is reused by T015.
- T009 (tree reveal) edits `file-tree.tsx` — a different file, so it runs independently of the layout tasks; it reuses the existing `revealSelected` (no foundational dep beyond the tree already rendering `selectedNodeId`).
- T013 → T014 → T015 (mount API → editor prop → layout wiring).
- T018 → T019 (notFound signal → layout handling).
- T012 edits T004's E2E file (run after T004).

### Within each story

Tests first (must fail) → implementation → checkpoint.

---

## Parallel Opportunities

- **Phase 2**: T002 (tests) is `[P]` on its own; T003 follows.
- **US1 tests**: T004, T005, T006 run in parallel (E2E spec / layout test / file-tree test — different files).
- **US1 impl**: T009 (`file-tree.tsx`) is `[P]` and runs alongside the layout chain T007 → T008.
- **US2 tests**: T010 and T011 run in parallel (different files); T012 after T004.
- **US3 tests**: T016 and T017 run in parallel (different files).
- **Polish**: T020 and T021 in parallel.
- Implementation tasks touching `project-editor-layout.tsx` (T007, T008, T015, T019) are **not** parallel with each other.

### Parallel example — US1 tests

```bash
Task: "Add Playwright E2E project-file-restore.spec.ts (restore + nested-folder reveal)"  # T004
Task: "Extend project-editor-layout.test.tsx (restore + FR-010 non-blocking)"            # T005
Task: "Extend file-tree.test.tsx (reveal cases R1–R7)"                                    # T006
```

---

## Implementation Strategy

### MVP (User Story 1 only)

1. Phase 1 Setup → 2. Phase 2 Foundational (`useLastSelection`) → 3. Phase 3 US1 (restore + tree reveal) → **STOP & validate**: file restore + reveal works across navigation and reload. Shippable.

### Incremental delivery

- + US2 → cursor-line restore for AsciiDoc (resume exactly where you left off).
- + US3 → robustness for deleted/moved files.
- Each story is independently testable and adds value without breaking the prior one.

### Notes

- `[P]` = different files, no incomplete deps.
- Commit after each green task or logical group; never commit with failing tests (Constitution II).
- Frontend-only: no Prisma/migration tasks; no domain in-memory fakes needed (no domain ports introduced).
