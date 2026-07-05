# Implementation Plan: Collaborative Consistency of Attribute/Symbol-Derived State

**Branch**: `036-symbol-collab-consistency` | **Date**: 2026-07-05 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/036-symbol-collab-consistency/spec.md`

## Summary

Keep an open AsciiDoc document's attribute/symbol-derived views (preview, editor highlighting, inherited attributes, heading IDs, outline, and rename suggestions) consistent with collaborators' live and saved edits to the files it depends on — without the client fanning out a live collaborative connection per related file (the current feature-032 design, which overloaded the collab backend and was gated on outline visibility).

**Technical approach**: replace the client-held per-file Hocuspocus observers with a **server-originated "content-changed" signal delivered over the existing per-project SSE channel**. The collab server (the only place that sees unsaved live edits) and the API content-save path each emit a debounced, bare `{ fileNodeId }` signal; the API fans it out on the existing `fileTreeEventBus` → `GET /projects/:id/events` SSE → the existing SharedWorker. In the client, `useProjectSymbolIndex` gains a handler that, when the changed file is in the open document's dependency graph, invalidates that file in its content cache, rebuilds, and bumps the existing `reachableDocVersion` counter — re-fetching the file's current content through the already **live-aware** `GET …/content` endpoint. The Hocuspocus observer machinery and the `observeReachableDocuments` gating are removed, which makes consistency panel-independent (FR-016) and collapses the per-client connection count to one SSE (SC-007). Rename freshness (FR-010) is achieved by re-running the already-live-aware `/symbol-usages` query on relevant signals while a suggestion is visible.

The notification payload is a **bare file-id signal** (not content or a resolved delta): the `/content` endpoint is already live-aware, so pushing content would be redundant and would introduce a new untrusted-content path; re-fetching reuses the existing authorized, sanitized pipeline (Principles VIII/IX). No database schema changes; no new persistent entities.

## Technical Context

**Language/Version**: TypeScript (strict), Node 24. Web = Next.js 16 (App Router, React 19) client component; API = Fastify; Collab = Hocuspocus 4.1 (`@hocuspocus/server`).

**Primary Dependencies**: existing only — Yjs `Y.Text`, Hocuspocus, `EventSource`/`SharedWorker` (SSE), CodeMirror 6, `@asciidocollab/asciidoc-core` (zero-dep parser, already used web-side and in the domain). No new runtime dependency.

**Storage**: PostgreSQL via Prisma — **unchanged**. No schema change, no migration. The dependency graph is computed (client include graph + existing server-side domain resolution for rename); notification state is transient/in-process.

**Testing**: Jest + Testing Library (unit); in-memory fakes for any domain port (Principle III); testcontainers for infrastructure integration; Playwright two-client E2E for the cross-file scenarios (reuses the feature-032/033 patterns and stack).

**Target Platform**: Browser (editor client) + Node services (API, collab). Linux server deploy.

**Project Type**: Web application — modular monolith (`apps/web`, `apps/api`, `apps/collab`; `packages/*`).

**Performance Goals**: Best-effort/eventual — **no fixed latency target** (spec clarification 2026-07-05). Convergence after quiescence; per-client connection fan-out bounded and near-constant (one SSE); no measurable regression to local typing latency (SC-011, verified qualitatively — see Constitution Check, Principle II).

**Constraints**: Reuse the existing SSE (`/events` + `fileTreeEventBus` + SharedWorker), the existing internal collab↔API channels (loopback/mTLS), the live-aware `…/content` and `…/symbol-usages` endpoints. No change to the preview sanitizer or the scroll-sync seam. No per-file client sockets. Events strictly project-scoped (membership-gated).

**Scale/Scope**: Project-scoped. Notification cost is O(open clients per project), not O(related files). Collab→API notify is one debounced internal call per changed room.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Assessment |
|---|---|
| **I — Clean Code** | New code is small, named by intent, typed errors; no magic literals (debounce/window are config-driven, see security note). PASS. |
| **II — TDD (NON-NEGOTIABLE)** | Every task runs via `/tdd`. Domain logic (yjsStateId→fileNode mapping if placed in a use-case; relevance helpers) uses in-memory fakes; API routes get route tests; collab notifier gets integration tests; client handler gets hook/component tests; two-client E2E covers SC-001/002/003/009/010. **Perf/latency is opt-in (Principle II)**: the spec sets *no* numeric target, so SC-011 ("no measurable typing regression") is validated as a qualitative check in quickstart, **not** an automated latency benchmark. PASS. |
| **III — Seam testing with in-memory fakes** | Any new domain port has an in-memory fake under `packages/domain/tests/ports/`. PASS. |
| **IV — Reuse before rebuild** | Reuses SSE transport, event bus, SharedWorker, internal collab↔API endpoints, live-aware `/content` and `/symbol-usages`, and the existing client recompute seam (`reachableDocVersion`/`build`). Net **deletes** the observer machinery. PASS (strong reuse). |
| **V — Theming via tokens** | The only new UI — the subtle "some inputs are last-saved (non-live)" indicator (FR-021) — MUST use design tokens and be correct in light/dark. Tracked as a task acceptance criterion. PASS with note. |
| **VI — Style isolation** | The indicator lives in app chrome, not the preview surface; no document-rendering styles touched. PASS. |
| **VII — Per-user prefs / shared-content immutability** | No new preference. No shared-content mutation (this is read-side consistency; the rename **apply** reuses the existing collaboration-aware path unchanged). Main-file remains existing project config. PASS. |
| **VIII — Editor pipeline integrity** | **No sanitizer change and no scroll-sync change.** Assembled/resolved preview content continues through the *existing* sanitizer unchanged; this feature only changes the *trigger* that causes a recompute. The new SSE event carries a bare `fileNodeId` — no markup — and the client re-fetches via the existing sanitized path. Called out here per the principle. PASS. |
| **IX — Untrusted input boundary (NON-NEGOTIABLE)** | No new content path. Path resolution (includes/images) stays sandbox-confined via the existing centralized resolver; the notification adds no new fetch target. Events are project-scoped and membership-gated (existing `/events` auth), matching the verified "project-membership access; no per-file ACL" assumption — no cross-project disclosure. PASS. |
| **Data isolation (security)** | Events filtered by `projectId`; SSE subscription already enforces membership. PASS. |
| **DB migration policy** | No schema change → no migration → no user ask required. PASS. |
| **Rate limiting (security)** | No new *public* amplifying endpoint. `/events` (SSE) already exists and is authenticated/membership-gated; the collab→API notify endpoint is on the **internal** loopback/mTLS server (not internet-facing); the client's `/content` re-fetch is an existing authenticated route and is bounded by the collab-side debounce + client coalescing (FR-020). Justified "no new limit" recorded here per the security constitution's documented-decision rule. PASS. |
| **Architecture layering** | Business logic stays in domain/use-cases; routes and the collab notifier are thin delivery (mirrors how existing file-tree routes emit on the bus after a use-case). No domain→infra import. PASS. |

**Result: PASS — no violations. Complexity Tracking not required.**

## Project Structure

### Documentation (this feature)

```text
specs/036-symbol-collab-consistency/
├── plan.md              # This file
├── research.md          # Phase 0 — decisions (transport, placement, payload, relevance, churn)
├── data-model.md        # Phase 1 — event DTOs, entities, no DB change
├── contracts/           # Phase 1 — SSE event + internal notify endpoint + client recompute behavior
│   ├── sse-content-changed-event.md
│   ├── internal-collab-content-changed.md
│   └── client-recompute-behavior.md
├── quickstart.md        # Phase 1 — two-client validation mapped to SCs
├── checklists/
│   └── requirements.md  # (from /speckit-specify)
└── tasks.md             # Phase 2 — created by /speckit-tasks (NOT here)
```

### Source Code (repository root — files this feature touches)

```text
packages/shared/
└── src/dtos/
    ├── file-tree-event.dto.ts        # reused; content-changed is a sibling type
    └── project-event.dto.ts          # NEW: discriminated union { file-tree | content-changed | main-file-changed }

apps/collab/
└── src/
    ├── extensions/change-notifier.ts # NEW: onChange (+ beforeHandleMessage) → debounced notify → API internal
    ├── composition-root.ts           # wire the notifier extension
    ├── config/collab-config.ts       # NEW config: notify URL, debounce window (env-driven)
    └── server.ts                     # register onChange hook

apps/api/
└── src/
    ├── routes/internal/collab-content-changed.ts  # NEW internal route (collab → API)
    ├── internal-server.ts                         # register the internal route
    ├── plugins/file-tree-event-bus.ts             # emit content-changed + main-file-changed events (shared per-project bus)
    ├── routes/projects/events.ts                  # carry the content-changed + main-file-changed event types on the SSE
    ├── routes/projects/file-content.ts            # PUT save path also emits content-changed (sessionless writes)
    └── routes/projects/main-file.ts               # PUT main-file setting emits main-file-changed (FR-009)

apps/web/
└── src/
    ├── workers/file-tree-events.worker.ts   # fan out the full ProjectEventDto union (content-changed + main-file-changed)
    ├── hooks/use-file-tree-events.ts        # surface content-changed + main-file-changed to subscribers
    ├── hooks/use-project-symbol-index.ts    # NEW content-changed + main-file-changed handlers; REMOVE observer fan-out + gating
    ├── app/(dashboard)/dashboard/projects/[id]/project-editor-layout.tsx  # drop observeReachableDocuments wiring; add non-live indicator state
    ├── lib/codemirror/rename-suggestion/rename-suggestion-state.ts        # re-query usages on content-changed while visible
    └── components/…/non-live-indicator.tsx  # NEW subtle indicator (tokens, light/dark)
```

**Structure Decision**: No new package or app. Changes are additive-then-subtractive within the existing `packages/shared`, `apps/collab`, `apps/api`, and `apps/web`. The net effect **removes** the `apps/web` Hocuspocus observer subsystem introduced in feature 032 and replaces its trigger with the existing SSE channel; the recompute pipeline (`build`/`reachableDocVersion`/content cache) and all downstream consumers (preview worker, `inheritedAttributesField`, outline, rename) are reused unchanged.

## Complexity Tracking

No Constitution violations — table intentionally empty.

## Requirement Applicability & Accepted Deviations

These are not violations; they record where the chosen backend-authoritative design intentionally realizes a requirement's *outcome* rather than its literal mechanism, so reviewers don't read the absence as a gap.

- **FR-023 (server-targeted delivery)** — satisfied by **outcome**: the API broadcasts a bare `content-changed`/`main-file-changed` to the project's SSE subscribers and each client filters relevance against its own include graph (`built.tree.nodes`), rather than the server maintaining a per-connection→open-document registry and delivering to *exactly* the affected documents. Same observable behavior (only affected documents recompute; no client polling/fan-out), far less state. Server-targeted delivery is recorded as a deferred optimization (research D4).
- **FR-022 / SC-012 (impact-priority tiers, ≈25 cap)** — **intentionally unimplemented**. The spec clarification (2026-07-05) declares the cap/slot/tier mechanics to be implementation details of the *rejected* client-observation fallback, not spec guarantees. Under broadcast+client-filter every relevant change is delivered, so Tier-1-before-Tier-2 ordering is moot. If the client-observation fallback is ever revived, FR-022's ordering and FR-014's cap+poll re-apply and MUST be surfaced as non-live (FR-021).
- **FR-009 (main-file change)** — a project-*setting* change emits no `content-changed`; it is propagated by a dedicated `main-file-changed` event on the same union transport, triggering an unconditional re-resolve in every open document (tasks Phase 8).
- **SC-011 (typing-latency)** — qualitative only (Constitution Principle II: performance tests are opt-in; the spec sets no numeric target). Validated in quickstart, not as an automated benchmark.

## Phase 2 (next)

`/speckit-tasks` will decompose this into `/tdd`-driven tasks (one deliverable = one task). Suggested slices align to the P1 user stories: (1) SSE transport end-to-end (shared DTO union → API emit on save → worker → client handler → recompute), (2) collab live-edit notifier (onChange → debounced internal notify), (3) remove observer machinery + panel-independence, (4) main-file-change propagation (FR-009, `main-file-changed` on the same transport), (5) non-live indicator, (6) rename-suggestion live re-query. Each is independently testable per the spec's Independent Test notes.
