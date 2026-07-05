# Phase 1 Data Model: Collaborative Consistency of Attribute/Symbol-Derived State

**No database schema changes.** No new persistent entities, no Prisma migration. All new state is transient (in-process event bus, client caches) or DTOs on the wire. Entities below are runtime/transport shapes.

## New DTOs (`packages/shared/src/dtos/`)

### `ContentChangedEventDto`
A server-originated signal that a file's content changed (live or saved). **Bare identifier only — carries no document content** (research D3).

| Field | Type | Notes |
|---|---|---|
| `type` | `'content-changed'` | Discriminator. |
| `fileNodeId` | `string` (uuid) | The file whose content changed. |

### `MainFileChangedEventDto`
A server-originated signal that the project's designated **main file** setting changed (FR-009). A project-setting change (not a file-content edit), so it is a distinct signal — every open document must re-resolve its inherited context against the new anchor.

| Field | Type | Notes |
|---|---|---|
| `type` | `'main-file-changed'` | Discriminator. |
| `mainFileNodeId` | `string` (uuid) \| `null` | The new main file; `null` when the main file is cleared. |

### `ProjectEventDto` (discriminated union)
The event type carried by `GET /projects/:projectId/events`. Unifies the existing structural events with the new content and main-file events so the SSE stream, worker, and client handler share one type.

```
ProjectEventDto =
  | FileTreeEventDto          // existing: 'created' | 'deleted' | 'renamed' | 'moved'
  | ContentChangedEventDto    // new: 'content-changed'
  | MainFileChangedEventDto   // new: 'main-file-changed' (FR-009)
```

- `FileTreeEventDto` (`packages/shared/src/dtos/file-tree-event.dto.ts`) is reused verbatim.
- Consumers discriminate on `type`; the client applies file-tree events as today, content-changed events via the recompute path, and main-file-changed via an unconditional re-resolve (contracts/client-recompute-behavior.md).

### Internal notify request (collab → API), `apps/api` internal route body
| Field | Type | Notes |
|---|---|---|
| `projectId` | `string` (uuid) | Owning project. |
| `yjsStateId` | `string` (uuid) | The collab room's document id; the API maps it to `fileNodeId` via the document repository. |

Response: `{ ok: true }` (202/200). Validated with Fastify schema at the boundary.

## Reused / existing entities (no change)

- **Include / dependency graph** — computed client-side in `useProjectSymbolIndex` (`built.tree.nodes`) and server-side in the domain (`buildIncludeGraphWithInheritance`, `projectInheritedAttributes`) for rename. Relevance filtering (research D4) reuses the client graph; **not** newly persisted.
- **Content cache** — `contentCache: Map<fileNodeId, string|null>` in `useProjectSymbolIndex`; invalidated per `content-changed` event.
- **`reachableDocVersion`** — existing recompute fan-out counter; bumped after a rebuild triggered by a `content-changed` event.
- **Project Symbol Index / Inherited Attribute Context** — existing derived structures; recomputed by the existing pipeline, not redefined here.

## Transient state

- **Per-room notify debounce** (collab) — an in-memory timer keyed by room; not persisted.
- **`fileTreeEventBus`** — existing in-process `EventTarget` per project; now also carries `content-changed`.
- **Non-live indicator state** (client) — derived UI flag (some inputs resolved from last-saved content); ephemeral, per-open-document, not persisted (FR-021).

## Validation rules

- `fileNodeId` / `yjsStateId` / `projectId` MUST be valid UUIDs (Fastify schema at the internal route; DTO typing on the client).
- Events MUST be emitted only within the owning `projectId` scope; the SSE subscription already enforces project membership (no cross-project delivery — matches the verified access assumption).
- A `content-changed` event for the **open file itself** is ignored by the client (its editor holds the authoritative live copy); only reachable *non-open* files trigger the fetch+recompute path.
