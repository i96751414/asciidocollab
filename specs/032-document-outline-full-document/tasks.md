---
description: "Task list for feature 032 — Full-Document Outline Across Includes"
---

# Tasks: Full-Document Outline Across Includes

**Input**: Design documents from `/specs/032-document-outline-full-document/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: REQUIRED. The constitution mandates functional TDD (red-green-refactor, NON-NEGOTIABLE), so every unit has a failing test first. **Performance/load/benchmark tests are OPT-IN and excluded** — the spec did not explicitly request them; latency SCs (SC-003/007/009/011) are validated via the multi-user e2e behavioral checks, not benchmarks (Constitution II).

**Organization**: Grouped by user story. Path convention (`apps/web`): source `apps/web/src/...`, tests mirror under `apps/web/tests/...` (drop `src/`). Never co-locate tests.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on incomplete tasks)
- **[Story]**: US1–US5 (user-story phases only)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Module scaffolding for the two new pure modules.

- [X] T001 [P] Create the outline module folder and barrel at `apps/web/src/lib/outline/index.ts` (re-exports `assemble-outline` and `outline-presence` once they exist), per plan Project Structure.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Provenance-tagged assembly + scope-aware outline hook that ALL stories build on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T002 [P] Write failing tests for `assembleIncludes` source map in `apps/web/tests/workers/assemble-includes.test.ts`: (a) **regression** — with no `withSourceMap`, `content`/`unresolved` are byte-for-byte identical to existing fixtures; (b) with `withSourceMap`, `sourceMap.lineToSource.length === assembled line count` and each entry resolves to the correct `{ fileId, path, sourceLine }` (incl. nested includes, leveloffset, partial `tags=`/`lines=`, and placeholder lines when `showIncludes=false`). (contracts/outline-assembly.md)
- [X] T003 Implement the additive `withSourceMap` option + `IncludeSourceMap` output in `apps/web/src/workers/assemble-includes.ts`, leaving existing output unchanged when the flag is off (depends on T002). Honors FR-002/FR-009/FR-015/FR-016, Principle VIII.
- [X] T004 [P] Extend `SectionOutlineEntry` with provenance fields (`sourceFileId`, `sourcePath`, `sourceLine`, `isOpenFile`) in `apps/web/src/lib/codemirror/asciidoc-outline.ts` (data-model §1); keep them optional so the existing single-file path compiles unchanged.
- [X] T005 [P] Write failing tests for `assembleOutline` in `apps/web/tests/lib/outline/assemble-outline.test.ts` using an in-memory `readFile` fake: full vs current scope; effective-scope fallbacks (no main document → current; main doc set but open file unreachable → current; data-model §2); provenance + effective levels correct; inactive-conditional/discrete/float excluded; `unresolved` passed through (FR-014); cycle-safe termination.
- [X] T006 Implement `assembleOutline()` in `apps/web/src/lib/outline/assemble-outline.ts` (reuse `assembleIncludes` + unchanged `extractHeadings`/`computeHeadingLevels`; attach provenance from the source map) (depends on T003, T004, T005). Covers FR-001/002/006/009/010/014/016.
- [X] T007 Write failing tests for the scope-aware outline hook in `apps/web/tests/hooks/use-section-outline.test.tsx` (fake CM6 view + fake symbol-index seam): returns current-file entries for `current`/fallback; returns assembled entries for `full`; recomputes on open-file edit, main-document change, and attribute/scope change (FR-013).
- [X] T008 Refactor `apps/web/src/hooks/use-section-outline.ts` to accept `scopePreference` + symbol-index inputs and return `{ entries, effectiveScope, unresolved }` (depends on T006, T007). Current-file path stays behaviorally identical.

**Checkpoint**: Assembly + scope hook ready and unit-tested — user stories can begin.

---

## Phase 3: User Story 1 — Navigate the whole document from one outline (Priority: P1) 🎯 MVP

**Goal**: With a main document configured, the outline shows the entire assembled heading hierarchy (seamless, open file's entries marked) regardless of which file is open, and selecting any entry navigates to its source file/heading.

**Independent Test**: Configure a main document including 2+ child files with headings; open any file; confirm the outline lists all files' headings in order as one seamless list with the open file marked, and clicking a foreign-file heading opens that file at the heading.

- [X] T009 [P] [US1] Write failing tests for `EditorSectionOutline` in `apps/web/tests/components/editor/editor-section-outline.test.tsx`: renders provenance entries as one seamless list (no per-file dividers, FR-017); marks `isOpenFile` entries (FR-018); click invokes `onHeadingClick(entry)` carrying provenance.
- [X] T010 [P] [US1] Write failing tests for `OutlineView` full-document mode in `apps/web/tests/components/editor/outline-view.test.tsx`: shows assembled entries when effective scope is `full`; marks the current section among open-file entries (FR-011); empty state when no headings.
- [X] T011 [US1] Implement seamless rendering + open-file mark + provenance-carrying click in `apps/web/src/components/editor/editor-section-outline.tsx` (depends on T009).
- [X] T012 [US1] Implement full-document wiring (consume `useSectionOutline` full scope), current-section indexing over open-file entries, and empty state in `apps/web/src/components/editor/outline-view.tsx` (depends on T010, T008).
- [X] T013 [US1] Route outline selection by provenance in the project editor layout (`apps/web/src/app/(dashboard)/dashboard/projects/[id]/project-editor-layout.tsx`) reusing `apps/web/src/hooks/use-editor-navigation.ts`: same file → `revealLine(entry.sourceLine)` (FR-008); other file → set `pendingXrefLine` + `handleNavigateToFile(entry.sourcePath)` (FR-007) (depends on T011, T012).
- [X] T014 [US1] Extend e2e in `apps/web/e2e/editor-left-panel-outline.spec.ts`: main doc + includes → outline shows full hierarchy from any open file; clicking a foreign-file heading opens that file at the heading (SC-001/002/005).

**Checkpoint**: MVP — full-document navigation works end to end.

---

## Phase 4: User Story 4 — Outline reflects collaborators' live edits across files (Priority: P1)

**Goal**: Heading edits a collaborator makes in an included file (active session) appear in another author's full-document outline within ~2 s, no save/reopen.

**Independent Test**: Two sessions on a main doc + includes; edit a heading in an included file in session A; session B's outline reflects it within ~2 s without save.

- [X] T015 [P] [US4] Write failing tests for reachable-doc change observation in `apps/web/tests/hooks/use-project-symbol-index.test.tsx` (fake provider seam): a change in a reachable, non-open file invalidates its cached content and emits a change signal; observers are scoped to reachable files and torn down on main-doc/scope change (no leak); dedupes with the already-open doc.
- [X] T016 [US4] Implement lazy live observers over reachable docs + cache invalidation + change signal in `apps/web/src/hooks/use-project-symbol-index.ts`, reusing the existing `createProvider` seam (depends on T015). Confirms FR-013a live+fallback already holds (assert via test).
- [X] T017 [P] [US4] Write failing test in `apps/web/tests/hooks/use-section-outline.test.tsx` for debounced recompute when a reachable-doc change signal fires (FR-013b).
- [X] T018 [US4] Wire debounced (~300–500 ms) recompute on the reachable-doc change signal into `apps/web/src/hooks/use-section-outline.ts` (depends on T016, T017).
- [X] T019 [US4] Add 2-user e2e in `apps/web/e2e/editor-left-panel-outline.spec.ts`: heading edit in an included file in context A appears in context B's outline within ~2 s with no save (SC-007); a file with no active session shows last-saved headings (SC-008).

**Checkpoint**: Full-document outline is live across files.

---

## Phase 5: User Story 2 — Narrow the outline to the open file (Priority: P2)

**Goal**: A persisted per-user toggle switches the outline between full document and current file only.

**Independent Test**: With a multi-file doc, toggle "current file only" → only open file's headings; toggle off → full; reload → choice persists.

- [X] T020 [P] [US2] Write failing tests for the `outlineScope` preference in `apps/web/tests/hooks/use-editor-preferences.test.tsx`: default `'full'`; persists to localStorage; listed in `CLIENT_ONLY_KEYS` so it is stripped from the account PUT and kept on fetch-merge (Principle VII).
- [X] T021 [US2] Add client-only `outlineScope: 'full' | 'current'` + `setOutlineScope` to `apps/web/src/hooks/use-editor-preferences.ts` (extend `CLIENT_ONLY_KEYS`, `EditorPrefs`, defaults, loader, fetch-merge) (depends on T020). FR-012.
- [X] T022 [P] [US2] Write failing tests for the scope toggle in `apps/web/tests/components/editor/outline-view.test.tsx`: toggle reflects/sets `outlineScope`; switching updates rendered entries (FR-003/004).
- [X] T023 [US2] Implement the scope toggle control in `apps/web/src/components/editor/outline-view.tsx`, bound to `outlineScope` and passed as `scopePreference` to `useSectionOutline` (depends on T021, T022).
- [X] T024 [US2] Add e2e in `apps/web/e2e/editor-left-panel-outline.spec.ts`: toggle narrows to current file and back; choice persists across reload (US2 scenarios, FR-012).

**Checkpoint**: Scope is user-controllable and persisted.

---

## Phase 6: User Story 3 — Standalone file with no main document (Priority: P2)

**Goal**: With no main document (or an unreachable open file), the outline shows only the open file's headings and the full-document option is unavailable/no-op.

**Independent Test**: Open a file in a project with no main document → outline shows only that file's headings; the scope toggle is hidden/disabled.

- [X] T025 [P] [US3] Write failing tests in `apps/web/tests/components/editor/outline-view.test.tsx`: when effective scope is forced to `current` (no main doc, or open file unreachable), only open-file headings render and the scope toggle is hidden/disabled (FR-005/006). (Fallback logic itself is already covered in T005.)
- [X] T026 [US3] Implement the no-main-doc / unreachable gating in `apps/web/src/components/editor/outline-view.tsx` — force current-file outline and hide/disable the toggle when `rootFilePath` is null or the open file is unreachable (depends on T025; independent of the US2 toggle’s presence).
- [X] T027 [US3] Add e2e in `apps/web/e2e/editor-left-panel-outline.spec.ts`: project with no main document shows only the open file’s headings with no full-document option (SC-004).

**Checkpoint**: Graceful fallback verified.

---

## Phase 7: User Story 5 — See where collaborators are working in the outline (Priority: P2)

**Goal**: Section/cursor-level collaborator presence markers on outline headings, in both scopes, mirroring the file tree.

**Independent Test**: Two accounts; place B's cursor in a section; A sees a presence marker on that heading identifying B (both scopes); marker follows B's cursor and clears when B leaves.

- [X] T028 [P] [US5] Write failing tests for `mapOutlinePresence` in `apps/web/tests/lib/outline/outline-presence.test.ts`: nearest-preceding-heading attribution; clamp/skip out-of-range or null `cursorLine` (Principle IX, FR-024); per-user dedup; multiple peers on one entry; cursor above first heading → skipped.
- [X] T029 [US5] Implement `mapOutlinePresence()` in `apps/web/src/lib/outline/outline-presence.ts` (depends on T028, T004).
- [X] T030 [P] [US5] Write failing tests in `apps/web/tests/hooks/use-project-presence.test.tsx`: local client publishes `cursorLine` on section change (debounced); aggregation surfaces peers' `{ openFileNodeId, cursorLine }`, excludes self, dedupes tabs; older client without `cursorLine` still aggregates (file-level, no crash) (contracts/presence-awareness.md).
- [X] T031 [US5] Add `cursorLine` publish + aggregation to `apps/web/src/hooks/use-project-presence.ts` (extend `PresenceState`, `setLocalStateField`, `collectByFile`) (depends on T030). FR-019/020/023.
- [X] T032 [P] [US5] Write failing tests in `apps/web/tests/components/editor/editor-section-outline.test.tsx`: an entry with presence renders the reused `OpenByOthersMarker` (avatars, `+N` overflow, hover names); entries without presence render none (FR-021).
- [X] T033 [US5] Render presence via the reused `OpenByOthersMarker` in `apps/web/src/components/editor/editor-section-outline.tsx` keyed by `${sourceFileId}:${sourceLine}`, and wire the `OutlinePresence` map (from `useProjectPresence` → `mapOutlinePresence`) through `apps/web/src/components/editor/outline-view.tsx` for both scopes (depends on T029, T031, T032, T011). FR-022.
- [X] T034 [US5] Add 2-user e2e in `apps/web/e2e/editor-left-panel-outline.spec.ts` (patterns from `apps/web/e2e/collab-awareness.spec.ts`): presence marker appears on B's section, moves on cursor move, clears on disconnect; reflects others only (SC-010/011, US5).

**Checkpoint**: Presence works end to end across both scopes.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [X] T035 [P] Accessibility pass: open-file mark, current-section, and presence marker are not conveyed by color alone (reuse `aria-current`, marker label/`tabIndex`) — assert in component tests under `apps/web/tests/components/editor/`.
- [X] T036 [P] Regression guard (Principle VIII): a test in `apps/web/tests/workers/assemble-includes.test.ts` (or a focused preview test) proving the assembled-content output and the preview sanitization/scroll-sync seam are unaffected by the source-map change.
- [ ] T037 Run the `quickstart.md` manual verification checklist against a live two-browser session and record results.
- [X] T038 [P] `pnpm --filter web lint` and `pnpm --filter web typecheck` clean for all touched files (Quality Gates).
- [X] T039 [P] Update code comments/docstrings on the new `lib/outline/` modules and the extended `assemble-includes`/`use-project-presence` to explain the provenance + `cursorLine` additions.

---

## Dependencies & Execution Order

### Phase order
- **Setup (P1)** → **Foundational (P2)** blocks everything → **User stories** → **Polish**.
- User-story phase order respects priority + dependency: **US1 (P1)** → **US4 (P1, builds on US1)** → **US2 (P2)** → **US3 (P2)** → **US5 (P2)**.

### Key cross-task dependencies
- T003 ⟵ T002; T006 ⟵ T003,T004,T005; T008 ⟵ T006,T007 (Foundational chain).
- US1: T011⟵T009; T012⟵T010,T008; T013⟵T011,T012; T014⟵T013.
- US4: T016⟵T015; T018⟵T016,T017; depends on US1/Foundational assembly.
- US2: T021⟵T020; T023⟵T021,T022.
- US3: T026⟵T025 (fallback logic already in T006).
- US5: T029⟵T028,T004; T031⟵T030; T033⟵T029,T031,T032,T011.

### Story independence
- US1 is the MVP and stands alone. US2, US3, US5 are independently testable on top of Foundational+US1. US4 layers live freshness onto US1's assembled outline. No user story breaks another.

---

## Parallel Opportunities

- **Foundational**: T002, T004, T005 can run in parallel (different files); T007 parallel with T004 once interfaces are agreed.
- **Within a story**, the `[P]` test tasks run together before their implementation:
  - US1: T009 + T010 in parallel, then T011/T012.
  - US5: T028 + T030 + T032 in parallel, then T029/T031/T033.
- **Across stories** (after Foundational), separate developers can take US2, US3, US5 concurrently; US4 pairs with whoever owns US1.

### Parallel example — User Story 5
```bash
# Failing tests first, together:
Task: "mapOutlinePresence tests in apps/web/tests/lib/outline/outline-presence.test.ts"   # T028
Task: "use-project-presence cursorLine tests in apps/web/tests/hooks/use-project-presence.test.tsx"  # T030
Task: "EditorSectionOutline presence-marker tests in apps/web/tests/components/editor/editor-section-outline.test.tsx"  # T032
```

---

## Implementation Strategy

### MVP first
1. Phase 1 Setup → Phase 2 Foundational (critical).
2. Phase 3 US1 → **STOP and validate**: full-document outline + cross-file navigation working (SC-001/002/005). Demo-able MVP.

### Incremental delivery
3. US4 → live cross-file freshness (SC-007/008).
4. US2 → scope toggle + persistence.
5. US3 → no-main-doc fallback.
6. US5 → collaborator presence in the outline.
7. Polish.

### Notes
- Red-green-refactor on every implementation task; commit only on green (Constitution II).
- `[P]` = different files, no incomplete-task dependency.
- Do not fork the sanitizer or change `assembleIncludes` output when the source-map flag is off (Principle VIII; T036 guards this).
- Clamp untrusted peer `cursorLine` before mapping (Principle IX; T028/T029).
- Performance/benchmark tests intentionally omitted (opt-in; Constitution II) — latency SCs covered by e2e behavior (T014/T019/T034).
