# Research: Collaboration Server (Phase 8)

## Decision 1 — Hocuspocus as a Standalone `apps/collab` Process

**Decision**: New `apps/collab` TypeScript package in the pnpm workspace. CJS module type (matching `apps/api`). Entry point: `src/index.ts` bootstraps the Hocuspocus `Server`, registers extensions, wires domain ports via the composition root, and installs SIGTERM/SIGINT handlers.

**Rationale**: Architecture Constitution mandates Hocuspocus as a standalone process. A separate package enforces the boundary: `apps/collab` imports `@asciidocollab/domain` and `@asciidocollab/infrastructure`, never the reverse. The existing `HocuspocusPersistenceExtension` in `apps/api/src/plugins/hocuspocus-persistence.ts` is a draft stub; it moves to `apps/collab/src/extensions/persistence.ts` and is extended.

**Alternatives considered**: Embedding Hocuspocus inside `apps/api` as an additional Fastify plugin — rejected because it couples the WebSocket process lifecycle to the HTTP server and violates the Constitution's standalone-process mandate.

---

## Decision 2 — Active Room Tracking via `CollaborationSession` DB Model

**Decision**: A new Prisma model `CollaborationSession` tracks which document rooms are currently active. `apps/collab` inserts/upserts a record when the first client joins a room (`onConnect`) and deletes it when the last client leaves (`onDisconnect`). On startup, `apps/collab` deletes all stale records (crash recovery). `apps/api` reads this table before allowing uploads or deletes to files with active sessions.

**Rolling restart safety**: `closeAll()` on startup is only safe when a single `apps/collab` instance runs at a time. For rolling deploys, the startup sequence must wait for confirmation that the previous instance has exited (e.g., via health-check probe) before calling `closeAll()`. The deployment runbook must document this constraint. Multi-instance collab clustering is deferred to a future phase.

**Rationale**: No Redis dependency; leverages the existing PostgreSQL stack; stale-record cleanup on startup handles unclean shutdowns without requiring a heartbeat. A single composite unique constraint `(projectId, documentId)` prevents duplicate rows.

**Alternatives considered**:
- In-memory registry in `apps/collab` exposed via an HTTP health endpoint — rejected because `apps/api` would need to call `apps/collab` synchronously on every upload request, creating an inter-service runtime coupling.
- Redis for shared session state — rejected as it introduces an additional infrastructure dependency not present in any other phase.

---

## Decision 3 — Auth Hook via Dedicated Internal Fastify Server

**Decision**: `apps/collab`'s auth extension calls an internal HTTP endpoint on `apps/api`: `GET /internal/collab/auth` with the WebSocket handshake's `Cookie` header forwarded. The Fastify route validates the session, resolves `projectId` and `yjsStateId` from the `documentName` query param, checks `ProjectMemberRepository`, and returns 200 + `{ role: 'editor' | 'observer' }` or 401/403.

**Isolation — dedicated internal server**: The `/internal` routes are registered on a **second Fastify server instance** bound exclusively to `127.0.0.1:ASCIIDOCOLLAB_COLLAB_INTERNAL_PORT` (default 4001). This server is never exposed through the reverse proxy. The origin-check and CSRF plugins are not registered on the internal server — they are not needed because the server is loopback-only and the caller (`apps/collab`) is a server-side process, not a browser.

**Timeout and rejection policy**: `apps/collab`'s auth hook wraps the HTTP call with `AbortSignal.timeout(ASCIIDOCOLLAB_COLLAB_AUTH_TIMEOUT_MS)` (default 3000 ms). On timeout or any network error, the hook rejects the WebSocket connection with close code 1008 (policy violation) and logs a `warn` entry that includes the room name and error class — but never the forwarded cookie.

**Cookie redaction**: The `Cookie` header is forwarded in the auth HTTP request but MUST NOT appear in any log output. `apps/collab`'s Pino logger config MUST include `redact: ['req.headers.cookie', 'req.headers.Cookie']`. The HTTP client making the internal call MUST NOT log request headers at any level.

**Rationale**: A dedicated loopback server eliminates the need for runtime IP-allowlist checks in application code — network topology enforces isolation. The timeout prevents connection pile-up when `apps/api` is slow or unavailable. Cookie redaction satisfies Security Constitution: "Sensitive fields MUST be redacted from all logs."

**Alternatives considered**: Shared session secret + JWT — rejected (duplicates membership logic). Single Fastify server with `preHandler` IP check — rejected (application-level IP checks can be bypassed and add fragile code); origin-check plugin only covers mutating HTTP methods and would not protect GET requests.

---

## Decision 4 — Y.Text Field Name: `'codemirror'`

**Decision**: The collaborative text lives in `yjsDoc.getText('codemirror')`. This matches the `y-codemirror.next` default binding used in Phase 9.

**Rationale**: Standardising the field name in Phase 8 avoids a breaking change when Phase 9 connects the editor. The write-back in `onStoreDocument` decodes this field: `Buffer.from(doc.getText('codemirror').toString(), 'utf-8')`.

---

## Decision 5 — Write-Back Strategy

**Decision**: Two-tier:
1. **Periodic**: Hocuspocus's built-in `debounce`/`maxDebounce` settings drive interim saves. The `maxDebounce` value (default 30 s) is read from `SystemSettingRepository` under the key `collaboration.writeback_interval_seconds` at `apps/collab` startup.
2. **On teardown**: `onStoreDocument` is called by Hocuspocus when the last client leaves a room. This triggers a full flush to both `YjsStateStore` and `ProjectFileStore`.
3. **On shutdown**: The SIGTERM/SIGINT handler executes the following **ordered, await-to-completion** sequence:
   - Step 1: `await hocuspocus.destroy()` — flushes all active rooms via `onStoreDocument` for each.
   - Step 2: `await collaborationSessionRepo.closeAll()` — clears DB session records only after all flushes complete.
   - Step 3: `await prismaClient.$disconnect()` — closes the DB connection.
   - If Step 1 or Step 2 throws, the error is logged at `error` level with full context; the process exits with code 1. Partial failures (individual room flush errors) are caught and logged without aborting the remaining flushes.

**Rationale**: Hocuspocus's debounce mechanism is already designed for this use-case; extending it with a configurable max avoids a separate timer. The explicit ordered shutdown ensures DB session records are never cleared before the corresponding file writes complete — preventing a race where `apps/api` allows uploads to a file whose room is still being flushed.

---

## Decision 6 — Bootstrap from File Content (`onLoadDocument`)

**Decision**: When no Yjs state exists for a document (`YjsStateStore.load` returns `null`), `onLoadDocument` reads the file content via `ProjectFileStore`, inserts it into `doc.getText('codemirror')`, and immediately persists the resulting Yjs state via `YjsStateStore.save`. Subsequent joins load from the Yjs state.

**Rationale**: Ensures FR-008 (first-connection bootstrap) without extra round-trips for later joiners. The immediate persist means a crash after the first connection but before the debounce timer doesn't lose the bootstrap.

---

## Decision 7 — Upload Blocking via `SaveDocumentContentUseCase` Refactor

**Decision**: `SaveDocumentContentUseCase` gains a new optional dependency: `CollaborationSessionRepository`. When `isActive(projectId, documentId)` returns `true`, the use case returns `ActiveCollaborationSessionError` (a new typed domain error). The Fastify route translates this to HTTP 409 with a user-readable message.

**Rationale**: Business rule (no upload while editing) belongs in the domain use case, not in a route handler (Constitution: "business logic in route handlers is prohibited"). The dependency is optional (constructed without it in tests that don't exercise this path) to avoid breaking existing tests.

**Same pattern for `DeleteFileUseCase`**: if the document has an active session, return `ActiveCollaborationSessionError`. Deletion of a file while someone is editing it is rejected.

---

## Decision 8 — `DocumentRepository.findByYjsStateId` Extension

**Decision**: Add `findByYjsStateId(yjsStateId: YjsStateId): Promise<Document | null>` to the `DocumentRepository` port. This allows `apps/collab`'s persistence extension to resolve `fileNode.path` from a `documentName` (`<projectId>/<yjsStateId>`) without a full lookup chain outside the domain boundary.

**Rationale**: The persistence extension only knows `(projectId, yjsStateId)` from the room name. Resolving the file path requires traversing `Document → FileNode`. Adding one method to the repository port is the cleanest path; it avoids exposing Prisma models to `apps/collab`.

---

## Decision 9 — Awareness Data: Server Broadcasts All; Client Filters Own Cursor

**Decision**: The Hocuspocus server broadcasts all awareness states (cursor, selection, display name, avatar URL, assigned colour). The client (implemented in Phase 9 with `y-codemirror.next`) filters out its own client ID before rendering overlays.

**Rationale**: Awareness states are indexed by Yjs client ID. Every Yjs client knows its own ID (`ydoc.clientID`). Server-side filtering would require tracking which WebSocket connection belongs to which client ID — possible but adds complexity with no correctness benefit. Client-side filtering is the standard pattern in all Yjs-based collaborative editors.

---

## Key Constants

| Constant | Value | Location |
|----------|-------|----------|
| `COLLAB_WRITEBACK_INTERVAL_KEY` | `'collaboration.writeback_interval_seconds'` | `apps/collab/src/config/` |
| `COLLAB_WRITEBACK_INTERVAL_DEFAULT` | `30` (seconds) | same |
| `ASCIIDOCOLLAB_COLLAB_AUTH_TIMEOUT_MS` | `3000` ms | `apps/collab/src/config/collab-config.ts` |
| `ASCIIDOCOLLAB_COLLAB_INTERNAL_PORT` | `4001` | `apps/api/src/config/` + `apps/collab/src/config/` |
| Yjs text field name | `'codemirror'` | `apps/collab/src/extensions/persistence.ts` |
| Room name format | `<projectId>/<yjsStateId>` | `apps/collab/src/extensions/persistence.ts` |
| Internal auth endpoint | `GET /internal/collab/auth` | `apps/api/src/routes/internal/` (internal server only) |
| Pino redact paths (`apps/collab`) | `['req.headers.cookie', 'req.headers.Cookie']` | `apps/collab/src/index.ts` |
