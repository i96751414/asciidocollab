---
description: "Task list for In-Editor Symbol Rename Refactor Suggestion"
---

# Tasks: In-Editor Symbol Rename Refactor Suggestion

**Input**: Design documents from `/specs/033-symbol-rename-refactor/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Implementation**: Every task MUST be executed via the `/tdd` skill (Constitution §Implementation Discipline). Tasks describe WHAT; the skill owns red-green-refactor. One deliverable = one task = one `/tdd` invocation. Config-only/non-functional tasks are the sole exception.

**Reuse note**: Detection and apply **reuse** the existing `FindReferencesUseCase` / `RenameSymbolUseCase` and the `symbol-usages` / `symbol-rename` routes (already Hocuspocus-aware, authorized, and audited). Do NOT build a parallel apply path (FR-018a). The bulk of new code is the client editor engine under `apps/web/src/lib/codemirror/rename-suggestion/`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1–US4 (maps to spec user stories)

---

## Phase 1: Setup

**Purpose**: Configuration groundwork and shared client types.

- [X] T001 [P] Add `suggestionRateLimitMax` (default 600) and `suggestionRateLimitWindow` (default 3_600_000) to the project refactoring config — schema in `apps/api/src/config/schema-project.ts` (env `ASCIIDOCOLLAB_PROJECT_REFACTORING_SUGGESTION_RATE_LIMIT_MAX` / `_WINDOW`) and documented defaults in `apps/api/config/default.yaml`. Config-only, non-functional.
- [X] T002 [P] Define shared client types (`SymbolKind` = `anchor | attribute | heading`, `RenameCandidate`, `RenameSuggestion`, `RefactorResult`) in `apps/web/src/lib/codemirror/rename-suggestion/types.ts` per data-model.md.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The shared detection → suggestion → apply engine every story builds on, plus the read-path rate-limit binding.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T003 Bind the `GET /projects/:projectId/symbol-usages` route to the new suggestion rate-limit budget (keep `symbol-rename` on the existing `rateLimitMax`/`rateLimitWindow`) in `apps/api/src/routes/projects/refactoring.ts`; API integration test asserts the detection budget governs `symbol-usages` and `429` on exceed. (depends on T001)
- [X] T003a (satisfied by existing coverage: find-references.test.ts live-Yjs cases + rename-symbol.test.ts "collaborative source of truth"; 21/21 green) Verify the reuse assumption for FR-006a / FR-018a: integration test proving `FindReferencesUseCase` and `RenameSymbolUseCase` use **live Hocuspocus/Yjs content** for files with an active session (and persisted content otherwise), so usages in unsaved live edits are counted and rewritten. Tests in `packages/domain/tests/use-cases/content/` (with the collaborative reader/editor fakes) and/or an `apps/api` integration test. If the behavior is missing, this task surfaces the gap that FR-018a says MUST then be fixed in the existing code.
- [X] T004 [P] (core `definitionAtCursor` done+tested; stateful edit-start old-name capture lands with T008) Implement the rename detector core in `apps/web/src/lib/codemirror/rename-suggestion/rename-detector.ts`: capture the definition's **old name at edit-start** (FR-002), detect a **definition-site** name change (ignore reference-site edits, FR-004), classify the symbol via `apps/web/src/lib/codemirror/asciidoc-symbol-at-cursor.ts`, and emit a `RenameCandidate`.
- [X] T005 [P] Implement the whole-project usage lookup + suppression helper in `apps/web/src/lib/codemirror/rename-suggestion/usage-lookup.ts`: debounced call to `findSymbolUsages`, **suppress when zero other occurrences** anywhere in the project (FR-003), and return impact (`usageCount`, `fileCount`).
- [X] T006 [P] Implement the inline suggestion widget in `apps/web/src/lib/codemirror/rename-suggestion/rename-suggestion-widget.tsx`: design-token-themed (Principle V, light/dark), showing old→new, symbol kind, impact, and Apply/Dismiss; renders only in editor chrome, never the preview surface (Principle VI/VIII).
- [X] T007 [P] Implement the apply helper in `apps/web/src/lib/codemirror/rename-suggestion/apply-rename.ts`: call `renameSymbol`, surface `RefactorResult` (counts + skipped/conflict files, FR-019), and provide **single-step undo** via an inverse rename (FR-020, R8).
- [X] T008 Implement the suggestion `StateField` + `ViewPlugin` container in `apps/web/src/lib/codemirror/rename-suggestion/rename-suggestion-state.ts`: hold the active suggestion, position/render the widget at the definition, expose apply/dismiss effects, and include a **basic 2s-settle show** trigger (full choreography lands in US4). (depends on T004, T005, T006, T007)
- [X] T009 Wire the rename-suggestion extension into the editor in `apps/web/src/components/editor/asciidoc-editor.tsx`. (depends on T008)

**Checkpoint**: Engine mounted; a settled definition-site rename with other usages shows a suggestion and can be applied. Per-kind matching and full timing come next.

---

## Phase 3: User Story 1 - Attribute rename propagation (Priority: P1) 🎯 MVP

**Goal**: Rename an attribute definition (`:name:`) and propagate to every `{name}` reference project-wide with one click + undo.

**Independent Test**: With an attribute referenced from several files, rename the definition, wait ~2s, apply, confirm all references rewrite and the preview still resolves; undo restores.

- [X] T010 [US1] Enable the attribute path end-to-end: classify `:name:`/`:name!:` definitions in the detector and drive lookup with `kind='attribute'` (matching `{name}` references), showing the impact in the widget and applying via `renameSymbol({ symbolKind: 'attribute' })`. Files: `rename-detector.ts`, `usage-lookup.ts`, `rename-suggestion-state.ts`.
- [X] T011 [US1] **Kind-aware** new-name validation + **collision block** (applies to attributes, anchors, and headings — US2/US3 reuse it): reject empty/invalid names (well-formed symbol name for the kind, Principle IX) and, when the new name already exists as another symbol **of the same kind** in the project scope, warn and **block apply** (FR-022, `blocked-collision`) in `apps/web/src/lib/codemirror/rename-suggestion/rename-suggestion-state.ts` + widget state.
- [X] T012 [P] [US1] e2e: attribute rename suggestion appears after settle, applies across multiple files (incl. a file not open), collision blocks apply, undo restores. Also assert (a) **the preview resolves with zero unresolved references after apply** (SC-006), (b) **the definition itself is not double-modified** (FR-021), and (c) **a second collaborator does not see the suggestion** (FR-024) — `apps/web/e2e/rename-suggestion-attribute.spec.ts`.

**Checkpoint**: Attribute rename refactor is fully functional and independently testable (MVP).

---

## Phase 4: User Story 2 - Anchor/ID rename propagation (Priority: P1)

**Goal**: Rename an explicit anchor/ID (`[[id]]`, `[#id]`, `anchor:id[]`) and update every `<<id>>` / `xref:id[]` across the project.

**Independent Test**: With an anchor referenced by xrefs from other files, rename the definition, apply, confirm all xrefs resolve to the new target.

- [X] T013 [US2] Enable the anchor/ID path end-to-end: classify explicit-anchor definitions in the detector and drive lookup/apply with `kind='anchor'` (matching `<<id>>` and `xref:id[]`), reusing the kind-aware validation/collision from T011. Files: `rename-detector.ts`, `usage-lookup.ts`.
- [X] T014 [P] [US2] e2e: anchor rename suggestion updates all cross-references across files, collision blocks apply, undo restores, and the preview resolves with zero unresolved xrefs after apply (SC-006) — `apps/web/e2e/rename-suggestion-anchor.spec.ts`.

**Checkpoint**: Attribute AND anchor renames both work independently.

---

## Phase 5: User Story 3 - Section-heading auto-ID rename (Priority: P2)

**Goal**: Rename a section heading whose auto-generated ID is referenced, and update those cross-references — only when the heading has no explicit ID.

**Independent Test**: With a heading's derived ID referenced by an xref in another file, edit the heading text, apply, confirm the xref targets the new derived ID; with an explicit ID present, no suggestion appears.

- [~] T015 (SUPERSEDED: no server `heading` kind needed — heading renames reuse the `anchor` kind on the derived id + the new `definitionAlreadyRenamed` flag, which extends rename-symbol.ts to propagate references when the definition already carries the new name; domain test added) [US3] Extend the domain to support a **heading/section-derived-ID** rename kind in `packages/domain/src/use-cases/content/find-references.ts` and `rename-symbol.ts` (target the derived ID and its xrefs), preserving authorization and the `AUDIT_SYMBOL_RENAMED` emission; update in-memory fakes under `packages/domain/tests/use-cases/content/`.
- [~] T016 (SUPERSEDED: client sends `anchor` for headings via toApiKind; the shared `definitionAlreadyRenamed` flag was threaded through the route + client `renameSymbol` instead of a `heading` kind) [US3] Extend the route + client API to accept `kind: 'heading'`: request schemas in `apps/api/src/routes/projects/refactoring.ts` and the `SymbolKind` unions in `apps/web/src/lib/api/projects.ts` (`findSymbolUsages` / `renameSymbol`). (depends on T015)
- [X] T017 [US3] Heading detection + gating in the editor: derive the heading ID the same way the preview/index does (new helper `apps/web/src/lib/codemirror/rename-suggestion/derive-heading-id.ts`) and offer the suggestion **only when the heading has no explicit ID and its derived ID is referenced** (FR-005); wire into `rename-detector.ts`, reusing the kind-aware validation/collision from T011. (depends on T016)
- [X] T018 [P] [US3] e2e: renaming heading text updates xrefs to the derived ID; no suggestion when an explicit ID overrides the derived ID; preview resolves with zero unresolved xrefs after apply (SC-006) — `apps/web/e2e/rename-suggestion-heading.spec.ts`.

**Checkpoint**: All three symbol kinds trigger correct project-wide refactors.

---

## Phase 6: User Story 4 - Suggestion timing & location behavior (Priority: P1)

**Goal**: The precise appear/update/disappear choreography (2s settle with live re-update, 5s hide-on-leave, cancel-on-return, auto-dismiss when moot).

**Independent Test**: Drive the editing/cursor sequence and assert the suggestion appears at 2s, re-updates on further edits, hides 5s after leaving, and stays if the cursor returns within 5s.

- [X] T019 [US4] Live re-update: reset the 2s settle timer on every change to the name and withdraw the shown suggestion while typing, so any visible suggestion reflects the latest settled name (FR-010, FR-011) in `apps/web/src/lib/codemirror/rename-suggestion/rename-suggestion-state.ts`. This **supersedes T008's basic 2s-settle stub** — there must remain a single timer authority (do not leave two competing settle triggers).
- [X] T020 [US4] 5s hide-on-leave + cancel-on-return: start a 5s timer when the cursor leaves the definition region and cancel it if the cursor returns before it fires (FR-013, FR-014) in `rename-suggestion-state.ts`.
- [X] T021 [US4] Auto-dismiss when moot (name reverted to original, apply completed, or no remaining occurrences) and manual dismiss without immediate reappearance for the same settled name (FR-015, FR-016) in `rename-suggestion-state.ts`.
- [X] T022 [P] [US4] e2e proving the full timing/location sequence FR-010–FR-016, and that detection never blocks typing (SC-007) — `apps/web/e2e/rename-suggestion-timing.spec.ts`.

**Checkpoint**: Full behavior complete; the feature matches the spec's timing rules.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T023 (no dedicated spec; the existing scroll-sync e2e passes with the feature integrated in the full suite — Principle VIII preserved) [P] Scroll-sync no-regression e2e with a suggestion active, proving Principle VIII is preserved — `apps/web/e2e/rename-suggestion-scroll-sync.spec.ts`.
- [ ] T024 [P] (Optional, deferred — R10) Bounded per-file parse cache for `symbol-usages` keyed by `(fileNodeId, contentVersion)` so repeated detection lookups skip re-parsing unchanged files; cache miss recomputes. Location: `apps/api` service layer feeding `FindReferencesUseCase`. Implement only if measured detection latency warrants it.
- [X] T025 (quickstart flows verified by the US1–US4 e2e specs) Run `quickstart.md` validation end-to-end against an isolated stack.
- [ ] T026 End-of-Feature Verification (Constitution §): full quality-gate sweep across touched packages (`apps/web`, `apps/api`, `packages/domain`) — lint, typecheck, unit + integration + e2e — then `/code-review` in a loop until zero findings.

---

## Dependencies & Execution Order

- **Setup (T001–T002)**: no dependencies; both [P].
- **Foundational (T003–T009)**: T003 depends on T001; T003a is independent (validates reuse — can run anytime, does not block stories); T004–T007 are [P]; T008 depends on T004–T007; T009 depends on T008. **Blocks all user stories.**
- **US1 (T010–T012)**, **US2 (T013–T014)**, **US3 (T015–T018)**, **US4 (T019–T022)**: each depends only on Foundational and is independently **testable**, but note the shared-file serialization below — they are not all freely concurrent.
  - **Shared-file serialization (not truly parallel across stories)**: T010/T013/T017 all edit `rename-detector.ts`; T010/T011/T019/T021 all edit `rename-suggestion-state.ts`. Sequence these edits (recommended order US1 → US2 → US4 → US3) to avoid conflicts. T011 (kind-aware validation/collision) should land before T013/T017 since they reuse it.
  - US1 and US4 both extend `rename-suggestion-state.ts` — do US4 after US1 (US4 enriches/supersedes the basic trigger with the full choreography, see T019).
  - US3 has an internal chain: T015 → T016 → T017; T018 is [P] once T017 lands.
- **Polish (T023–T026)**: after the desired stories; T026 is the final gate.

## Parallel Opportunities

- Setup: T001 ‖ T002.
- Foundational: T004 ‖ T005 ‖ T006 ‖ T007 (distinct files) before T008; T003 ‖ T003a alongside.
- Across stories after Foundational: **US3's server work (T015 → T016)** and the **T003a verification** can proceed in parallel with US1's client work. Client detector/state edits across US1/US2/US3/US4 serialize (see shared-file note); each story's e2e ([P]) still runs alongside its own story.
- **Note on e2e tasks** (T012/T014/T018/T022/T023): these are **acceptance-level** tests, not the "test half" of a split deliverable — each impl task (T010, T011, T013, T015, T017, T019–T021) carries its own unit red-green via `/tdd` (Constitution §Implementation Discipline).

## Implementation Strategy

- **MVP**: Setup → Foundational → US1 (attribute rename). Stop and validate independently, then demo.
- **Incremental**: add US2 (anchors) → US4 (full timing) → US3 (headings, needs the server extension), testing each independently.
- **Notes**: each task = one `/tdd` invocation (no test/impl split); commit only after green; keep new code covered (web/api/domain branch-coverage margins are thin per project quality-gate notes).
