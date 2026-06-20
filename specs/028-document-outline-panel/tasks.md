# Tasks: Document Outline View in Editor Left Panel

**Input**: Design documents from `specs/028-document-outline-panel/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: INCLUDED — Constitution II (TDD) is NON-NEGOTIABLE and the plan mandates red-green for the new hook field, the current-section selector, the rail/tablist, OutlineView, and the level-0 extension, plus e2e for switch + navigate. (No performance tests — opt-in; spec does not request them.)

**Paths**: all relative to `apps/web`. Tests live under `apps/web/tests/` mirroring `src/` (drop `src/`). E2e under `apps/web/e2e/`.

**Scope reuse (from research.md)**: heading data = existing `outlineField`/`useSectionOutline`; list renderer = existing `EditorSectionOutline`; navigation = existing `handleLineClick`/reveal + scroll-sync; preference = existing `useEditorPreferences`. The right-hand `EditorOutlinePanel` is removed (relocated left).

**Terminology**: the user-facing "view" (Files/Outline) is persisted as the `leftPanelTab` preference; the rail is an ARIA tablist, hence "tab" in code — same concept, two names by layer.

---

## Phase 1: Setup

- [x] T001 [P] Create exported stub files `src/components/editor/left-panel.tsx`, `src/components/editor/left-panel-rail.tsx`, and `src/components/editor/outline-view.tsx` (typed placeholder components) plus a `LeftPanelTab = 'files' | 'outline'` type, so later test files can import them. No new dependency is added (lucide-react, shadcn Button, and tokens already exist).

---

## Phase 2: Foundational (blocking prerequisites — MUST complete before user stories)

- [x] T002 [P] Write failing tests in `tests/lib/codemirror/asciidoc-outline.test.ts` asserting the emitted `SectionOutlineEntry[]` includes the document title at `level: 0`, in document order, alongside levels 1–5 (and still excludes `[discrete]`/beyond-max/inactive). (RED)
- [x] T003 Extend `src/lib/codemirror/asciidoc-outline.ts` to emit the level-0 document title — lower the `info.effectiveLevel < 1` skip so level 0 is included; leave discrete/beyondMax/inactive handling unchanged. (GREEN for T002)
- [x] T004 [P] Write failing tests in `tests/hooks/use-editor-preferences.test.ts` and `tests/hooks/use-last-selection-hook.test.tsx`-style hook test asserting: `leftPanelTab` defaults to `'files'`, round-trips through `localStorage`, `setLeftPanelTab` updates it, an invalid stored value falls back to `'files'`, and `leftPanelTab` is NOT included in the `PUT /auth/me/editor-preferences` body nor overwritten by the GET-merge. (RED)
- [x] T005 Add `leftPanelTab: LeftPanelTab` to `EditorPrefs` + `DEFAULT_PREFS`, a `setLeftPanelTab` setter, localStorage load + `isStoredPrefs` validation, and EXCLUDE the field from `schedulePut`'s payload and the GET-merge in `src/hooks/use-editor-preferences.ts`. (GREEN for T004)
- [x] T006 Add optional props `onOutlineChange?(entries: SectionOutlineEntry[])` and `onCursorLineChange?(line: number)` to `src/components/editor/asciidoc-editor.tsx`, forwarding the existing `useEditorMount` `onOutlineChange`/`onCursorChange` callbacks upward without changing existing internal behavior.
- [x] T007 In `src/app/(dashboard)/dashboard/projects/[id]/project-editor-layout.tsx`, hold `outlineEntries` and `currentLine` state fed by the editor's new callbacks, and add `handleOutlineHeadingClick(entry)` that calls the existing `handleLineClick(entry.line)` (reuse scroll-sync; no new sync path).

**Checkpoint**: heading data (incl. title), the preference field, and the editor→layout seam exist — all stories can now build.

---

## Phase 3: User Story 1 — Navigate a document by its outline (Priority: P1) 🎯 MVP

**Goal**: Switch the left panel to Outline, see all headings nested by level in order, and click one to jump the editor (preview follows).

**Independent test**: Open a doc with nested headings, switch to Outline via the rail, confirm every heading (incl. title) is listed and nested, click a deep heading → editor moves there and preview follows; Files is the default view.

- [x] T008 [P] [US1] Write failing tests in `tests/components/editor/outline-view.test.tsx`: rows render in document order, nested by level (0 flush, 1–5 progressively indented); clicking a row calls `onHeadingClick(entry)`; long titles truncate. (RED)
- [x] T009 [US1] Adjust `src/components/editor/editor-section-outline.tsx` indentation so level 0 is flush and levels 1–5 step in (update the `paddingLeft` formula), keeping its existing memoization and not breaking current behavior.
- [x] T010 [US1] Build `src/components/editor/outline-view.tsx`: a header showing the uppercase "OUTLINE" title over a body that reuses `EditorSectionOutline` for the list; wire row click → `onHeadingClick`. (GREEN for T008)
- [x] T011 [P] [US1] Write failing tests in `tests/components/editor/left-panel-rail.test.tsx`: vertical tablist semantics — `role="tablist"`, two `role="tab"` with `aria-selected` and `aria-controls`, up/down roving focus moves the active tab, clicking a tab calls `onTabChange`; each button has an `aria-label`. (RED)
- [x] T012 [US1] Build `src/components/editor/left-panel-rail.tsx`: render from a **data-driven view list** (`{ id, label, icon }[]`) so a third view (search/history) can be added later without redesign (FR-015) — icon-per-view (lucide `FolderTree` for Files, `ListTree` for Outline) stacked top with a flex spacer; active icon = `--primary` tint + 2px `--primary` left accent bar, inactive = `--muted-foreground` + `--accent` hover; icon-only with `aria-label` + native `title` tooltip; `role="tablist"`/`role="tab"`, `aria-selected`, `aria-controls`, roving up/down focus. (GREEN for T011)
- [x] T013 [P] [US1] Write failing tests in `tests/components/editor/left-panel.test.tsx`: renders the rail + a content-column header (uppercase active title) + a body; BOTH `filesSlot` and `outlineSlot` stay mounted with the inactive one `hidden`; toggling `activeTab` flips visibility without unmounting either slot. (RED)
- [x] T014 [US1] Build `src/components/editor/left-panel.tsx`: rail (`<LeftPanelRail>`) + content column (header with uppercase active title; body renders both slots, inactive one `hidden`); props `activeTab`/`onTabChange`/`filesSlot`/`outlineSlot`; body has the `id` the rail's `aria-controls` points at. (GREEN for T013)
- [x] T015 [US1] Wire `<LeftPanel>` into `src/app/(dashboard)/dashboard/projects/[id]/project-editor-layout.tsx`: replace the bare file-tree panel with `<LeftPanel activeTab={leftPanelTab} onTabChange={setLeftPanelTab} filesSlot={<FileTree …/>} outlineSlot={<OutlineView entries={outlineEntries} currentLine={currentLine} hasDocument={Boolean(selectedFile) && isAsciiDocFile(selectedFile.nodeName)} onHeadingClick={handleOutlineHeadingClick} />} />`; `hasDocument` is exactly `Boolean(selectedFile) && isAsciiDocFile(selectedFile.nodeName)` (import `isAsciiDocFile` from `@/components/asciidoc-preview`) so a non-AsciiDoc/binary open file yields the "no document" empty state; keep the existing sidebar resize/collapse; ensure the editor/preview remain siblings outside the panel (no remount).
- [x] T016 [US1] Remove the right-hand outline: delete the `<EditorOutlinePanel>` usage at `src/components/editor/asciidoc-editor.tsx:291` and remove `src/components/editor/editor-outline-panel.tsx` (the outline now lives in the left panel); keep `editor-section-outline.tsx`.
- [x] T017 [US1] Add e2e `e2e/editor-left-panel-outline.spec.ts`: Files is default; switch to Outline via the rail; the outline lists nested headings including the document title; clicking a heading moves the editor to its line and the preview scrolls to follow; **and (FR-007) typing a new section heading in the editor makes a new row appear in the outline without any manual refresh** (live update).

**Checkpoint**: US1 is independently shippable — the MVP outline navigation works.

---

## Phase 4: User Story 2 — See which section I'm in (Priority: P2)

**Goal**: The heading whose section contains the cursor is marked current; exactly one at a time.

**Independent test**: With Outline active, move the cursor across sections and confirm the current row follows, one current at a time.

- [x] T018 [P] [US2] Write failing tests in `tests/lib/editor/current-heading.test.ts` for a pure selector `currentHeadingIndex(entries, line)`: returns the nearest preceding heading (`line ≤ cursor`), `-1` before the first heading, and never more than one. (RED)
- [x] T019 [US2] Implement `src/lib/editor/current-heading.ts` (`currentHeadingIndex`) and apply `aria-current="true"` + the primary-tinted active style (left accent bar) to the matching row in `src/components/editor/editor-section-outline.tsx`, driven by a `currentLine` prop threaded through `OutlineView`. (GREEN for T018)
- [x] T020 [US2] Extend `e2e/editor-left-panel-outline.spec.ts`: moving the cursor between sections updates the highlighted current row (exactly one).

---

## Phase 5: User Story 3 — My view choice is remembered (Priority: P2)

**Goal (verification increment)**: The persistence mechanism is delivered by Foundational (T004/T005, the `leftPanelTab` field) and wired in US1 (T015 reads/writes it via `useEditorPreferences`). This story verifies the end-to-end guarantee — persists across reloads, per user, not across devices — and adds the reload e2e.

**Independent test**: Switch to Outline, reload, confirm Outline is still active; confirm the value is not sent to the account API.

- [x] T021 [US3] Verify `project-editor-layout.tsx` sources the active view from `useEditorPreferences` `leftPanelTab`/`setLeftPanelTab` (not a local `useState`) — adjust if T015 used local state — so the choice persists; re-confirm the not-synced behavior from T004/T005.
- [x] T022 [US3] Extend `e2e/editor-left-panel-outline.spec.ts`: select Outline, reload the page, assert Outline is still the active view (and Files remains the first-load default in a fresh browser context).

---

## Phase 6: User Story 4 — Graceful empty states (Priority: P3)

**Goal**: Friendly messages instead of a blank Outline.

**Independent test**: Activate Outline with no document open, then with a heading-less document — each shows its message.

- [x] T023 [P] [US4] Write failing tests in `tests/components/editor/outline-view.test.tsx`: `hasDocument=false` → exactly "Open a document to see its outline."; `hasDocument=true` with zero entries → exactly "No headings yet — add a section title (=, ==, …)." (RED)
- [x] T024 [US4] Implement both empty states in `src/components/editor/outline-view.tsx` with the exact copy, driven by the `hasDocument` prop (false → "Open a document…"; true + zero entries → "No headings yet…"). The non-AsciiDoc/binary "no document" case is produced by the `hasDocument` definition in T015 (`Boolean(selectedFile) && isAsciiDocFile(selectedFile.nodeName)`). (GREEN for T023)
- [x] T025 [US4] Extend `e2e/editor-left-panel-outline.spec.ts`: no document open → first message; open a heading-less `.adoc` → second message.

---

## Phase 7: User Story 5 — File actions stay with the Files view (Priority: P3)

**Goal**: The "+" new-file and options (⋯) controls show only while Files is active.

**Independent test**: Files active → controls present; Outline active → controls absent; switch back → present.

- [x] T026 [P] [US5] Write failing tests in `tests/components/editor/left-panel.test.tsx`: the content-column header renders the "+" and options (⋯) controls only when `activeTab === 'files'`, and shows the "OUTLINE" title alone otherwise. (RED)
- [x] T027 [US5] Move the file "+"/options (⋯) controls into the content-column header (sourced from the existing `file-tree-actions.tsx`) and gate them to `activeTab === 'files'`; for Outline render the title alone (optionally a single Collapse/Expand-all toggle). Update `left-panel.tsx` / the layout wiring accordingly. (GREEN for T026)
- [x] T028 [US5] Extend `e2e/editor-left-panel-outline.spec.ts`: file actions visible on Files, absent on Outline.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [x] T029 [P] Verify the rail, header, active/hover states, and OutlineView render correctly in BOTH light and dark mode using only tokens (`--primary`, `--muted-foreground`, `--accent`, `--border`, `--popover`) — no color literals (Constitution V).
- [x] T030 [P] Regression (Constitution VIII): add/confirm a test proving editor↔preview scroll-sync behavior is unchanged after the seam lift (e.g. `tests/lib/codemirror/` or the editor mount test), and confirm NO sanitizer file was modified (sanitization untouched).
- [x] T031 [P] Confirm switching views does not remount the editor or preview (assert a stable component instance / no re-initialization) via the e2e or a layout test.
- [x] T032 Run the web gates and fix any issues: `pnpm --filter @asciidocollab/web lint`, `… typecheck`, `npx jest` (affected suites), and `npx fresh-onion` from repo root — all green.

---

## Dependencies & Execution Order

- **Setup (T001)** → **Foundational (T002–T007)** block everything.
- **US1 (T008–T017)** depends only on Foundational → the MVP.
- **US2 (T018–T020)**, **US3 (T021–T022)**, **US4 (T023–T025)**, **US5 (T026–T028)** each depend on US1's shell/OutlineView but are independent of one another and can proceed in any order / in parallel by different developers.
- **Polish (T029–T032)** runs after the stories it verifies.
- Within a story, the `[test]` task precedes its implementation (red→green). Tasks touching the same file (`project-editor-layout.tsx`, `asciidoc-editor.tsx`, `left-panel.tsx`, `editor-section-outline.tsx`) are sequential; tasks in different files marked `[P]` may run in parallel.

## Parallel Execution Examples

- **Foundational**: T002 (outline test) ∥ T004 (prefs test) — different files. Then T003, T005, T006 proceed.
- **US1 red phase**: T008 ∥ T011 ∥ T013 — three independent test files authored together, then their GREEN tasks (T009/T010, T012, T014) follow.
- **Across stories** (after US1): T018 (US2 selector test) ∥ T023 (US4 empty-state test) ∥ T026 (US5 header test).

## Implementation Strategy

- **MVP = Phase 1 + 2 + US1 (T001–T017)**: a working two-view left panel with outline navigation and the right-hand panel removed. Shippable on its own.
- **Incremental**: layer US2 (current-section), US3 (persistence), US4 (empty states), US5 (gated file actions), each an independent, testable increment, then Polish.

## Total: 32 tasks

| Phase | Tasks | Count |
|---|---|---|
| Setup | T001 | 1 |
| Foundational | T002–T007 | 6 |
| US1 (P1, MVP) | T008–T017 | 10 |
| US2 (P2) | T018–T020 | 3 |
| US3 (P2) | T021–T022 | 2 |
| US4 (P3) | T023–T025 | 3 |
| US5 (P3) | T026–T028 | 3 |
| Polish | T029–T032 | 4 |
