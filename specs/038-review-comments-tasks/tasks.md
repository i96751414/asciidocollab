---

description: "Task list for Review Comments and Tasks (feature 038)"
---

# Tasks: Review Comments and Tasks

**Input**: Design documents from `/specs/038-review-comments-tasks/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/review-comments-api.md

**Implementation**: Every task below MUST be executed via the `/tdd` skill (Constitution §Implementation Discipline). Each task is **one deliverable** — the skill owns the red→green→refactor cycle; do **not** split a task into separate "write test" and "write implementation" tasks. Test files live under each package/app's `tests/` (never `__tests__/`, never co-located).

**Organization**: Grouped by user story (US1–US5) so each story is independently implementable and testable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1–US5 for story-phase tasks; Setup/Foundational/Polish carry no story label

## Path Conventions (this feature)

| Layer | Source | Tests |
|---|---|---|
| Shared DTOs | `packages/shared/src/review/` | `packages/shared/tests/review/` |
| Domain | `packages/domain/src/{entities,ports/review,use-cases/review}/` | `packages/domain/tests/{...}/review/` |
| Infrastructure | `packages/infrastructure/src/persistence/review/` | `packages/infrastructure/tests/persistence/review/` |
| DB | `packages/db/prisma/schema.prisma` | integration (Postgres) |
| API | `apps/api/src/routes/review/`, `apps/api/src/di/` | `apps/api/tests/routes/review/` |
| Web | `apps/web/src/{components/review,lib/review,lib/codemirror,hooks}/` | `apps/web/tests/…`, `apps/web/e2e/` |

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Slot the review module into the existing monorepo rings — no new package or layer.

- [X] T001 [P] Scaffold review module folders and barrels wired into package exports: `packages/shared/src/review/index.ts`, `packages/domain/src/{entities,ports/review,use-cases/review}/index.ts` (re-exported from `@asciidocollab/domain`), `packages/infrastructure/src/persistence/review/index.ts`, `apps/api/src/routes/review/index.ts`, `apps/web/src/components/review/index.ts`.
- [X] T002 [P] Add review rate-limit configuration keys (max + window, env-driven, no hardcoded literals) to the API config surface (`apps/api/src/config/…`) for create/reply/react/delete/bulk-delete routes, per the contract's recorded rate-limit decisions.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Cross-cutting substrate every user story needs.

**⚠️ CRITICAL**: No user-story work begins until this phase is complete.

- [X] T003 [P] Define shared DTOs + typed error union in `packages/shared/src/review/` — `ReviewItemDTO`, `AnchorDTO`, `ReactionSummaryDTO`, `ThreadDTO`, command inputs (`CreateReviewItemInput`, `ReplyInput`, `ResolveInput`, `ConvertToTaskInput`, `AssignTaskInput`, `SetStatusInput`, `ReactInput`, `DeleteInput`, `BulkDeleteDocumentInput`, `BulkDeleteProjectInput`), and `ReviewError = NotFound | Forbidden | ValidationFailed | AnchorInvalid`, plus `kind`/`status`/`anchorState` literal enums, and a single named body-length constant `REVIEW_BODY_MAX_LEN = 4000` (data-model.md §DTOs; the one authority all boundary validation references — no magic number).
- [X] T004 [P] Implement the `ReviewComment` aggregate (+ `Reaction`) in `packages/domain/src/entities/review-comment.ts` with invariants (reply carries no anchor/status/assignee/dueDate and shares project+document with its root; task-only fields non-null only when `kind=TASK`; anchor only on root) and state transitions (kind convert both ways; task status OPEN→IN_PROGRESS→RESOLVED / any→WONTFIX / reopen; anchor LOCATED→SECTION→DETACHED and back). Zero external deps.
- [X] T005 [P] Define `ReviewCommentRepository` port in `packages/domain/src/ports/review/review-comment.repository.ts` (`create`, `findById`, `listByDocument`, `listByProject`, `update`, `delete`, `deleteByDocument`, `deleteByProject` — all `projectId`-filtered) **plus its in-memory fake** in `packages/domain/tests/ports/review/`.
- [X] T006 [P] Define `ReviewReactionRepository` port in `packages/domain/src/ports/review/review-reaction.repository.ts` (`toggle`, `listForItems`) **plus its in-memory fake** in `packages/domain/tests/ports/review/`.
- [X] T007 ⚠️ **GATED — requires explicit user approval before generating/applying.** Add `ReviewComment` + `ReviewReaction` models and `ReviewItemKind`/`ReviewItemStatus`/`AnchorState` enums to `packages/db/prisma/schema.prisma` (relations with `onDelete: SetNull` for author/assignee/resolver, `Cascade` for project/document/parent/reactions; indexes per data-model.md) and generate the migration. Do NOT run until the user approves.
- [X] T008 [P] Implement `PrismaReviewCommentRepository` in `packages/infrastructure/src/persistence/review/prisma-review-comment.repository.ts` with integration tests against real Postgres, including tenant-filter (`projectId`) and thread-cascade assertions. (Depends on T005, T007.)
- [X] T009 [P] Implement `PrismaReviewReactionRepository` in `packages/infrastructure/src/persistence/review/prisma-review-reaction.repository.ts` with integration tests (idempotent toggle via unique `(comment,user,emoji)`). (Depends on T006, T007.)
- [X] T010 Wire the review repositories to their ports at the composition root (`apps/api/src/di/`, alongside `di/repositories.ts`), register the review route group under `/api/projects/:projectId`, and add the shared review request-guard (project-membership + RBAC re-check) and typed→HTTP error mapping (400/403/404/409/429). (Depends on T008, T009.)
- [X] T011 Add a `review-items-changed` event (payload `{ documentId }`, tenant-scoped to the project) to the **existing per-project event bus** (`apps/api/src/plugins/file-tree-event-bus.ts`), delivered on the **existing project SSE stream** (`apps/api/src/routes/projects/events.ts`) that already carries `content-changed` / `main-file-changed` (research D2/D4). Emitted by the review mutation routes; **not** a new Yjs type and **not** a new transport. SC-001 target < 2 s.
- [X] T012 [P] Implement the anchor core in `apps/web/src/lib/review/anchor.ts` — encode/decode the Yjs `RelativePosition` pair over `Y.Text('codemirror')`, capture/resolve the text-quote `{prefix, exact, suffix}` + line hint, with a min/max selection guard (empty/oversized selection → bounded anchor). Degradation is added in US3.
- [X] T013 Implement the highlight + gutter-marker decoration layer in `apps/web/src/lib/codemirror/review-decorations.ts`, reusing the `asciidoc-block-decorations` `Decoration.mark` pattern, with a **resting** class and a stronger **active/emphasized** class (drives FR-028). (Depends on T012.)
- [X] T014 Implement the `use-review-items` hook in `apps/web/src/hooks/use-review-items.ts` — fetch a document's items, resolve their anchors against the live `Y.Text`, subscribe to the project SSE `review-items-changed` event (T011) and refetch the affected document's items. (Depends on T003, T011, T012.)

**Checkpoint**: Foundation ready — user stories can proceed (in parallel if staffed).

---

## Phase 3: User Story 1 - Comment on a passage and resolve the discussion (Priority: P1) 🎯 MVP

**Goal**: Anchored, threaded, resolvable comments with emoji bodies + reactions, sequential navigation, and a show/hideable right-side panel — a complete review loop.

**Independent Test**: Two collaborators in one document; A selects text and comments; B sees the highlight + thread, replies, reacts, resolves; either navigates next/prev and hides/shows the panel.

- [X] T015 [P] [US1] `CreateReviewComment` use case in `packages/domain/src/use-cases/review/create-review-comment.ts` — RBAC (editor/owner), tenant filter, persists anchor, enforces non-empty body ≤ `REVIEW_BODY_MAX_LEN` (T003 constant), records audit (create). Returns `Result<…, ReviewError>`.
- [X] T016 [P] [US1] `ReplyToThread` use case in `packages/domain/src/use-cases/review/reply-to-thread.ts` — reply shares root's project/document, no anchor/task fields; appended in order.
- [X] T017 [P] [US1] `ResolveReviewItem` use case in `packages/domain/src/use-cases/review/resolve-review-item.ts` — **comment-thread resolution only** (`kind=COMMENT`); stamps `resolvedAt`/`resolvedById` via the shared stamp helper (data-model §Resolution authority), idempotent under concurrent resolve; rejects `kind=TASK` (tasks resolve via T031); audit.
- [X] T018 [P] [US1] `ListReviewItems` (by document) use case in `packages/domain/src/use-cases/review/list-review-items.ts` — `includeResolved` flag; tenant-filtered; returns threads + anchors + reaction summaries.
- [X] T019 [P] [US1] `ReactToItem` use case in `packages/domain/src/use-cases/review/react-to-item.ts` — toggles the caller's reaction; emoji validated against the unicode-emoji allowlist; returns updated `ReactionSummaryDTO[]`.
- [X] T020 [US1] API routes for create + list in `apps/api/src/routes/review/` — `POST /documents/:documentId/review-items` (rate-limited) and `GET /documents/:documentId/review-items?includeResolved=` (read; skip-limit with recorded reason), Fastify schema validation, emit the `review-items-changed` event (T011) on write. (Depends on T010, T015, T018.)
- [X] T021 [US1] API routes reply + resolve in `apps/api/src/routes/review/` — `POST /review-items/:id/replies` and `POST /review-items/:id/resolve` (rate-limited, emit the `review-items-changed` event). (Depends on T010, T016, T017.)
- [X] T022 [US1] API route reactions in `apps/api/src/routes/review/` — `POST /review-items/:id/reactions` (emoji-allowlist schema, rate-limited, emit the `review-items-changed` event). (Depends on T010, T019.)
- [X] T023 [US1] `CommentComposer` in `apps/web/src/components/review/composer.tsx` — selection→anchor capture (via T012), body input with emoji picker, submit for new comment and reply; body rendered through the **existing sanitizer** (no fork). (Depends on T014.)
- [X] T024 [P] [US1] `ReviewThreadCard` + `ReactionBar` in `apps/web/src/components/review/thread-card.tsx` — Card + status Badge + author avatar/timestamp + reply/resolve controls + per-emoji reaction chips (who-reacted, toggle). Real user avatars, initials fallback; Lucide chrome icons. (Depends on T014.)
- [X] T025 [US1] `CommentRail` in `apps/web/src/components/review/comment-rail.tsx` — right-side panel with its own toolbar (filter: **Open** = default, hides resolved; **All** = includes resolved, satisfying FR-004's "retrievable via filter"; **Tasks**; + item count + document-scope ⋯ + collapse), thread list, mounted as a collapsible `react-resizable-panels` panel clamped to ~280–420 px in `project-editor-layout.tsx`. (Depends on T024.)
- [X] T026 [US1] Panel entry/link wiring — top-right `ReviewToggle` (persistent, open-count badge, restores a hidden panel); clicking an editor pin/highlight **or** a preview marker opens the panel and focuses that thread (**FR-005** auto-open); hovering a thread card or focusing its composer emphasizes the passage via the T013 active class (**FR-028**, transient/no-scroll). Shared `hoveredItemId`/`activeThreadId` view state. (Depends on T013, T025.)
- [X] T027 [US1] Sequential navigation + visibility — next/prev stepping through open items in document order with an include-resolved option, revealing+selecting each passage (**FR-025**); comments panel show/hide persisted as a **per-user** preference on `EditorPreferences` (**FR-023**, Principle VII). (Depends on T025.)
- [X] T028 [US1] E2E in `apps/web/e2e/review-comments.spec.ts` — comment→reply→resolve across two sessions, emoji in body, reaction toggle, next/prev navigation, and hide/show panel without data loss. (Depends on T020–T027.)

**Checkpoint**: US1 fully functional and demoable — MVP.

---

## Phase 4: User Story 2 - Track review work as assignable tasks (Priority: P2)

**Goal**: Promote comments to tasks with status/assignee/due date and a project-wide task panel.

**Independent Test**: Convert a comment to a task, assign it, set in-progress; assignee opens the project task panel filtered to "assigned to me", sees it, resolves it.

- [X] T029 [P] [US2] `ConvertToTask` use case in `packages/domain/src/use-cases/review/convert-to-task.ts` — comment↔task both ways; task gains default `status=OPEN`; revert clears status/assignee/dueDate; preserves thread, author, anchor (FR-010).
- [X] T030 [P] [US2] `AssignTask` use case in `packages/domain/src/use-cases/review/assign-task.ts` — set/clear assignee (project member) and optional due date; updatable; audit assign.
- [X] T031 [P] [US2] `SetTaskStatus` use case in `packages/domain/src/use-cases/review/set-task-status.ts` — OPEN/IN_PROGRESS/RESOLVED/WONTFIX; **the sole resolution path for tasks** — stamps `resolvedAt`/`resolvedById` via the same shared stamp helper as T017 on RESOLVED/WONTFIX; reopen clears them (data-model §Resolution authority).
- [X] T032 [P] [US2] `ListReviewItems` (project-wide) use case in `packages/domain/src/use-cases/review/list-project-review-items.ts` — filters `assigneeId` / `status` / `documentId`; tenant-filtered; returns document + passage context.
- [X] T033 [US2] API `PATCH /review-items/:id` (convert / assign / set-status / due date / reopen) and `GET /review-items?assigneeId=&status=&documentId=` in `apps/api/src/routes/review/`. (Depends on T010, T029–T032.)
- [X] T034 [US2] Task affordances on the thread card in `apps/web/src/components/review/thread-card.tsx` — convert-to-task, assignee picker, status chip, due-date control. (Depends on T024, T033.)
- [X] T035 [US2] `TaskPanel` (project-wide) in `apps/web/src/components/review/task-panel.tsx` — cross-document list with assignee=me / status / document filters and passage context. (Depends on T033.)
- [X] T036 [US2] E2E extension — convert→assign→set-status→project task panel filter to "assigned to me". (Depends on T033–T035.)

**Checkpoint**: US1 + US2 both independently functional.

---

## Phase 5: User Story 3 - Comments stay attached while the document changes (Priority: P2)

**Goal**: Anchors follow concurrent edits; graceful degradation quote→section→detached instead of mis-pointing or loss.

**Independent Test**: Insert/delete large text around a comment (highlight holds); delete the commented text (degrades to section); remove the section (moves to detached tray).

- [X] T037 [US3] Extend `apps/web/src/lib/review/anchor.ts` with degradation — re-anchor from the text-quote when the RelativePosition fails; fall back to the enclosing section symbol via the existing `ProjectSymbolIndex`/outline; detect the detached case; derive `anchorState` (LOCATED/SECTION/DETACHED). Any quote-matching regex MUST be linear-time (Constitution IX). (Depends on T012.)
- [X] T038 [P] [US3] `ReanchorReviewItem` use case in `packages/domain/src/use-cases/review/reanchor-review-item.ts` — manual reattach of a SECTION/DETACHED item to a new range → LOCATED; audit.
- [X] T039 [US3] Persist anchor-state changes and add `POST /review-items/:id/reanchor` in `apps/api/src/routes/review/` (rate-limited, emit the `review-items-changed` event). (Depends on T010, T038.)
- [X] T040 [US3] Section-level presentation + `DetachedTray` in `apps/web/src/components/review/detached-tray.tsx` — "on this section" indicator, per-document detached tray with reattach/resolve; resolved items don't re-anchor noisily. (Depends on T037, T025.)
- [X] T041 [US3] E2E — heavy concurrent insert/delete keeps the highlight on its passage (SC-002); delete commented text → section → detached tray survives; and a comment placed in an included/child-file region stays bounded to the editing document's `Y.Text` (spec Assumption L190; no cross-file ownership handling in v1). (Depends on T037–T040.)

**Checkpoint**: Anchors are trustworthy under live editing.

---

## Phase 6: User Story 4 - Only editors can comment; viewers can read (Priority: P3)

**Goal**: Enforce editors-only writes end-to-end and give viewers a clean read-only experience.

**Independent Test**: A viewer opens a document with items, sees them, finds no create/edit/delete controls, and any write API call returns audited 403; an editor has full controls.

- [X] T042 [US4] RBAC hardening + tests across every review write route — non-editor/owner receives typed `Forbidden` → 403, denial written to the audit trail; project-wide bulk-delete restricted to owner. Also assert the **success-path audit entries** (FR-019): create, resolve, assign, delete, and bulk-delete each write an `AuditLog` record with actor + target. Covers all routes in `apps/api/tests/routes/review/`. (Depends on T020–T022, T033, T039.)
- [X] T043 [US4] Viewer read-only experience in `apps/web/src/components/review/` — hide all create/reply/resolve/assign/convert/delete controls for viewers; render items read-only across rail, thread card, task panel, and detached tray. (Depends on T025, T034, T035, T040.)
- [X] T044 [US4] E2E — viewer sees items but no mutation controls and receives 403 on attempted writes; editor unaffected. (Depends on T042, T043.)

**Checkpoint**: Collaboration model enforced.

---

## Phase 7: User Story 5 - Manage and clean up review items (Priority: P2)

**Goal**: Permanent single delete (any editor/owner) and confirmed bulk delete at document scope (editor) and project scope (owner), all audited.

**Independent Test**: Editor deletes one comment (thread gone for all); clears a document's items; owner clears the whole project; editor never sees the project-wide option.

- [X] T045 [P] [US5] `DeleteReviewItem` use case in `packages/domain/src/use-cases/review/delete-review-item.ts` — any editor/owner; deleting a root cascades its thread + reactions; permanent (no trash); audit.
- [X] T046 [P] [US5] `BulkDeleteForDocument` use case in `packages/domain/src/use-cases/review/bulk-delete-for-document.ts` — editor; requires confirm; optional `expectedCount` optimistic check (→ conflict if live count differs); idempotent under concurrent trigger; audit.
- [X] T047 [P] [US5] `BulkDeleteForProject` use case in `packages/domain/src/use-cases/review/bulk-delete-for-project.ts` — **owner only**; requires confirm; audit; forbidden (audited) for non-owners.
- [X] T048 [US5] API `DELETE /review-items/:id`, `POST /documents/:documentId/review-items/bulk-delete`, `POST /review-items/bulk-delete` in `apps/api/src/routes/review/` — confirm/expectedCount schema, rate-limited, emit the `review-items-changed` event, 409 on count mismatch, 403 (audited) for the project route by non-owners. (Depends on T010, T045–T047.)
- [X] T049 [US5] Delete + bulk-delete UI in `apps/web/src/components/review/` — per-item delete in the thread ⋯; "delete all in this document" in the rail's document-scope ⋯; owner-only "delete all across the project" in the task panel; explicit confirm dialogs (with expected count). (Depends on T048, T025, T035.)
- [X] T050 [US5] E2E — single delete, document bulk-delete, project bulk-delete as owner, and editor does not see the project-wide option. (Depends on T048, T049.)

**Checkpoint**: All five stories independently functional.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [X] T051 [P] Deleted-user handling (FR-024) — author `null` renders as "Deleted user", assignee `null` as unassigned across all review surfaces; DTO mapping + web render; verify the schema's `onDelete: SetNull` keeps items and unassigns tasks. Tests in `packages/shared/tests/review/` + a web render test.
- [X] T052 Edge-case hardening (spec §Edge Cases) — concurrent resolve idempotency, empty/oversized selection anchor bounds, resolved items don't re-open/re-anchor, concurrent bulk-delete removes once, navigation with zero open items reports nothing (offers include-resolved). Add targeted tests across the relevant use cases + anchor lib.
- [X] T053 [P] Responsiveness check — panel + editor highlights stay responsive (< 1 s) with ≥ 200 review items on a document (SC-007) and next/prev < 1 s per step (SC-010); tune decoration/query batching if needed. No load/perf test framework added.
- [X] T054 Export cleanliness check (FR-017 / SC-005) — assert exporting/downloading a document with review items yields source with zero comment artifacts (the collab writeback flushes only `'codemirror'`).
- [X] T055 Run `quickstart.md` verification end-to-end (maps SC-001…SC-010), then the full quality-gate sweep (`pnpm gate` — lint, typecheck, unit + integration + security scan + e2e) and `/code-review` in a loop until zero findings (Constitution §End-of-Feature Verification).

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (P1)** → no deps.
- **Foundational (P2)** → after Setup; **blocks all stories**. Note the **gated migration T007** must be user-approved before T008/T009.
- **User stories (P3–P7)** → all after Foundational. Priority order P1(US1) → P2(US2, US3, US5) → P3(US4). US2/US3/US5 are mutually independent; US4 hardens/reads across whatever write paths exist.
- **Polish (P8)** → after the desired stories.

### Story dependencies

- **US1 (P1)**: after Foundational. No dependency on other stories. MVP.
- **US2 (P2)**: after Foundational; extends the shared thread card but is independently testable.
- **US3 (P2)**: after Foundational; extends the anchor lib; independent of US2.
- **US4 (P3)**: after Foundational; verification/read-only layer over existing write paths (strongest when US1/US2/US5 exist, but the RBAC checks live in the use cases from the start).
- **US5 (P2)**: after Foundational; independent of US2/US3.

### Within each story (via `/tdd`)

Red→green→refactor per task; entities/use-cases (domain) before routes (api) before UI (web) before E2E; each story ends green before the next priority.

### Parallel opportunities

- Setup: T001, T002 in parallel.
- Foundational: T003–T006 in parallel; T008/T009 in parallel after T007; T012 parallel with domain work.
- US1 use cases T015–T019 in parallel; then routes; T024 parallel with T023.
- US2 use cases T029–T032 in parallel. US5 use cases T045–T047 in parallel.
- Across teams: after Foundational, US1 / US2 / US3 / US5 can be staffed concurrently.

---

## Parallel Example: User Story 1 (after Foundational)

```text
# Domain use cases together (different files, ports+fakes ready):
/tdd T015 CreateReviewComment
/tdd T016 ReplyToThread
/tdd T017 ResolveReviewItem
/tdd T018 ListReviewItems (document)
/tdd T019 ReactToItem

# Then web card + composer in parallel:
/tdd T023 CommentComposer
/tdd T024 ReviewThreadCard + ReactionBar
```

---

## Implementation Strategy

- **MVP**: Setup → Foundational (approve T007 migration) → US1 → stop & validate two-collaborator review loop → demo.
- **Incremental**: add US2 (tasks), US3 (anchor durability), US5 (cleanup), then US4 (read-only polish) — each independently testable, none breaking prior stories.
- **Gate discipline**: commit only after green; migration is user-gated; comment bodies + reaction emoji stay behind the existing sanitizer + allowlist (never widened/forked); every query tenant-filtered by `projectId`.

## Notes

- Each task = one `/tdd` invocation (test + implementation together).
- [P] = different files, no incomplete dependency.
- **T007 is destructive/gated** — do not generate or apply the Prisma migration without explicit user approval.
- Design is frozen in plan.md §"Resolved layout"; the mockup is `https://claude.ai/code/artifact/c5c48095-b47b-4e83-b857-9d22b666e170`.
- After all tasks: full `pnpm gate` + `/code-review` loop to zero findings.
