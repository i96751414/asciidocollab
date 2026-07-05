---
description: "Task list for Collaborative Consistency of Attribute/Symbol-Derived State"
---

# Tasks: Collaborative Consistency of Attribute/Symbol-Derived State

**Input**: Design documents from `/specs/036-symbol-collab-consistency/`

**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅, quickstart.md ✅

**Implementation**: Every task MUST be executed via the `/tdd` skill (Constitution §Implementation Discipline). Tasks describe WHAT to build; the skill owns red-green-refactor. One deliverable = one task — do **not** split a task into separate "write test" / "write implementation" tasks. The two-client E2E tasks are distinct acceptance deliverables (SC-009 explicitly requires an automated two-client test), following the feature-032/033 Playwright pattern.

**Organization**: Tasks are grouped by user story (and two cross-cutting phases for requirements not owned by a single story) for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1–US7 map to the spec's user stories; Setup/Foundational/cross-cutting/Polish phases carry **no** story label
- Exact file paths are included in every task

## Architecture note (why the foundation is large)

All derived views (preview, editor highlighting, inherited attributes, heading IDs, outline, rename) already fan out from the existing `reachableDocVersion` counter. So the **shared transport + a single client recompute handler** (Phase 2) is what mechanically delivers the P1 live-consistency stories; each story phase then adds its *trigger* and/or its *acceptance E2E*. This is intentional reuse (Principle IV) — the net change **removes** the feature-032 Hocuspocus observer subsystem. The transport is built **event-union-generic** (forwards any `ProjectEventDto` member), so the `content-changed` and `main-file-changed` signals share one bus → SSE → worker → hook path.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Wire DTOs and config that later phases depend on. No behavior yet.

- [X] T001 [P] Add the `ContentChangedEventDto` (`{ type: 'content-changed', fileNodeId }`), the `MainFileChangedEventDto` (`{ type: 'main-file-changed', mainFileNodeId: string | null }`), and the `ProjectEventDto` discriminated union (`FileTreeEventDto | ContentChangedEventDto | MainFileChangedEventDto`) in `packages/shared/src/dtos/project-event.dto.ts`, re-using `packages/shared/src/dtos/file-tree-event.dto.ts` verbatim, and export them from the shared barrel (`packages/shared/src/index.ts`). UUID-typed fields per data-model.md.
- [X] T002 [P] Add env-driven collab notify config (API internal notify URL/path + debounce window ms, no magic literals) in `apps/collab/src/config/collab-config.ts`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The trigger-agnostic, event-union-generic transport backbone (bus → SSE → worker → hook) plus the single client recompute handler. Every downstream phase depends on this.

**⚠️ CRITICAL**: No user story or cross-cutting phase can be validated end-to-end until this phase is complete.

- [X] T003 [P] Extend the shared per-project event bus to carry the full `ProjectEventDto` union (`content-changed` and `main-file-changed` alongside the existing file-tree events) in `apps/api/src/plugins/file-tree-event-bus.ts`.
- [X] T004 Carry every `ProjectEventDto` union member on the project SSE stream (serialize the union; clients discriminate on `type`) in `apps/api/src/routes/projects/events.ts` (depends on T003).
- [X] T005 [P] Fan out all `ProjectEventDto` frames (not just file-tree events) to subscribers in `apps/web/src/workers/file-tree-events.worker.ts`.
- [X] T006 Surface the `ProjectEventDto` union to subscribers (discriminate on `type`; expose per-type callbacks including `content-changed` and `main-file-changed`) in `apps/web/src/hooks/use-file-tree-events.ts` (depends on T005).
- [X] T007 Implement the core `content-changed` recompute handler in `apps/web/src/hooks/use-project-symbol-index.ts`: ignore the frame when `fileNodeId` is the open file or is not in `built.tree.nodes`; otherwise `contentCache.delete(fileNodeId)`, `build()` (re-fetch via the live-aware `GET …/content` fixpoint), then bump `reachableDocVersion`; coalesce rapid frames per file (one in-flight fetch+rebuild per file, supersede stale) per FR-018/FR-020 (depends on T006).

**Checkpoint**: Emitting any `ProjectEventDto` on the bus for a reachable file coherently refreshes every derived view from one rebuilt snapshot. Downstream phases now just add triggers + acceptance.

---

## Phase 3: User Story 1 - Inherited attribute values stay live in the preview (Priority: P1) 🎯 MVP

**Goal**: A collaborator's unsaved live edit to a parent/sibling attribute re-renders the open child's preview.

**Independent Test**: Two clients; B changes the parent's `:productName:` live (no save); A's preview converges to the new value after edits settle.

- [X] T008 [US1] Internal notify route `POST /internal/collab/content-changed` in `apps/api/src/routes/internal/collab-content-changed.ts`: Fastify-schema-validated `{ projectId, yjsStateId }`, map `yjsStateId → fileNodeId` via the document repository, `fileTreeEventBus.emit(projectId, { type: 'content-changed', fileNodeId })`, return `{ ok: true }`; unknown `yjsStateId` → `ok:true` with no emit. Register on the internal (loopback/mTLS) server in `apps/api/src/internal-server.ts`.
- [X] T009 [US1] Collab change-notifier extension in `apps/collab/src/extensions/change-notifier.ts`: on `onChange` (+ `beforeHandleMessage`) for content rooms only (skip `presence/` rooms), start/refresh a per-room debounce timer (config window), on fire POST T008 via the existing `mtls-fetch` transport off the Yjs hot path, tolerate non-2xx/unreachable (best-effort). Wire in `apps/collab/src/composition-root.ts` and register the hook in `apps/collab/src/server.ts`.
- [X] T010 [US1] Two-client E2E in `apps/web/tests/e2e/collab-consistency-preview.spec.ts`: B live-edits parent `:productName:` (unsaved) → A's child **preview** converges to the new value; also covers attribute removal → unresolved handling and session-end persistence (SC-001; FR-001/003/005/006).

**Checkpoint**: Live cross-file attribute → preview works end-to-end. MVP demonstrable.

---

## Phase 4: User Story 2 - Inherited attributes & highlighting stay live in the editor (Priority: P1)

**Goal**: The editor's treatment of inherited attributes (undefined↔known, inline value/fold, conditional regions, include/image path resolution) recomputes on a collaborator's live change.

**Independent Test**: A has the child open in the editor; B adds a `:flag:` definition to the parent live; A's `{flag}` reference stops being flagged as undefined.

- [X] T011 [US2] Verify (and, only if a consumer is not already wired, wire) that `inheritedAttributesField` and the editor highlighting/conditional-region/path-resolution consumers in `apps/web/src/hooks/use-project-symbol-index.ts` recompute off the `reachableDocVersion` bump from T007; if the wiring turns out non-trivial, split it into its own `/tdd` task ahead of the test (Constitution §Implementation Discipline). Then add the two-client E2E in `apps/web/tests/e2e/collab-consistency-highlighting.spec.ts`: live add/remove of an inherited definition flips highlighting undefined↔known, and an `ifdef`/`imagesdir`/include-target change recomputes (SC-002; FR-002/006).

**Checkpoint**: Editor highlighting and inherited-attribute behavior stay live independent of the preview.

---

## Phase 5: User Story 3 - Heading IDs, outline & cross-references stay consistent (Priority: P1)

**Goal**: Inherited `:idprefix:`/`:idseparator:`/`:sectids:`, `leveloffset`, or a related file's headings changing live keeps the open doc's auto heading IDs, outline entries, and xref resolution consistent with the assembled document.

**Independent Test**: A opens a file whose headings inherit `:idprefix:` from a parent; B changes the parent's `:idprefix:` live; A's outline entries and generated heading IDs adopt the new prefix.

- [X] T012 [US3] Verify (and, only if not already wired, wire) that heading-ID generation, `use-section-outline`, and cross-reference resolution recompute off the `reachableDocVersion` bump, and that the full-assembled-outline path consumes `content-changed` in `apps/web/src/hooks/use-project-symbol-index.ts` / the outline hook; if wiring is non-trivial, split it into its own `/tdd` task ahead of the test. Then add the two-client E2E in `apps/web/tests/e2e/collab-consistency-headings.spec.ts`: live `:idprefix:` change and live related-heading edits → A's heading IDs, outline, and xref labels match the assembled document (SC-003; FR-007).

**Checkpoint**: ID/outline/xref consistency holds for live cross-file structural changes.

---

## Phase 6: User Story 5 - Consistency independent of which editor panel is open (Priority: P1)

**Goal**: Remove the outline-visibility gating so attribute/ID/reference freshness holds whenever the document is open; only the full-assembled-outline recompute for an *unrelated sibling's* headings may remain outline-gated.

**Independent Test**: Reproduce an inherited-attribute change across {outline open/closed, scope current/full, main-file set/unset}; the open doc updates identically in every combination.

- [X] T013 [US5] Delete the Hocuspocus observer subsystem (`documentObservers`, `createDocumentObserver`, the reconcile loop, and the `observeReachableDocuments` gating) from `apps/web/src/hooks/use-project-symbol-index.ts`, and drop its wiring from `apps/web/src/app/(dashboard)/dashboard/projects/[id]/project-editor-layout.tsx`; retain only the outline-shown gate for the unrelated-sibling full-outline recompute (T007 handler replaces the observer's `onUpdate` role) (FR-016).
- [X] T014 [US5] Two-client E2E in `apps/web/tests/e2e/collab-consistency-panel-independence.spec.ts`: with the outline panel **closed** (and across current/full scope and main-file present/absent) an inherited-attribute/ID change updates A's highlighting and heading IDs identically to outline-open (SC-009).

**Checkpoint**: Consistency no longer switches off with a UI toggle; observer sockets gone.

---

## Phase 7: User Story 6 - A collaborator's saved edit to a related file refreshes the open document (Priority: P1)

**Goal**: A plain content **save** (sessionless or session save) to a related file propagates to open dependents best-effort, with no reconnect/structural event/manual refresh.

**Independent Test**: B edits+saves an included file then disconnects (no live session); A refreshes to the saved content once the save settles.

- [X] T015 [US6] Emit `content-changed` on the per-project bus from the `PUT …/content` save path (both sessionless and session saves) in `apps/api/src/routes/projects/file-content.ts`.
- [X] T016 [US6] Two-client E2E in `apps/web/tests/e2e/collab-consistency-saved-edit.spec.ts`: B edits **and saves** a related file, then disconnects (no live session) → A's derived views refresh to the saved content after it settles, with no reconnect/structural event/manual refresh, coherently from one recomputed state (SC-010; FR-017; US6 scenarios 1–3).

**Checkpoint**: Everyday edit-and-save propagates; no unbounded staleness.

---

## Phase 8: Main-File Change Propagation (Priority: P1, cross-cutting — FR-009)

**Purpose**: When the project's designated main file changes, every open document's inherited context (anchored at the main file) must re-resolve — a project-**setting** change that emits no `content-changed` and today (`apps/api/src/routes/projects/main-file.ts`) propagates nothing. Not owned by a single user story (edge case "Main/root file change", spec.md). Depends only on Phase 2; runs in parallel with the user-story phases.

**Independent Test**: A has a child document open; a collaborator changes the project main file; A's inherited attribute values, heading IDs, and preview re-resolve against the new anchor with no reload.

- [X] T017 Emit `{ type: 'main-file-changed', mainFileNodeId }` on the per-project bus from the main-file PUT handler in `apps/api/src/routes/projects/main-file.ts` (after the `set-project-main-file` use case succeeds; `mainFileNodeId` may be `null` when cleared).
- [X] T018 Handle `main-file-changed` in `apps/web/src/hooks/use-project-symbol-index.ts`: update the resolution anchor to the new `mainFileNodeId`, `build()` (unconditionally — every open document re-resolves, independent of `built.tree.nodes` membership), then bump `reachableDocVersion` (FR-009); coalesce with the existing rebuild path (depends on T007).
- [X] T019 Two-client E2E in `apps/web/tests/e2e/collab-consistency-main-file.spec.ts`: B changes the project main file → A's open document's inherited attribute values / heading IDs / preview re-resolve to the new anchor with no reload or structural file event (FR-009; edge case "Main/root file change").

**Checkpoint**: Changing the project anchor refreshes all open documents.

---

## Phase 9: User Story 4 - Rename suggestions & reference counts reflect live edits (Priority: P2)

**Goal**: While a rename suggestion is visible, its offer decision, reference/file count, and collision check track the project's live state.

**Independent Test**: A shows a rename suggestion with a count; B adds a reference to the old name in another file live; A's count increases to include it before apply.

- [X] T020 [US4] On a (debounced) `content-changed` for any project file while a rename suggestion widget is visible, re-run `findSymbolUsages` (already live-aware server-side via `/symbol-usages`) and update the reported reference/file count, the collision determination, and the suppression rule in `apps/web/src/lib/codemirror/rename-suggestion/rename-suggestion-state.ts` (FR-010).
- [X] T021 [US4] Two-client E2E in `apps/web/tests/e2e/collab-consistency-rename.spec.ts`: with A's suggestion visible, B live-adds a reference (count rises) and a colliding same-kind definition (apply blocked while it persists) and removes the last occurrence (suggestion withdrawn); then A applies → every live+persisted occurrence rewritten, single-step undo (SC-004/SC-005; FR-010/011).

**Checkpoint**: Rename freshness holds against concurrent live edits; apply reuses the existing collaboration-aware path.

---

## Phase 10: User Story 7 - Graceful behavior at the edges of a live session (Priority: P3)

**Goal**: Related files with no active session resolve from persisted content and switch to live automatically on session start, back to persisted on session end, with no stale flash; surface non-live inputs subtly (FR-021).

**Independent Test**: With no collaborator in a related file, A resolves it from saved content; B starts editing → A switches to live; B's session ends → A reverts to persisted with no stale intermediate.

- [X] T022 [US7] Subtle, on-demand non-live indicator component in `apps/web/src/components/editor/non-live-indicator.tsx` (design-token styled, correct light/dark, no disruptive warning per Principles V/VI), driven by a per-open-document non-live state set in `apps/web/src/app/(dashboard)/dashboard/projects/[id]/project-editor-layout.tsx` when a reachable file's current content could not be obtained live (fetch failure / dropped delivery) (FR-021).
- [X] T023 [US7] Two-client E2E in `apps/web/tests/e2e/collab-consistency-session-edges.spec.ts`: session start → A switches to live; session end → A reverts to persisted with no intermediate stale flash (SC-008; FR-003); and dropped/restored SSE → A clears cache + rebuilds on reconnect and shows the non-live indicator meanwhile (edge / FR-021).

**Checkpoint**: Live↔persisted transitions are graceful and observable.

---

## Phase 11: Polish & Cross-Cutting Concerns

**Purpose**: Remaining edge-case correctness (reachability + co-edit), convergence/bounding guarantees, connection-count proof, non-regression, and final gates that span phases.

- [ ] T024 [P] Two-client E2E for reachability change in `apps/web/tests/e2e/collab-consistency-reachability.spec.ts`: B live-adds an `include::` so a file **enters** the open doc's context (its attributes/IDs now contribute) and removes one so a file **leaves** — A's derived views add/drop that file's contribution accordingly (FR-008; edge case "Reachability changes").
- [ ] T025 [P] Two-client E2E for concurrent co-edit in `apps/web/tests/e2e/collab-consistency-coedit.spec.ts`: A edits the open document locally **while** B changes its inherited context live → both A's own edit and the inherited change are reflected; neither clobbers the other's derived state (FR-015; edge case "Concurrent edits to the open document itself").
- [ ] T026 [P] Coalescing/convergence coverage for the T007 handler: rapid successive `content-changed` frames for one file → bounded recompute (not one-per-keystroke) converging on the final value, in `apps/web/tests/hooks/use-project-symbol-index.test.ts` (FR-012/FR-020).
- [ ] T027 [P] Regression coverage that circular/self-referential includes keep resolution bounded/safe under the new rebuild trigger, in `apps/web/tests/hooks/use-project-symbol-index.test.ts` (FR-013).
- [ ] T028 Connection-count check (SC-007): assert A holds exactly one project SSE (shared via the SharedWorker across tabs) and **zero** per-related-file Hocuspocus observer sockets, in `apps/web/tests/e2e/collab-consistency-connection-count.spec.ts`.
- [ ] T029 Confirm the feature-032 two-client outline E2E and the feature-033 rename E2E specs stay green after the observer→SSE transport swap (non-regression guard; do not modify unless they assert removed internals).
- [ ] T030 Run `quickstart.md` scenarios 1–11 end-to-end, the qualitative SC-011 typing-latency check (no automated latency benchmark per Constitution Principle II), then the full quality-gate sweep (`pnpm gate`: lint, typecheck, unit + integration + security scan + e2e) and `/code-review` in a loop until zero findings.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies — start immediately.
- **Foundational (Phase 2)**: depends on Setup; **BLOCKS all downstream phases** (transport + recompute core).
- **User Stories & cross-cutting (Phases 3–10)**: all depend on Foundational.
  - US1 (Phase 3) delivers the **live** trigger (internal route + collab notifier) that US2 and US3 reuse — so US2/US3 depend on US1's trigger being in place to exercise their live E2Es.
  - US5 (Phase 6) depends on US1's recompute handler (it replaces the deleted observer's role).
  - US6 (Phase 7) is independent of US1's trigger (it adds the **save** trigger) — needs only Foundational.
  - **Main-File Propagation (Phase 8)** needs only Foundational (reuses the union transport); independent of the US1 trigger.
  - US4 (Phase 9) needs only Foundational + a delivered `content-changed` stream (present after Phase 2).
  - US7 (Phase 10) needs Foundational; the indicator is independent UI.
- **Polish (Phase 11)**: depends on the phases it exercises being complete (T024/T025 need Phase 2 + the relevant triggers; T028/T029 need Phase 6's removal).

### Critical path

Setup → Foundational (T003→T004, T005→T006→T007) → US1 (T008→T009→T010) → US5 (T013→T014) → Polish.

### Parallel Opportunities

- T001 ‖ T002 (Setup, different files/apps).
- T003 ‖ T005 (API bus vs web worker, different apps); T004 waits on T003; T006 waits on T005; T007 waits on T006.
- Once Foundational is done, **US6 (Phase 7), Main-File Propagation (Phase 8), US4 (Phase 9), and US7 (Phase 10) can all proceed in parallel** with the P1 US1–US3 work (independent triggers/surfaces).
- T024 ‖ T025 ‖ T026 ‖ T027 (distinct test files).

---

## Parallel Example: Foundational + independent phases

```bash
# Setup — run together:
Task T001: "ProjectEventDto / ContentChangedEventDto / MainFileChangedEventDto in packages/shared/src/dtos/project-event.dto.ts"
Task T002: "Collab notify config in apps/collab/src/config/collab-config.ts"

# Foundational — API and web fan-out start in parallel:
Task T003: "ProjectEventDto union on the bus in apps/api/src/plugins/file-tree-event-bus.ts"
Task T005: "ProjectEventDto fan-out in apps/web/src/workers/file-tree-events.worker.ts"

# After Foundational — independent triggers/surfaces in parallel:
Task T015 (US6): "PUT …/content emits content-changed in apps/api/src/routes/projects/file-content.ts"
Task T017 (FR-009): "main-file PUT emits main-file-changed in apps/api/src/routes/projects/main-file.ts"
Task T020 (US4): "rename re-query on content-changed in .../rename-suggestion-state.ts"
Task T022 (US7): "non-live indicator component"
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Phase 1 Setup → Phase 2 Foundational (transport + recompute core).
2. Phase 3 US1 (live attribute → preview).
3. **STOP & VALIDATE**: two-client preview convergence (SC-001). Demo the MVP.

### Incremental Delivery

1. Foundational ready → add US1 (live preview) → demo.
2. Add US2 + US3 (highlighting, IDs/outline) — reuse US1's live trigger.
3. Add US5 (panel independence + observer removal) — the key reuse win (deletes feature-032 subsystem).
4. Add US6 (saved-edit refresh) and Main-File Propagation (FR-009) — independent triggers; can land alongside US1–US3.
5. Add US4 (rename freshness), then US7 (session edges + non-live indicator).
6. Polish: reachability/co-edit edge E2Es, convergence/bounding tests, connection-count proof, non-regression, full `pnpm gate` + `/code-review` loop.

### Notes

- Each task = one `/tdd` invocation (red-green-refactor); never split test/impl. Where T011/T012 note a "verify (and wire if missing)" step, split off the production wiring into its own `/tdd` task if it turns out non-trivial.
- Commit after each task's green phase.
- No DB schema change / no migration (data-model.md).
- **Requirement applicability**: FR-022 tier/cap mechanics and SC-012's Tier-1-before-Tier-2 ordering are properties of the **rejected** client-observation fallback (spec clarification 2026-07-05); under the chosen backend-authoritative broadcast+client-filter design all relevant changes are delivered, so prioritization is moot and intentionally unimplemented (see plan.md). FR-023 is satisfied by *outcome* (broadcast + client-side relevance filter, research D4), not by server-targeted per-document delivery — a documented, accepted deviation.
- Principle VIII/IX: no sanitizer or scroll-sync change; the SSE frame is a bare id (`fileNodeId` / `mainFileNodeId`); the client re-fetches through the existing authorized, sanitized `/content` path.
