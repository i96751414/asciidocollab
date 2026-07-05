# Contract: internal `content-changed` notify (collab → API)

**Endpoint**: `POST /internal/collab/content-changed` on the API **internal** server (`apps/api/src/internal-server.ts`, loopback `127.0.0.1:4001` by default).
**Direction**: collab server → API.
**Auth**: same defense-in-depth as the existing internal collab endpoints — loopback bind and, when configured, mTLS + shared-secret header (mirrors `collab-auth` / the collab internal edit server). **Not** internet-facing; no public rate limit required (justified per security constitution — see plan Constitution Check).

## Request

```json
{ "projectId": "<uuid>", "yjsStateId": "<uuid>" }
```

Fastify schema-validated at the boundary. Body cap consistent with the existing internal endpoints.

## Behavior

1. Map `yjsStateId` → `fileNodeId` via the document repository (thin lookup).
2. `fileTreeEventBus.emit(projectId, { type: 'content-changed', fileNodeId })`.
3. Return `{ "ok": true }` (200/202).

No business logic beyond the id mapping + emit (delivery-tier only; relevance is decided client-side per research D4).

## Caller (collab)

`apps/collab/src/extensions/change-notifier.ts`:
- On `onChange` for a content room (not a `presence/` room), start/refresh a per-room debounce timer (config window).
- On fire, POST the request above to the API internal URL (`apiInternalUrl`), reusing the existing `mtls-fetch` transport; tolerate failure (best-effort; the next change or a save re-notifies).
- Never blocks or delays the Yjs update path (runs off the hot path).

## Failure modes

- API unreachable / non-2xx → log and drop (best-effort); a later change, a save, or SSE reconnect recovers consistency.
- Unknown `yjsStateId` (no document) → API returns `ok: true` with no emit (nothing to notify).
