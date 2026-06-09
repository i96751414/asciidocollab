# Phase 0 Research: Real-time Co-editing (Editor Integration)

All decisions below were grounded by reading the existing collaboration server (`apps/collab`), the internal auth route (`apps/api/src/routes/internal/collab-auth.ts`), the editor stack (`apps/web/src/components/editor`, `hooks/use-editor-mount.ts`, `use-auto-save.ts`, `use-file-selection.ts`), the Prisma schema, and both constitutions. No `NEEDS CLARIFICATION` remain.

---

## D1. Client collaboration stack

**Decision**: `@hocuspocus/provider` (`HocuspocusProvider`) + `yjs` + `y-codemirror.next` (`yCollab`, `yUndoManagerKeymap`) + `y-protocols/awareness`.

**Rationale**: The server is Hocuspocus (`@hocuspocus/server`), so `HocuspocusProvider` is the matching client. The Architecture Constitution (Technology Mandates) explicitly requires "CodeMirror 6 + y-codemirror.next for collaborative editing" and "Yjs `Y.Text`; Hocuspocus for server." `y-codemirror.next` provides the CodeMirror 6 extension that binds a `Y.Text` to the editor, renders remote cursors/selections from awareness, and integrates a `Y.UndoManager`.

**Alternatives considered**: `y-websocket` (rejected — server is Hocuspocus, which has its own message protocol and auth hook); hand-rolled CRDT binding (rejected — reinvents y-codemirror).

---

## D2. Yjs versioning / single-instance rule

**Decision**: Pin web `yjs` to the same minor as `apps/collab` (`^13.6.31`); ensure exactly one `yjs` copy in the web bundle.

**Rationale**: Yjs uses `instanceof` checks across its types; two copies of the Yjs module in one runtime silently break CRDT operations. y-codemirror.next and the provider take `yjs` as a peer dependency. Pinning the same version and relying on pnpm dedupe keeps a single instance.

**Validation**: After install, confirm `pnpm why yjs` resolves a single version in `apps/web`.

---

## D3. CJS/ESM interop for Yjs in the web bundle

**Decision**: Import `yjs` normally (`import * as Y from 'yjs'`) in `apps/web`; the `createRequire` workaround used in `apps/collab` is **not** needed here.

**Rationale**: The `apps/collab` `createRequire` shim (Architecture Constitution note / 018 tasks) exists because that app runs as Node ESM where `yjs`'s CJS entry needs explicit require. The Next.js bundler resolves `yjs` through its module field for the browser, so a standard ESM import works and avoids any `as` cast (P0 rule 6).

**Validation**: Typecheck + a smoke render test of the editor in collab mode.

---

## D4. Room name & how the client obtains it

**Decision**: Room name is `` `${projectId}/${yjsStateId}` `` (already the server's canonical format, parsed in `apps/collab/src/server.ts` and `internal/collab-auth.ts`). The client obtains `yjsStateId` from a new endpoint `GET /projects/:projectId/files/:fileNodeId/collab`.

**Rationale**: The web client only knows `projectId` + `fileNodeId`; `yjsStateId` lives on the `Document` record and was never exposed (review finding **B1**). A dedicated endpoint is authoritative (reuses the same membership + document-ownership checks as the internal auth route) and returns role in the same call, solving **H3** too. Returns 404 for files with no `Document` (binary assets), which drives the legacy fallback path.

**Alternatives considered**: response headers on `GET /content` (rejected — overloads a raw-bytes response and still fetches unused content); embedding in the file-tree payload (rejected — bloats the tree and computes role for every file up front).

---

## D5. WebSocket authentication

**Decision**: Rely on the browser automatically attaching the session cookie to the WS handshake; the collab `AuthHookExtension` forwards that cookie to `GET /internal/collab/auth`. No token scheme.

**Rationale**: `AuthHookExtension.onConnect` already reads `requestHeaders.cookie` and forwards it (verified). Cookies are **not** port-specific, so a cookie set for `localhost` is sent to `ws://localhost:4002` in dev. `localhost:3000 → :4002` is same-site, so `SameSite=Lax` cookies are included on the script-initiated handshake.

**Constraint (production)**: collab and web must share a registrable domain (e.g., `collab.example.com` with cookie `Domain=example.com`, or same host behind a reverse proxy). Documented in quickstart + `.env.example`.

**Alternatives considered**: short-lived bearer token in the WS query/subprotocol (rejected for now — adds a token-mint endpoint and rotation; cookie path already works and matches the implemented server).

---

## D6. Collab vs. legacy mode selection

**Decision**: On file open, call `getCollabDocumentInfo`. 
- **200** → collab path: bind Yjs, empty initial doc, no REST save/poll/draft.
- **404** (binary asset / no Document) → legacy path: `GET /content`, existing rendering, read-only for non-text.
- **Collab server unreachable** (provider fails to reach `synced` within a timeout, or status `disconnected` at open) → offline fallback: read-only editor seeded from `GET /content`, with an "editing unavailable" banner (FR-013).

**Rationale**: Cleanly isolates the new behaviour and preserves the legacy path for assets and degraded conditions (review **M2**). The mode is a pure function of (endpoint result, provider status).

---

## D7. Empty-initial-content binding

**Decision**: Mount the collab editor with `doc: ''`; let `yCollab(ytext, awareness, …)` populate content from the synced `Y.Text('codemirror')`. Gate the editor's "ready" state on the provider `synced` event.

**Rationale**: y-codemirror.next reconciles the CodeMirror doc to the Y.Text on bind; pre-seeding from REST would duplicate/desync content (review **B3**). The server seeds the Y.Doc from stored file content on first load (018 FR-008), so the first opener still sees file content — delivered via sync, not REST.

---

## D8. Read-only enforcement (observer + offline)

**Decision**: Apply CodeMirror `EditorState.readOnly.of(true)` + `EditorView.editable.of(false)` when role is `observer` or when in offline fallback. Keep the y-codemirror extension active in observer mode so remote updates and presence still render.

**Rationale**: `readOnly` blocks user input but not programmatic Yjs-applied updates, so observers see live edits (FR-012) without being able to type. Proactively read-only avoids the bad UX of local optimistic edits that the server silently drops (018 observer write-rejection).

---

## D9. Awareness identity & colour

**Decision**: Each client publishes its own awareness `user` field `{ name, color, colorLight, avatarUrl }`. `name`/`avatarUrl` come from the current user's profile; `color` is **deterministically derived from the user's id** via a fixed palette (hash → index).

**Rationale**: The auth response returns only `role`, so name/avatar/colour are supplied client-side. Deterministic colour keyed on user id means every client renders the same colour for a given user ("assigned colour", 018 CollaborationParticipant) without a server round-trip. A user must not see their **own** overlay — handled natively by y-codemirror (it does not render the local client's remote-cursor) and by excluding the local client id from the presence bar (FR-008).

**Alternatives considered**: server-assigned colour returned by the auth/collab endpoint (rejected — extra state; deterministic client derivation is simpler and equally consistent).

---

## D10. Collaborative undo/redo (per-user)

**Decision**: Construct `new Y.UndoManager(ytext, { trackedOrigins: new Set([<the y-codemirror sync origin>]) })` and pass it to `yCollab({ undoManager })`; bind undo/redo to `yUndoManagerKeymap`. Replace CodeMirror's native `history()`/default undo keymap on the collab path.

**Rationale**: A `Y.UndoManager` scoped to the local sync origin undoes only edits originating locally, never remote participants' edits (FR-011). Using the native CodeMirror history simultaneously would double-handle undo, so it is omitted on the collab path (kept on the legacy path).

---

## D11. Teardown, file-switch, reconnection

**Decision**: `useCollabDocument` owns the `HocuspocusProvider` + `Y.Doc` lifecycle in a React effect keyed on `(projectId, yjsStateId)`. On file switch/unmount it calls `provider.destroy()` and `ydoc.destroy()`, clearing local awareness (FR-015). Connection status is surfaced from provider `status`/`synced`/`disconnect` events into a `ConnectionState` value driving banners (FR-014); the provider's built-in reconnect handles drops, and on reconnect the Y.Doc reconciles automatically (FR-016).

**Rationale**: Single ownership point prevents leaked sockets/cursors across file switches; provider events are the canonical connection signal.

---

## D12. No database migration

**Decision**: No Prisma schema change. The new endpoint reads existing `Document.yjsStateId` and `ProjectMember.role`.

**Rationale**: `yjsStateId` was added to `Document` in spec 018. Per the Migration Policy, since there is no schema change there is nothing to ask about or migrate.

---

## D13. Preview sync continuity

**Decision**: Keep preview (spec 016) wired to the CodeMirror `updateListener`; do not couple preview to the (now-absent) save path.

**Rationale**: Yjs applies remote changes as CodeMirror transactions, so `updateListener` still fires and preview stays current. A test asserts preview updates from a remote-origin change. Confirms review **M3**.
