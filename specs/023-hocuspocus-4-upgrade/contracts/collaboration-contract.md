# Collaboration Contract (Parity Surface): Hocuspocus 4 Upgrade

This documents the collaboration interfaces that MUST remain behaviorally identical after the upgrade. It is a **parity contract**, not a new interface — every item is "same observable behavior, possibly new internal API form."

## 1. WebSocket wire protocol (server ↔ provider)

- Room naming stays `"<projectId>/<yjsStateId>"` (parsed by `parseRoomName`).
- A client connects, authenticates via the handshake, syncs the Yjs document, exchanges updates, and shares awareness — unchanged.
- Wire protocol is backward-compatible v3↔v4; a coordinated deploy is used, but transient version skew must fail safe (no content corruption).

## 2. Server configuration surface (`apps/collab/src/server.ts`)

`Server.configure({ ... })` with these behaviors preserved:

| Config / hook | Required preserved behavior |
|---|---|
| `port`, `debounce: 2000`, `maxDebounce` | Same values; `maxDebounce` derived from `collaboration.writeback_interval_seconds`. |
| `extensions` | `AuthHookExtension`, `ConnectionLimitExtension`, `PersistenceExtension` run in the same order. |
| `onConnect` | Parse room → look up document by `yjsStateId` → `onRoomOpen` (open session row) → reject (throw) on any failure (FR-011 lock). Stash `context.documentId` fast-path. |
| `onDisconnect` | On last client (`clientsCount === 0`), resolve documentId (context fast-path or lookup) → re-check `document.getConnectionsCount() > 0` → `onRoomClose`. |
| `beforeHandleMessage` | Reject updates larger than `maxPayloadBytes` with close code 1009. |

**Allowed internal change**: hook payload TypeScript shapes (web `Request`/`Headers`). **Not allowed**: any change to accept/reject decisions, ordering, session-row lifecycle, or close codes.

## 3. Auth extension contract (`AuthHookExtension`, security boundary)

Accept/deny decisions MUST be identical:

- **CSWSH Origin allowlist**: when `allowedOrigins` is non-empty, reject (close 1008) any handshake whose `Origin` is not allowlisted; empty list disables the check (dev).
- **Cookie auth handshake**: extract the session cookie, call the internal API auth endpoint, set `context.role` / `context.userId`, and set `connection.readOnly = (role === 'observer')`.
- **Required internal change**: read headers via the web `Headers` API — `requestHeaders.get('origin')`, `requestHeaders.get('cookie')` — replacing the `['origin'] ?? ['Origin']` pattern. Same inputs → same accept/deny outputs.

## 4. Connection-limit extension contract (`ConnectionLimitExtension`)

Per-user concurrent connection cap, per-user room cap, and per-minute connect-rate limit — all enforced with the same thresholds and the same close code (1008). Keyed on `context.userId` set by the auth hook. Behavior unchanged; only payload types may change.

## 5. Persistence extension contract (`PersistenceExtension`)

`onLoadDocument` hydrates the Yjs document from the stored state; `onStoreDocument` writes back Yjs state and syncs file content. Uses `yjs` directly (version unchanged). The `createRequire('yjs')` loader may be simplified to a normal import but MUST load the same single `yjs` instance.

## 6. Provider contract (`apps/web/src/hooks/use-collab-document.ts`)

`HocuspocusProvider({ ... })` connects to the collab server, exposes the Yjs `Doc` and an `awareness` object that satisfies the `AwarenessLike` interface in `use-collab-presence.ts` (`clientID`, `getStates()`, `on('change')`, `off('change')`). Connection-state transitions (`synced`/`reconnecting`/`offline`) that drive the editor's banners and the offline read-only fallback MUST behave identically.

## 7. Editor binding contract (`editor-collab-extensions.ts`)

`y-codemirror.next` `yCollab(ytext, awareness, { undoManager })` continues to bind the shared `Y.Text` to CodeMirror, render remote cursors, and provide collaborative undo — unchanged.

## Acceptance

Conformance is demonstrated by the existing collaboration unit suite (`apps/collab/tests/*`), the Playwright collab e2e (`apps/web/e2e/collab-*.spec.ts`), and the full quality-gate run — all green — with no user-visible change.
