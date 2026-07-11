# Review-Items Real-Time Signal — Align to the Project Event Bus (not the collab transport)

> **Pre-implementation correction.** Feature 038 has no code yet, so this is a *design-doc alignment*, not a migration of running code — there is no old pattern to coexist with or roll back. Fixing it now (before T011/T014) prevents drift from ever landing.

## Current State (as written in the design docs)

```
review mutation (REST API)
        │
        ▼
  ??? "broadcast over the existing collaboration transport"   ← contract §Real-time, tasks.md T011
        │
        ▼
   open web clients refetch
```

### Problems
- **Reinvents an existing abstraction (Constitution IV).** The codebase already has a per-project real-time channel: `file-tree-event-bus` → project SSE stream (`routes/projects/events.ts`), carrying `content-changed`, `main-file-changed`, and file-tree events (research D2/D4).
- **Wrong layer.** The review signal originates from an **API mutation**, not from a Yjs edit. Routing it through the collaboration/Hocuspocus transport pushes an app-domain concern into the sync layer the feature explicitly keeps clean ("not a new Yjs type") — then names that transport anyway.
- **Parallel channels.** A second real-time mechanism alongside the SSE bus means two things to secure, tenant-scope, test, and reason about.

## Target State

```
review mutation route (apps/api/src/routes/review/*)
        │  emit { type: 'review-items-changed', documentId } onto
        ▼
  per-project event bus  (apps/api/src/plugins/file-tree-event-bus.ts)
        │
        ▼
  project SSE stream  (apps/api/src/routes/projects/events.ts)
        │
        ▼
  use-review-items hook subscribes → refetch affected document's items
```

### Benefits
- Reuses the proven, tenant-scoped, already-tested bus + SSE path — no new transport.
- Keeps the collaboration/Yjs layer purely for document text (Constitution VIII, and the feature's own "source stays clean" stance).
- One real-time channel to secure and observe; SC-001 (< 2 s) inherits the existing latency profile.

## Migration Phases

### Phase 1: Correct the design docs (Estimated: <0.5 day)
**Goal**: The written contract matches the established pattern before any code is written.

- **Task 1.1**: In `contracts/review-comments-api.md` §Real-time, replace "over the existing collaboration transport" with "emitted onto the existing per-project event bus and delivered over the project SSE stream (`routes/projects/events.ts`)."
- **Task 1.2**: In `plan.md` Technical Context / Summary, correct the same wording (the "New comments broadcast … near-real-time" sentence).
- **Task 1.3**: Rewrite `tasks.md` **T011** to: "Add a `review-items-changed` event (payload includes `documentId`) to the per-project event bus, emitted by the review mutation routes, delivered on the existing project SSE stream; extend the web SSE subscriber to trigger a document-scoped refetch." Confirm **T014** (`use-review-items`) subscribes to that SSE event, not a collab-transport message.

**Coexistence**: N/A — greenfield feature, no existing review code.

### Phase 2: Implement on the event bus (folds into existing tasks)
**Goal**: Review mutations refresh open clients via the established path.

- **Task 2.1**: Emit the event from each review write route (create/reply/resolve/react/patch/reanchor/delete/bulk-delete) after the use case succeeds — the same seam those routes already have for validation/audit.
- **Task 2.2**: Register the `review-items-changed` event type on the per-project bus (payload `{ documentId }`); ensure it is tenant-scoped to the project like existing events.
- **Task 2.3**: In `use-review-items`, on receiving the event for the open document, refetch and re-resolve anchors against the live `Y.Text`.

## Coexistence Strategy
Not applicable — no old review-items pattern exists. The only "old vs new" is the **doc wording**, corrected in Phase 1 before code.

## Rollback Plan
Phase 1 is a doc edit (revert via git). Phase 2 rides the existing bus; if the event proves insufficient, the fallback is the client's existing periodic refetch — no new infrastructure to unwind.

## Success Criteria
- [ ] No design doc references a "collaboration transport" for the review signal.
- [ ] `review-items-changed` is emitted by the API review routes onto `file-tree-event-bus` and delivered via the project SSE stream.
- [ ] `use-review-items` refetches on that SSE event; no new Yjs type and no new WebSocket/broadcast channel introduced.
- [ ] Cross-collaborator visibility < 2 s (SC-001) with the reused path.
