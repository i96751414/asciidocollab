# Data Model: Collaboration Server (Phase 8)

## New Prisma Model — `CollaborationSession`

Tracks which document rooms are currently active. Written by `apps/collab`; read by `apps/api` for upload-blocking.

```prisma
model CollaborationSession {
  id         String   @id @default(uuid()) @db.Uuid
  projectId  String   @db.Uuid
  documentId String   @db.Uuid
  createdAt  DateTime @default(now())

  project  Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  document Document @relation(fields: [documentId], references: [id], onDelete: Cascade)

  @@unique([projectId, documentId])
  @@index([projectId])
  @@index([documentId])
  @@map("collaboration_sessions")
}
```

Both FK columns carry `onDelete: Cascade`:

- **`documentId` → `Document`**: if a document record is removed outside of `DeleteFileUseCase`, the session row is automatically deleted, preventing stale sessions from blocking future uploads.
- **`projectId` → `Project`**: if a project is deleted, all its session rows are deleted directly, without relying on the multi-hop `Project → FileNode → Document → CollaborationSession` chain. PostgreSQL resolves the two cascade paths safely — the first cascade to fire deletes the row; the second finds nothing and completes as a no-op.

`createdAt` follows the `createdAt DateTime @default(now())` convention used by all other models in the schema.

`@@index([documentId])` follows the schema convention of indexing every FK column (see `FileNode.parentId`, `AuditLog.userId`, `Session.userId`). Without it, cascade deletes triggered by `Document` deletion perform a full table scan.

Back-relations required on existing models:

```prisma
// add to Project
collaborationSessions CollaborationSession[]

// add to Document
collaborationSessions CollaborationSession[]
```

Lifecycle:
- **Created** when the first client connects to a room (`onConnect` in `apps/collab`).
- **Deleted** when the last client disconnects (`onDisconnect`).
- **All cleared for a project** when the project is deleted (direct FK cascade from `projectId`).
- **All cleared on startup** of `apps/collab` to recover from unclean shutdowns.

---

## New Domain Port — `CollaborationSessionRepository`

```
packages/domain/src/ports/project/collaboration-session.repository.ts
```

```typescript
export interface CollaborationSessionRepository {
  /** Returns true if a collaboration room is currently active for the given document. */
  isActive(projectId: ProjectId, documentId: DocumentId): Promise<boolean>;

  /** Records that a room has opened (upserts by projectId + documentId). */
  open(projectId: ProjectId, documentId: DocumentId): Promise<void>;

  /** Removes the session record when the last client leaves. */
  close(projectId: ProjectId, documentId: DocumentId): Promise<void>;

  /** Removes all session records for a project (called on project deletion). */
  closeAllForProject(projectId: ProjectId): Promise<void>;

  /** Removes all session records globally (called on collab server startup). */
  closeAll(): Promise<void>;
}
```

In-memory fake location: `packages/domain/tests/ports/project/in-memory-collaboration-session-repository.ts`

---

## New Domain Error — `ActiveCollaborationSessionError`

```
packages/domain/src/errors/active-collaboration-session.ts
```

Returned by `SaveDocumentContentUseCase` and `DeleteFileUseCase` when the target document has an active room. Translated to HTTP 409 by `apps/api` route handlers.

---

## Updated Domain Port — `DocumentRepository`

New method added to the existing interface:

```typescript
/** Finds the document whose Yjs state file is identified by the given yjsStateId. */
findByYjsStateId(yjsStateId: YjsStateId): Promise<Document | null>;
```

Required by `apps/collab`'s persistence extension to resolve `(projectId, yjsStateId) → Document → FileNode.path` for write-back to `ProjectFileStore`.

---

## Updated Use Case — `SaveDocumentContentUseCase`

New optional constructor dependency: `CollaborationSessionRepository`.

New early-exit path (after membership check, before write):

```
if collaborationSessionRepo && collaborationSessionRepo.isActive(projectId, documentId):
  return { success: false, error: new ActiveCollaborationSessionError(documentId) }
```

Note: `documentId` resolved from `DocumentRepository.findByFileNodeId(fileNodeId).id`.

---

## Updated Use Case — `DeleteFileUseCase`

New optional constructor dependency: `CollaborationSessionRepository`.

For file nodes of type `file`: after finding the `document`, check `isActive`; if true, return `ActiveCollaborationSessionError`.

For folder nodes: check each descendant file's document for active sessions; return `ActiveCollaborationSessionError` if any are found (deletion of a folder containing actively-edited files is rejected).

---

## New Infrastructure Adapter — `PrismaCollaborationSessionRepository`

```
packages/infrastructure/src/persistence/project/prisma-collaboration-session-repository.ts
```

Implements `CollaborationSessionRepository` using the Prisma client. `open()` uses `upsert` on `(projectId, documentId)`.

---

## `apps/collab` App Structure

```
apps/collab/
├── package.json                          # name: @asciidocollab/collab; type: commonjs
├── tsconfig.json
├── src/
│   ├── index.ts                          # bootstrap: create server, register SIGTERM/SIGINT
│   ├── server.ts                         # Hocuspocus Server factory
│   ├── composition-root.ts               # DI wiring: Prisma client → repos → extensions
│   ├── config/
│   │   └── collab-config.ts              # convict schema (ASCIIDOCOLLAB_COLLAB_PORT (default: 4002),
│   │                                     #   ASCIIDOCOLLAB_COLLAB_API_INTERNAL_URL (default: http://127.0.0.1:4001),
│   │                                     #   ASCIIDOCOLLAB_COLLAB_AUTH_TIMEOUT_MS (default: 3000),
│   │                                     #   ASCIIDOCOLLAB_COLLAB_WATCHDOG_INTERVAL_MS (default: 30000),
│   │                                     #   ASCIIDOCOLLAB_STORAGE_PATH (same var as apps/api),
│   │                                     #   ASCIIDOCOLLAB_DATABASE_URL)
│   └── extensions/
│       ├── auth-hook.ts                  # onConnect: call GET /internal/collab/auth
│       └── persistence.ts               # onLoadDocument + onStoreDocument (Yjs + file write-back)
└── tests/
    └── extensions/
        ├── auth-hook.test.ts
        └── persistence.test.ts
```

---

## `apps/api` Changes

### New internal Fastify server + route: `GET /internal/collab/auth`

```
apps/api/src/routes/internal/collab-auth.ts
apps/api/src/internal-server.ts          ← NEW: second Fastify instance on 127.0.0.1:ASCIIDOCOLLAB_COLLAB_INTERNAL_PORT
```

The `/internal/collab/auth` route is registered **only** on a dedicated Fastify server instance bound to `127.0.0.1:<ASCIIDOCOLLAB_COLLAB_INTERNAL_PORT>` (default 4001). This server:
- Is never exposed through the reverse proxy.
- Does NOT register CSRF, origin-check, or rate-limit plugins.
- Registers only the session plugin (to validate the forwarded cookie) and the auth route.

Route behaviour:
- Validates `documentName` via Fastify JSON schema: `{ type: 'string', pattern: '^[0-9a-f-]{36}/[0-9a-f-]{36}$' }` — returns 400 if invalid.
- Resolves `projectId` + `yjsStateId` from the validated `documentName`.
- Looks up `Document` by `yjsStateId`, then `FileNode` to confirm project ownership.
- Checks `ProjectMemberRepository` for membership.
- Returns `200 { role: 'editor' | 'observer' }` or `401` / `403`.

`ASCIIDOCOLLAB_COLLAB_INTERNAL_PORT` is added to `apps/api`'s convict config schema (default: `4001`).

### Removed

- `apps/api/src/plugins/hocuspocus-persistence.ts` — moved to `apps/collab/src/extensions/persistence.ts` and extended. The stub in `apps/api` is deleted.

---

## System Setting Key

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `collaboration.writeback_interval_seconds` | integer (string-encoded) | `'30'` | Hocuspocus `maxDebounce` in seconds. Read at `apps/collab` startup. |

Read via `SystemSettingRepository.get('collaboration.writeback_interval_seconds')` in `apps/collab`'s composition root.

---

## Security Configuration

### Pino logger redact — `apps/collab`

The Pino logger created in `apps/collab/src/index.ts` MUST include:

```typescript
redact: ['req.headers.cookie', 'req.headers.Cookie']
```

This prevents session cookies forwarded in the auth hook HTTP request from appearing in any log output. The Security Constitution mandates "Sensitive fields MUST be redacted from all logs."

### Auth hook HTTP client — no header logging

The HTTP client used in `apps/collab/src/extensions/auth-hook.ts` to call the internal API MUST be configured to suppress request-header logging. When using `undici` or `node:http` directly, do not pass a `logger` instance that prints headers.
