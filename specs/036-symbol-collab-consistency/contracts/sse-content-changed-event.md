# Contract: `content-changed` SSE event

**Channel**: `GET /projects/:projectId/events` (existing SSE; `apps/api/src/routes/projects/events.ts`).
**Direction**: API → all project-member clients subscribed to the project's event stream.
**Auth**: unchanged — project-membership check on subscribe; TLS at the edge. No new endpoint, no new auth surface.

## Event frame

Server-Sent Event `data:` line is JSON:

```json
{ "type": "content-changed", "fileNodeId": "<uuid>" }
```

- Coexists on the same stream as the existing `FileTreeEventDto` frames (`created|deleted|renamed|moved`). Clients discriminate on `type`.
- Payload is **exactly** the file id — no content, no path, no user id.

## Emission

Emitted via `fileTreeEventBus.emit(projectId, { type: 'content-changed', fileNodeId })` from:
1. the API `PUT …/content` save path (sessionless and session saves), and
2. the API internal route that the collab server calls on a debounced live change (see `internal-collab-content-changed.md`).

Emission is **debounced/coalesced** at the collab source (config-driven window) so a keystroke burst yields at most one frame per window per file (FR-020).

## Client obligations (summary; full behavior in `client-recompute-behavior.md`)

- Ignore the frame if `fileNodeId` is the **open file** (its editor holds the authoritative live copy) or is **not in the open document's dependency graph**.
- Otherwise invalidate `fileNodeId` in the content cache, re-fetch via the live-aware `GET …/content`, rebuild, and bump `reachableDocVersion`.

## Non-goals

- No ordering or delivery guarantee beyond best-effort (SSE); a missed frame is recovered by the existing reconnect → full cache clear + rebuild.
- No latency SLA (spec: best-effort/eventual).
