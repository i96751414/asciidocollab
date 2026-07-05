# Phase 0 Research: Collaborative Consistency of Attribute/Symbol-Derived State

All items the spec deferred to planning are resolved below, grounded in the current code (file:line where load-bearing).

## D1 — Notification transport: existing per-project SSE

**Decision**: Deliver the server-originated relevant-change signal over the **existing** SSE channel: `GET /projects/:projectId/events` (`apps/api/src/routes/projects/events.ts`), backed by the in-process `fileTreeEventBus` (`apps/api/src/plugins/file-tree-event-bus.ts`), consumed by the existing `SharedWorker` (`apps/web/src/workers/file-tree-events.worker.ts`) and `useFileTreeEvents` hook. Add a new event *type* to the stream; do not add a new endpoint.

**Rationale**: One authenticated, membership-gated, per-project connection already exists and is **shared across tabs** via a `SharedWorker` — so fan-out is O(clients), not O(files), directly satisfying SC-007 and killing the feature-032 per-file-socket overload. It already carries structural file-tree events into the exact recompute seam we need (`useProjectSymbolIndex.handleEvent`).

**Alternatives considered**:
- *Yjs awareness / stateless broadcast on the `presence/<projectId>` room* — a scaffold exists but no server-initiated broadcast is wired, and it would add a second push mechanism. Rejected (more moving parts, no reuse).
- *A new dedicated WebSocket/SSE channel* — rejected; duplicates an existing, working transport.
- *Client polling* — rejected by the spec (unbounded staleness / load).

## D2 — Change-detection placement: collab (live) + API save path (persisted)

**Decision**: Emit the signal from **two source-of-truth points**, both funneling into `fileTreeEventBus.emit(projectId, { type: 'content-changed', fileNodeId })`:
1. **Collab server** — the only place that sees *unsaved* live edits. Add an `onChange` hook (Hocuspocus supports it; currently unused — `apps/collab/src/server.ts`) with a short per-room debounce, POSTing a bare `{ projectId, yjsStateId }` to a new API internal route. `beforeHandleMessage` (`server.ts:51`, already sees every raw update) is the fallback hook if `onChange` ergonomics disappoint.
2. **API content-save path** — `PUT …/content` (`apps/api/src/routes/projects/file-content.ts`) emits directly on the bus, covering saves to files with **no active collab session** (US6 acceptance #2).

**Rationale**: Live-session edits are a superset of saves for session files, but a sessionless write must still propagate; emitting at both choke points covers every path (US5/US6) with no polling. The collab server stays a **dumb relay** — it sends a bare "room changed" signal and does **no AsciiDoc parsing**; relevance is decided downstream (D4). This keeps business logic out of the delivery tier (architecture constitution) and avoids adding `@asciidocollab/asciidoc-core` to `apps/collab` for the MVP.

**Alternatives considered**:
- *Parse in collab to pre-filter relevance* — deferred; unnecessary for MVP because the client already holds the include graph (D4). Revisit only if broadcast chatter is measured to matter.
- *Detect only at persist (`onStoreDocument`, debounced 2–30s)* — rejected: too coarse for live unsaved edits, and the 30s max debounce would feel broken even under a best-effort target.

## D3 — Notification payload: bare `{ fileNodeId }` signal, client re-fetches

**Decision**: The event payload is a **bare file identifier** — no content, no resolved delta. On receipt, the client invalidates that file in its content cache and re-fetches via the existing `GET …/content` endpoint, which is **already live-aware** (`apps/api/src/routes/projects/file-content.ts` reads live Yjs text when a session is open, persisted otherwise).

**Rationale**: Pushing content would (a) duplicate the live-aware read that already exists, (b) create a *new* untrusted-content ingress that would have to be re-sanitized (Principle IX) — whereas re-fetch reuses the existing authorized+sanitized pipeline, and (c) bloat the SSE. A bare id is the smallest correct signal.

**Alternatives considered**: *Resolved delta* (server computes the new inherited-attribute/ID delta) and *assembled context* (server pushes the whole resolved context) — both increase server compute and payload and add content-path security surface; deferred as future optimizations only if re-fetch cost is shown to matter.

## D4 — Relevance: server-broadcast + client-side dependency filter (MVP)

**Decision**: The API broadcasts `content-changed { fileNodeId }` to the project's SSE subscribers; **each client decides relevance locally** — it applies the event only if `fileNodeId` is in its open document's dependency graph (`built.tree.nodes` in `useProjectSymbolIndex`), and ignores it otherwise (the open file itself keeps its own live editor sync). This realizes the spec's *outcome* (only affected documents recompute; no client fan-out; no polling) while reusing the include graph the client already computes.

**Rationale**: The SSE bus is project-scoped and does not track which document each connection has open; server-side targeted delivery (FR-023's strict reading) would require a per-connection→open-document registry and a server-side dependents computation duplicating the client's include-graph logic. Broadcast + client-filter delivers the same observable behavior at far lower complexity and state, and the client already has the graph.

**Alternatives considered / documented follow-up**: *Server-targeted delivery* — the domain already resolves include graphs server-side (`packages/domain/src/use-cases/content/project-inherited-attributes.ts`, `buildIncludeGraphWithInheritance`), so a future refinement could compute the affected set server-side and tag/target events if broadcast chatter is measured to be a problem. Recorded as a non-blocking optimization; the spec's FR-023 intent (server-originated detection, no client polling/fan-out) is met by the MVP.

## D5 — Remove the client observer machinery; consistency becomes panel-independent

**Decision**: Delete the feature-032 Hocuspocus observer subsystem in `apps/web/src/hooks/use-project-symbol-index.ts` (the `documentObservers` map, `createDocumentObserver`/`defaultCreateDocumentObserver`, the reconcile loop, and the `observeReachableDocuments` gating at `project-editor-layout.tsx:242`). Replace its `onUpdate` behavior with the SSE `content-changed` handler (invalidate cache for the file → `build()` → bump `reachableDocVersion`).

**Rationale**: With a server signal, the client no longer needs to hold live sessions to learn about peers' edits, so the gating that tied cross-file correctness to outline visibility (FR-016) disappears by construction, and per-file sockets/churn (FR-024) vanish. The downstream recompute (`reachableDocVersion` → preview worker, `inheritedAttributesField`, outline, rename) is untouched.

**Risk & mitigation**: this touches the code feature 032 hardened. The **existing 032 two-client outline E2E specs must continue to pass** (outline still updates live) — they become the regression guard for the transport swap. The full-document outline's live update for an *unrelated sibling's* headings remains gated to "while the outline is shown" per FR-016 (the client can skip recompute of purely-outline-only files when the outline is hidden).

## D6 — Churn, debounce, coalescing (FR-020, FR-024)

**Decision**: Debounce the collab-side per-room notifier (config-driven window, env-bound with a documented default) so a burst of keystrokes yields at most one notify per window; the client further coalesces re-fetch+rebuild per file. Session open/close does **not** change the client's dependency set (it is structural, from the include graph), so peer churn cannot reshuffle observers — there are no observers. SSE reconnect already triggers a full cache clear + rebuild (`handleReconnect`), covering dropped-connection recovery (FR-021).

**Rationale**: Best-effort latency (no numeric target) makes a debounce window purely a load/UX tuning knob; because the dependency set is structural, the whole "churn reshuffles subscriptions" failure mode is designed out.

## D7 — Rename-suggestion freshness (FR-010) reuses the live-aware endpoint

**Decision**: The rename suggestion's usage/collision query (`GET /projects/:projectId/symbol-usages`, `apps/api/src/routes/projects/refactoring.ts`) is **already live-aware** server-side (scans live Yjs for session files). The only change is client-side: while a suggestion widget is visible, re-run `findSymbolUsages` on a (debounced) `content-changed` signal so the reported counts/collision reflect peers' live edits before apply.

**Rationale**: No server change needed for rename freshness; reuse maximized. The apply/undo path (FR-011) is unchanged (existing collaboration-aware `apply-edits` internal endpoint).

## Open items intentionally left to implementation

- Exact debounce window default (collab notifier) — a config value, tuned during implementation; not a spec guarantee.
- Whether `content-changed` shares `FileTreeEventDto`'s stream as a union member or a sibling event name — a DTO-shape choice settled in data-model.md (union).
- Server-targeted relevance (D4 follow-up) — deferred optimization, out of MVP scope.
