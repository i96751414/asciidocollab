# Contract: client recompute on `content-changed`

**Component**: `apps/web/src/hooks/use-project-symbol-index.ts` (+ `use-file-tree-events.ts`, `workers/file-tree-events.worker.ts` fan-out; `rename-suggestion-state.ts`).

## Input

A `content-changed { fileNodeId }` frame from the project SSE stream (via the SharedWorker → `useFileTreeEvents`).

## Decision & effect

```
on content-changed(fileNodeId):
  if fileNodeId == openFileId:            ignore   # editor holds authoritative live copy
  else if fileNodeId ∉ built.tree.nodes:  ignore   # not in this document's dependency graph
  else:
    contentCache.delete(fileNodeId)               # force re-read
    build()                                       # re-fetches via live-aware GET …/content, re-resolves
      .then(() => reachableDocVersion += 1)        # fan out to preview/outline/highlighting/rename
```

- `build()` re-fetches only missing/invalidated files (existing `fetchReachableContent` fixpoint), so the cost is bounded to the changed file plus any newly-reachable files.
- The bump to `reachableDocVersion` is the **single** recompute fan-out signal; all consumers (preview worker via `getFiles`, `inheritedAttributesField`, heading IDs, `use-section-outline`, rename `getProjectIndex`) already depend on it — **unchanged**.
- Coalesce rapid frames per file (FR-020): at most one in-flight fetch+rebuild per file; supersede stale ones.

## Main-file change (FR-009)

A `main-file-changed { mainFileNodeId }` frame is handled separately from `content-changed`: the client updates its resolution anchor to `mainFileNodeId` and rebuilds **unconditionally** (no `built.tree.nodes` membership check — the anchor change can add/drop reachability for any open document), then bumps `reachableDocVersion`. `null` clears the anchor (open document resolves from its own attributes only).

## Coherent refresh (FR-018)

All derived views recompute from the **same** rebuilt index/content snapshot (one `build()` → one `reachableDocVersion` bump), so no view is updated while another stays stale.

## Panel independence (FR-016)

This handler runs whenever the document is open, independent of the outline panel. The **only** panel-gated behavior retained: recomputing the *full assembled outline* for a change to a file that affects **only** the outline (an unrelated sibling's headings, not the open doc's attributes/IDs) MAY be skipped while the outline is hidden.

## Removed behavior

The Hocuspocus observer subsystem (`documentObservers`, `createDocumentObserver`, reconcile loop, `observeReachableDocuments` gating) is deleted; this handler replaces its `onUpdate` role. The existing feature-032 two-client outline E2E specs are the regression guard.

## Non-live indicator (FR-021)

When a reachable file's current content could not be obtained live (fetch failure, or — in the retained client-observation fallback only — beyond a cap), the open document surfaces a **subtle, on-demand** indicator that some inputs are from last-saved content. Design-token styled, correct in light/dark, no disruptive warning.

## Rename freshness (FR-010)

While a rename suggestion widget is visible, a (debounced) `content-changed` for any project file re-runs `findSymbolUsages` (already live-aware server-side) so reference counts and collision state reflect peers' live edits before apply.
