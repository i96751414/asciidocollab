# Implementation Plan: Review Comments and Tasks

**Branch**: `038-review-comments-tasks` | **Date**: 2026-07-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/038-review-comments-tasks/spec.md`

## Summary

Editors attach threaded, resolvable **comments** and lifecycle-bearing **tasks** to passages of an AsciiDoc document while collaborating live. Comments and tasks are one entity (`kind`) so promotion/assignment is cheap; they carry emoji bodies and emoji reactions, are deletable individually and in bulk, and survive concurrent editing via edit-resilient anchors that degrade section → detached rather than being lost.

**Technical approach**: PostgreSQL is the **system of record** (a `ReviewComment` aggregate + `ReviewReaction`), reached only through the **REST API** so authorization, validation, and audit are server-enforced. Anchors are an encoded **Yjs `RelativePosition`** over the shared `Y.Text('codemirror')` (auto-follows concurrent edits), backed by a **text-quote** `{prefix, exact, suffix}` + line hint and a **section-symbol** fallback from the existing `ProjectSymbolIndex`. Highlights render as additive CodeMirror decorations (reusing the `asciidoc-block-decorations` pattern); the `.adoc` source is never touched (writeback flushes only `'codemirror'`). Business logic lives in `packages/domain` use cases behind ports with in-memory fakes; the Prisma adapter lives in `packages/infrastructure`; DTOs in `packages/shared`. The **final UI is iterated in Claude Design** against the already-synced *asciidocollab Design System* before implementation.

## Technical Context

**Language/Version**: TypeScript (Node ≥ 24), React 19 / Next.js 16 (web), Fastify (api)

**Primary Dependencies**: Prisma 7 + PostgreSQL (`@asciidocollab/db`); Yjs 13 + Hocuspocus 4 (`apps/collab`); CodeMirror 6 + `y-codemirror.next` (editor); existing `ProjectSymbolIndex` / outline / `asciidoc-block-decorations`; existing HTML sanitizer; `AuditLog`; existing per-project event bus (`file-tree-event-bus`) + project SSE stream (`routes/projects/events.ts`) for the near-real-time `review-items-changed` signal (research D2/D4 pattern — no new transport)

**Storage**: PostgreSQL — new `ReviewComment` and `ReviewReaction` tables alongside `Document`/`CollaborationSession`. Serialized anchor lives on the row. Comments are **not** stored inline in the `.adoc` source and **not** in the Yjs document.

**Testing**: Jest (ts-jest) with in-memory fakes for domain use cases; integration tests against a real Postgres for the Prisma adapter; Playwright e2e for the editor flows. No performance/load tests (Principle II — not requested).

**Target Platform**: Linux server + modern web browser (existing web editor)

**Project Type**: Web application — modular monolith, Clean/onion architecture

**Performance Goals**: new comment visible to collaborators < 2 s (SC-001); ≥ 99% of highlights stay on their passage after 100 unrelated edits (SC-002); panel + highlights responsive < 1 s with ≥ 200 comments (SC-007); next/prev navigation < 1 s/step (SC-010)

**Constraints**: source stays clean (FR-017); editors-only writes (FR-016); multi-tenant isolation by project; comment bodies + reactions are untrusted input (Constitution IX); panel visibility is a per-user preference (Principle VII)

**Scale/Scope**: existing project/document scale; a document may carry ≥ 200 review items; reactions bounded to a validated emoji set

## Constitution Check

*GATE: passes. Re-checked after Phase 1 design — still passes; no violations to justify.*

| Principle | Assessment |
|---|---|
| **I. Clean Code** | PASS — small use cases, intent-revealing names (`CreateReviewComment`, `ResolveReviewItem`), typed domain errors. |
| **II. TDD (NON-NEGOTIABLE)** | PASS — each domain use case built via `/tdd` with in-memory `ReviewCommentRepository`/`ReviewReactionRepository` fakes; Prisma adapter via integration tests. No perf/load tests added (opt-in). |
| **III. Seam testing with fakes** | PASS — every new port gets an in-memory fake under `tests/`. No mocking libraries for repositories. |
| **IV. Reuse before rebuild** | PASS — reuse Yjs `RelativePosition` (no hand-rolled OT), the W3C-style quote-selector pattern, existing decoration/outline/`ProjectSymbolIndex`, `AuditLog`, and the existing sanitizer. Nothing re-derived. |
| **V. Theming via design tokens** | PASS — the comments/tasks panel, thread, chips, and task view style through the design-token system, correct in light **and** dark. UI iterated in Claude Design against the synced *asciidocollab Design System* (`5fb9ab6c-…`). |
| **VI. Style isolation** | N/A for document-render styles — the panel is app chrome, token-driven; no preview stylesheet touched. |
| **VII. Per-user prefs vs shared-content immutability** | PASS — **panel show/hide is a per-user preference** persisted on `EditorPreferences` (user-scoped, never on shared content). Comments/tasks are **shared project content**, permission-gated, and **never rewrite the document source** (FR-017). |
| **VIII. Editor pipeline integrity** | PASS — highlights are additive decorations; the sanitizer and scroll-sync seams are **not** modified or widened. Comment-body rendering uses the existing sanitizer, not the preview path. |
| **IX. Untrusted input boundary (NON-NEGOTIABLE)** | PASS with explicit design — comment/reply bodies and reaction emoji are validated at the API boundary (Fastify schema) and **sanitized through the existing sanitizer before rendering** in the panel; reactions restricted to a validated unicode-emoji allowlist; any quote-matching regex is linear-time. No sanitizer bypass or fork. |

**Architecture Constitution**: domain zero-dep + ports; infrastructure implements ports; DTOs in `packages/shared`; DI at the composition root; `Result<T,E>` for fallible domain/app ops; RBAC + tenant filter enforced in use cases and at the repository. Tests live under `tests/` mirroring source (no `__tests__/`).

**Security Constitution**: permission checks in use cases (not just routes); multi-tenant isolation at the repository (every query filtered by `projectId` + membership); typed errors (no info leak); per-route rate-limit **decision recorded** (create/reply/bulk-delete are limited; reads may skip with a recorded reason); authorization denials audited; no direct DB access from the frontend.

**Database migration note**: a Prisma migration is required (two new tables). Per the Architecture Constitution, **the migration will NOT be generated/applied without explicit user approval** — flagged as a gated task.

## Project Structure

### Documentation (this feature)

```text
specs/038-review-comments-tasks/
├── plan.md              # This file
├── research.md          # Phase 0 — decisions & rationale
├── data-model.md        # Phase 1 — entities, schema, DTOs, state
├── quickstart.md        # Phase 1 — run/test/design-iteration guide
├── contracts/
│   └── review-comments-api.md   # REST endpoints + schemas + rate-limit decisions
└── tasks.md             # Phase 2 — created by /speckit-tasks (NOT here)
```

### Source Code (repository root)

```text
packages/shared/src/review/            # DTOs + shared error types (ReviewItemDTO, AnchorDTO, ReactionDTO, kind/status enums)
packages/domain/src/
├── entities/review-comment.ts         # ReviewItem aggregate (comment|task), Reaction; invariants + state transitions
├── ports/review/
│   ├── review-comment.repository.ts   # port: CRUD, list-by-document, list-by-project, thread ops
│   └── review-reaction.repository.ts  # port: add/remove/list reactions
└── use-cases/review/                  # CreateReviewComment, ReplyToThread, ResolveReviewItem,
                                       #   ConvertToTask, AssignTask, SetTaskStatus, DeleteReviewItem,
                                       #   BulkDeleteForDocument, BulkDeleteForProject, ReactToItem, ListReviewItems
packages/infrastructure/src/persistence/review/
├── prisma-review-comment.repository.ts
└── prisma-review-reaction.repository.ts
packages/db/prisma/schema.prisma       # + model ReviewComment, ReviewReaction, enums ReviewItemKind/ReviewItemStatus

apps/api/src/routes/review/            # REST controllers → delegate to use cases; Fastify schema validation
apps/api/src/di                        # wire new repositories to ports at composition root (existing di/repositories.ts)

apps/web/src/
├── components/review/                 # CommentPanel, TaskPanel (project-wide), Thread, Composer, DetachedTray, ReactionBar
├── lib/codemirror/review-decorations.ts   # highlight layer (reuses asciidoc-block-decorations pattern) + gutter markers
├── lib/review/anchor.ts               # relpos encode/decode + quote fallback + section fallback + orphan detection
└── hooks/use-review-items.ts          # fetch; subscribe to the project SSE `review-items-changed` event; resolve anchors against live Y.Text

tests/  (mirroring source, per Architecture Constitution — never __tests__/)
├── packages/domain/tests/use-cases/review/ + in-memory fakes for both ports
├── packages/infrastructure/tests/persistence/review/   # integration vs real Postgres
├── apps/api/tests/routes/review/
└── apps/web/e2e/review-comments.spec.ts
```

**Structure Decision**: Web application on the existing modular-monolith / onion layout. New code slots into the established rings — pure entity + ports + use cases in `domain`, Prisma adapters in `infrastructure`, DTOs in `shared`, controllers in `apps/api`, editor/panel UI in `apps/web`. No new package or architectural layer is introduced.

## Design Iteration (Claude Design)

Per the request, the final UI is prototyped and iterated in **Claude Design** before implementation, using the already-synced **asciidocollab Design System** (`https://claude.ai/design/p/5fb9ab6c-45a8-4812-80ed-a39750386c01`) so every screen is built from the real `Card`, `Badge`, `Button`, `Input`, `DropdownMenu`, etc.

Surfaces to prototype and review with stakeholders:
1. **In-editor comment thread** — anchored highlight + popover/side panel thread (Card + Badge status + Composer with emoji + ReactionBar + Reply/Resolve).
2. **Document comments/tasks panel** — list with passage context, filters, show/hide, next/prev navigation.
3. **Project-wide task panel** — cross-document task list (assignee = me / status / document filters).
4. **Detached-comments tray** — orphaned items with reattach/resolve.
5. **Delete & bulk-delete** — confirm dialogs (document scope vs owner project-wide).

Output of this step: agreed layouts feeding the `apps/web/src/components/review/` component breakdown. This is a design gate, not a code artifact; it precedes the Phase-2 UI tasks.

### Resolved layout (design iteration outcome)

The proposal was iterated to a frozen layout (high-fidelity mockup on the real design tokens: `https://claude.ai/code/artifact/c5c48095-b47b-4e83-b857-9d22b666e170`). Decisions the UI tasks MUST honor:

- **Panel placement — comments live on the RIGHT.** The left rail stays navigation-only (file tree / outline / search, mutually-exclusive tabs). Comments/tasks and the preview are document-content surfaces and belong on the right, matching the marginalia convention (Docs/Word/Notion/GitHub) and — decisively — because comments must **coexist** with the outline rather than compete for the single left-tab slot.
- **Two independent, separately-collapsible panels**, not two tabs sharing one width. **Preview** = wide reading surface with its own toolbar (Style · Sync · Re-render · Fullscreen · collapse). **Comments** = slim rail clamped to ~280–420 px with its own toolbar (filter Open/All/Tasks · prev/next nav · document-scope ⋯ · collapse). Panel order is `nav · editor · preview · comments`; editor+preview stay adjacent for scroll-sync. Built on the existing `react-resizable-panels` with per-panel min/max + independent collapse (per-user view state — Constitution VII).
- **Unified "Comments & tasks"** surface with an Open / All / Tasks filter — NOT separate comment and task tabs next to the preview.
- **Re-opening a closed comments panel** — three affordances, all right-anchored: (1) a **persistent top-right toolbar toggle** carrying the open-item count, present whether open or closed; (2) clicking a **pin/highlight in the editor**; (3) clicking a **marker in the preview**. Clicking any indicator auto-restores the panel and focuses that thread (**FR-005**). The left navigation rail does NOT own this toggle.
- **Two-way highlight linkage (FR-028)** — hovering a thread card, or focusing its composer/edit field, emphasizes that item's passage in the editor (a stronger `Decoration.mark` class over the resting underline). Transient/read-only, and does NOT scroll — distinct from click-to-navigate (FR-005).
- **Iconography & content** — Lucide line icons for all UI chrome (the app already uses `lucide-react`); emoji reserved for user content only (comment bodies, reactions). Avatars are the users' real avatars (initials only as fallback). Every surface styled through the tokens, correct in light and dark.
- **Responsive fallback** — on a tight viewport the comments rail overlays the preview as a right-side drawer instead of squeezing all columns.

These map onto the `components/review/*` breakdown: a `ReviewRail` (toolbar + filter + thread list), `ReviewThreadCard` (Card + Badge + ReactionBar + Composer), the top-bar `ReviewToggle` (count badge), and the editor/preview marker decorations wired to shared `hoveredItemId` / `activeThreadId` view state.

## Complexity Tracking

> No Constitution violations — no entries required.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|--------------------------------------|
| — | — | — |

## Phase Notes

- **Phase 0 (research.md)**: resolves anchoring strategy, real-time propagation channel, sanitization approach, deleted-user handling, and reaction storage. No open `NEEDS CLARIFICATION` remain.
- **Phase 1 (data-model.md, contracts/, quickstart.md)**: entities + Prisma models + DTO shapes + REST contract with per-route rate-limit decisions + run/test/design guide. CLAUDE.md agent context updated to reference this plan.
- **Phase 2 (/speckit-tasks)**: generates `tasks.md`. Each functional deliverable = one `/tdd` invocation (Principle II). The Prisma migration is a gated, user-approved task.
