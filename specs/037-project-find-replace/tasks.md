---

description: "Task list for Project-Wide Find and Replace Panel"
---

# Tasks: Project-Wide Find and Replace Panel

**Input**: Design documents from `/specs/037-project-find-replace/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Implementation**: Every task MUST be executed via the `/tdd` skill (Constitution §Implementation Discipline). Tasks describe WHAT to implement; the skill owns the red-green-refactor cycle. DO NOT split a deliverable into separate "write test" and "write implementation" tasks — one deliverable = one task = one `/tdd` invocation. (Exceptions: explicitly non-functional tasks — a dependency add, a config-only change — noted inline.)

**Organization**: Grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1 = project-wide search (P1), US2 = project-wide replace (P2), US3 = consistent styling (P3)
- Exact source paths included; tests live under each package's `tests/` root (created by `/tdd`), never co-located.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Dependencies and configuration the feature needs before any logic.

- [X] T001 Add the `re2` linear-time regex engine as a runtime dependency of `packages/infrastructure` and `apps/collab` (update each `package.json` + root `pnpm-lock.yaml`). Non-functional (dependency add) — no `/tdd`. Verify `pnpm install` and `pnpm build` succeed.
- [X] T002 [P] Add the `project.search` config block (rate limits, `maxMatchesReturned`, `maxPatternLength`, `perFileTimeBudgetMs`, `maxFileBytes`) to `apps/api/src/config/schema-project.ts` and `apps/api/config/default.yaml`, each bound to an `ASCIIDOCOLLAB_PROJECT_SEARCH_*` env var with documented defaults (mirrors the `refactoring` block). Validated via config-load tests.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The shared matching platform used by BOTH search (US1) and replace (US2). No user-story work starts until this is complete.

**⚠️ CRITICAL**: Blocks US1 and US2.

- [X] T003 Define the `RegexEngine` port (`compile(pattern, flags) → Result<CompiledMatcher, ValidationError>`; matcher yields bounded `MatchSpan[]`) in `packages/domain/src/ports/text/regex-engine.ts` — a new `ports/text/` service-port group, NOT `ports/storage/` — with an in-memory fake under `packages/domain/tests/ports/text/`.
- [X] T004 [P] Implement the RE2-backed `Re2RegexEngine` adapter (linear-time; invalid pattern → `ValidationError`; per-file match budget honored) in `packages/infrastructure/src/services/re2-regex-engine.ts`. Integration test asserts a known catastrophic-backtracking pattern stays bounded (SC-008) and invalid patterns are rejected (FR-006a/FR-006b).
- [X] T005 [P] Implement the pure `text-match.ts` helper — `computeMatches` (literal + case + whole-word, or regex via injected engine, under a budget), `substitute` (literal or capture-group template `$1`/`${name}`/`$$`, rejecting absent groups — FR-006d), and `selectSpans` (filter to `{ordinal, expectedText}`, skip stale, produce right-to-left edits) — in `packages/domain/src/use-cases/content/text-match.ts`.
- [X] T006 Wire `Re2RegexEngine` into the composition roots — `apps/api/src/di/stores.ts` (as `request.server.stores.regexEngine`) and the `apps/collab` composition — so both the search scan and the collab apply share one engine. Verified by DI/boot tests.

**Checkpoint**: Matching platform ready — US1 and US2 can begin.

---

## Phase 3: User Story 1 — Project-wide search (Priority: P1) 🎯 MVP

**Goal**: A Search tab in the left panel that finds a term/pattern across every text-decodable file and navigates to each match.

**Independent Test**: Enter a term present in several files (including one not open anywhere); results appear grouped by file with true-total + per-file counts; clicking a result opens the file with the cursor on the match. Regex + case + whole-word toggles work; invalid regex shows an inline error; no-results state is explicit.

- [X] T007 [P] [US1] Define the **HTTP-boundary** search DTOs (`SearchMode`, `SearchQueryDto`, `SearchMatchDto`, `FileMatchGroupDto`, `SearchResultDto`) in `packages/shared/src/dtos/project-search.dto.ts`. These are wire shapes only — never imported by `packages/domain`; the search route maps them to/from the domain types defined in T009.
- [X] T008 [P] [US1] Implement the `isSearchableTextFile` text-decodability predicate (content sniff; excludes binary/attachments; extension-independent — FR-003b) in `packages/domain/src/value-objects/files/searchable-text-file.ts`.
- [X] T009 [US1] Implement `SearchProjectContentUseCase` and its **domain-owned types** (`SearchQuery`, `SearchMatch`, `FileMatchGroup`, `SearchResult` — defined in this file, no `@asciidocollab/shared` import) in `packages/domain/src/use-cases/content/search-project-content.ts`: RBAC (project membership); scan every searchable file via the existing live-aware `resolveFileContent`/`liveContentDeps`; match with `text-match` under `perFileTimeBudgetMs`; accumulate true total, cap returned at `maxMatchesReturned`, report `capped`/`skippedFiles`. Use in-memory fakes for member/file-node/file-store/document/live-reader/regex-engine (FR-003, FR-004, FR-007, FR-016).
- [X] T010 [US1] Implement `POST /projects/:projectId/search` (Fastify schema validation; `config.project.search` read rate limit; 200/400 `INVALID_PATTERN`/403/429; **maps `SearchQueryDto` → domain `SearchQuery` and domain `SearchResult` → `SearchResultDto`**, mirroring `refactoring.ts`; delegates to the use case) in `apps/api/src/routes/projects/search.ts`. Contract: `contracts/search-project-content.md`.
- [ ] T011 [P] [US1] Implement the `searchProjectContent` client (typed fetch to the search route) in `apps/web/src/lib/api/project-search.ts`.
- [ ] T012 [US1] Extend the left-panel tab system to include `'search'`: add to `LeftPanelTab` + `isLeftPanelTab` + persisted-value validation in `apps/web/src/hooks/use-editor-preferences.ts` (client-only, per SC-007/Principle VII), append `{ id: 'search', label: 'Search', icon: Search }` to `VIEWS` in `apps/web/src/components/editor/left-panel-rail.tsx`, and add an always-mounted `searchSlot` to `apps/web/src/components/editor/left-panel.tsx` (FR-001, FR-002).
- [ ] T013 [US1] Implement `use-project-search` hook (query state, debounce, `AbortController` cancellation, grouped results, capped-total display) in `apps/web/src/hooks/use-project-search.ts` (FR-006c, FR-015, FR-016).
- [ ] T014 [US1] Implement the `SearchView` component (search input + case/whole-word/regex toggles, grouped results with counts, idle/loading/no-results/inline-regex-error states, activate-result → open file + place cursor; **whole-project scope only — no scope selector**, single-file find stays in the in-editor panel per FR-003a) in `apps/web/src/components/editor/search-view.tsx`, styled from design tokens (light/dark), and wire `searchSlot` + result-navigation in `apps/web/src/components/editor/project-editor-layout.tsx` (FR-003a, FR-004, FR-005, FR-015).

**Checkpoint**: Project-wide search is fully usable and independently testable (MVP).

---

## Phase 4: User Story 2 — Project-wide replace (Priority: P2)

**Goal**: Reviewed replacement of selected/all matches across the project, writing correctly to files whether or not a Yjs session is open, merging with concurrent edits, and audit-logged.

**Independent Test**: Search a term in an open file and a dormant (never-opened) file; exclude one match; replace all with scope confirmation; re-search shows zero remaining included matches while the excluded one stays; the open file updates live; the dormant file is persisted; an audit entry is recorded; per-file editor undo reverts a change.

- [ ] T015 [P] [US2] Define the **HTTP-boundary** replace DTOs (`ReplaceScope`, `FileReplaceSelectionDto`, `ReplaceRequestDto`, `ReplaceResultDto`) in `packages/shared/src/dtos/project-replace.dto.ts`. Wire shapes only — never imported by `packages/domain`; the replace route maps them to/from the domain types in T020.
- [ ] T016 [P] [US2] Add the `AUDIT_PROJECT_CONTENT_REPLACED = 'project.content_replaced'` constant to `packages/domain/src/audit-actions.ts`. Non-functional (constant add) — no `/tdd`.
- [ ] T017 [US2] Define the `StructuredCollaborativeEditor` port (`applyStructuredReplacement(projectId, yjsStateId, spec) → Result<number, Error>`; `spec.query` is the **domain `SearchQuery`**, not a DTO; `0` ⇒ live diverged) in `packages/domain/src/ports/storage/structured-collaborative-editor.ts` (a content-mutation contract → stays under `ports/storage/`), with an in-memory fake (string-map semantics incl. stale-skip) under `packages/domain/tests/ports/storage/`.
- [ ] T018 [US2] Implement `applyStructuredReplacementToDocument` (open a direct connection; in one Yjs transaction re-match live `Y.Text` via `text-match`/RE2, rewrite only confirmed spans whose live text equals `expectedText`, skip stale; disconnect forces writeback) in `apps/collab/src/apply-edits.ts`, and expose `POST /internal/collab/apply-structured-replacement` (reusing the internal server's secret/mTLS/body-cap protections) in `apps/collab/src/internal-edit-server.ts` (FR-010, FR-011, FR-017). Contract: `contracts/internal-collab-structured-apply.md`.
- [ ] T019 [US2] Implement `HttpStructuredCollaborativeEditor` (POST to the internal endpoint via the existing mTLS-aware fetch) in `packages/infrastructure/src/services/http-structured-collaborative-editor.ts` and wire it into `apps/api/src/di/stores.ts` as `request.server.stores.structuredCollaborativeEditor`.
- [ ] T020 [US2] Implement `ReplaceProjectContentUseCase` and its **domain-owned types** (`FileReplaceSelection`, `ReplaceOutcome` — defined in this file, no `@asciidocollab/shared` import) in `packages/domain/src/use-cases/content/replace-project-content.ts`: RBAC (editor/owner, denial audit-logged); validate replacement template in regex mode; per file bounded by `scope`, apply via `StructuredCollaborativeEditor`, fall back to `fileStore.write` only for documents with no record; aggregate counts + `skipped` reasons; record `AUDIT_PROJECT_CONTENT_REPLACED`. Use in-memory fakes (FR-008, FR-008a, FR-010–FR-013, FR-017). Contract: `contracts/replace-project-content.md`.
- [ ] T021 [US2] Implement `POST /projects/:projectId/replace` (Fastify schema validation; `config.project.search` replace rate limit; 200/400 `INVALID_PATTERN`/`INVALID_REPLACEMENT`/403/429; **maps `ReplaceRequestDto` → domain input and domain `ReplaceOutcome` → `ReplaceResultDto`**) in `apps/api/src/routes/projects/search.ts`.
- [ ] T022 [P] [US2] Extend the client with `replaceProjectContent` in `apps/web/src/lib/api/project-search.ts`.
- [ ] T023 [US2] Add replace UX to `SearchView`/`use-project-search`: replacement input, per-match include/exclude with before/after preview (FR-008a), replace-this/replace-file/replace-all, project-wide scope confirmation showing match+file counts (FR-009), build the selection (`{ordinal, expectedText}`) request, and refresh results after apply — in `apps/web/src/components/editor/search-view.tsx` and `apps/web/src/hooks/use-project-search.ts`.

**Checkpoint**: Search + replace both work independently; open-session and dormant-file paths verified.

---

## Phase 5: User Story 3 — Consistent, integrated styling (Priority: P3)

**Goal**: The in-editor find/replace matches the design system, and the Search tab is visually indistinguishable in framing from Files/Outline.

**Independent Test**: Open the in-editor find/replace — inputs/buttons/toggles match the design system in light and dark; switching Files ↔ Outline ↔ Search shows identical tab framing; collapse/restore/remember behaves identically.

- [ ] T024 [P] [US3] Implement a design-token CodeMirror theme for the search panel (`.cm-search`/`.cm-panel` inputs, buttons, toggles; light/dark) in `apps/web/src/lib/codemirror/search-panel-theme.ts`, and attach it in `apps/web/src/lib/codemirror/editor-extensions.ts` while keeping `search({ top: true })` + `searchKeymap` behavior unchanged (FR-014; must not touch the scroll-sync seam — Principle VIII).
- [ ] T025 [US3] Audit and align the Search tab framing with Files/Outline (rail icon treatment, active-accent bar, header, spacing, collapse/restore) and confirm all `SearchView` colors derive from design tokens in both themes, in `apps/web/src/components/editor/search-view.tsx` / `left-panel-rail.tsx` (FR-001, SC-006).

**Checkpoint**: All three stories independently functional and visually consistent.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Cross-story verification and the mandated end-of-feature gate.

- [ ] T026 [P] Two-client Playwright E2E: project-wide search (open + dormant files), replace on an **open session** (live merge) and a **dormant file** (persisted), regex capture-group substitution, per-match exclude, audit entry, and **per-file undo** (open an affected file, undo, verify the replacement reverts; confirm there is no cross-file bulk-undo affordance — FR-018) — under `apps/web/tests/` (per quickstart.md; covers SC-001/003/004/005, FR-010/011/018).
- [ ] T027 [P] E2E/UX verification of the regex safety + limits surface: invalid-pattern inline error, known ReDoS pattern stays bounded and non-blocking (SC-008), capped-total "refine" affordance, and `skippedFiles` surfaced — under `apps/web/tests/`.
- [ ] T028 [P] E2E for the in-editor restyle + scroll-sync no-regression, and Search-tab remembered-across-reload (FR-002/SC-007, Principle VIII) — under `apps/web/tests/`.
- [ ] T029 Run `pnpm gate` (lint, typecheck, unit + integration + security scan + e2e across every touched package) and execute `/code-review` in a loop until zero findings (Constitution §End-of-Feature Verification). Run `quickstart.md` end-to-end.

---

## Dependencies & Execution Order

### Phase dependencies
- **Setup (P1)**: no dependencies.
- **Foundational (P2)**: depends on Setup; **blocks US1 and US2**.
- **US1 (P3)**: depends on Foundational. MVP.
- **US2 (P4)**: depends on Foundational. Reuses US1's `SearchView`/client/hook (T023/T022 extend them) but is independently testable.
- **US3 (P5)**: depends on Foundational; the in-editor restyle (T024) is fully independent; the tab-framing check (T025) references US1's tab.
- **Polish (P6)**: depends on the stories it verifies.

### Key task dependencies
- T003 → T004, T005 (port before adapter/helper). T005 uses T003.
- T009 needs T005, T007, T008. T010 needs T009. T013/T014 need T007/T011/T012.
- T018/T020 need T005, T017. T019 needs T017. T020 needs T015, T016, T019. T021 needs T020. T023 needs T015/T022 and US1's T014.
- T025 needs T012/T014 (tab exists).

### Parallel opportunities
- Setup: T002 [P].
- Foundational: after T003, T004 and T005 run in parallel [P].
- US1: T007, T008, T011 [P]; then T009 → T010; T012/T013/T014 (T012 [P] with T007/T008/T011).
- US2: T015, T016, T022 [P]; T017 → T018/T019/T020.
- US3: T024 [P] with everything after Foundational.
- Polish: T026, T027, T028 [P]; then T029.

---

## Implementation Strategy

### MVP first (US1)
1. Phase 1 Setup → Phase 2 Foundational → Phase 3 US1.
2. **STOP and VALIDATE**: project-wide search + navigation works end-to-end. Demo.

### Incremental delivery
1. Setup + Foundational → matching platform ready.
2. US1 → project-wide search (MVP).
3. US2 → reviewed project-wide replace (open + dormant paths).
4. US3 → visual consistency (in-editor restyle + tab framing).
5. Polish → E2E sweep + `pnpm gate` + `/code-review` loop.

---

## Notes
- Each task = one `/tdd` invocation (test-first), except the two inline non-functional tasks (T001 dependency add, T016 constant add).
- Domain stays zero-dependency: RE2 and Hocuspocus live behind the ports (T003/T017); adapters are infrastructure/collab. `packages/domain` imports only `@asciidocollab/asciidoc-core` — **never `@asciidocollab/shared`**. Search/replace contracts are domain-owned types (T009/T020); the `*.dto.ts` are HTTP shapes mapped at the route (T010/T021). See `architecture-migration-plan.md`.
- Port grouping: `RegexEngine` is a service port under `ports/text/` (T003); `StructuredCollaborativeEditor` is a storage/mutation port under `ports/storage/` (T017).
- Single Yjs-authoritative write path (T018) — never the 409-guarded plain save; dormant files load from Yjs state, apply, write back.
- No DB schema change → no migration → no user ask.
- Commit only after green. After ALL tasks: `pnpm gate` + `/code-review` loop until clean (T029).
