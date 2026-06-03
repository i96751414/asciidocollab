# Research: Per-Project Isolated File Storage

**Date**: 2026-06-01 | **Branch**: `011-project-file-storage`

---

## R-001: Atomic File Writes in Node.js

**Decision**: Write-then-rename pattern using `fs.promises` — no additional dependency.

**Rationale**: On POSIX filesystems, `rename(2)` is atomic — readers always see either the old file or the new file, never a partial state. The pattern is: write to a temp file in the same directory, then `fs.promises.rename(tempPath, targetPath)`. The temp file must be on the same filesystem (same directory) for the rename to be atomic.

**Implementation**:
```
const tmp = targetPath + '.tmp.' + randomUUID()
await fs.promises.writeFile(tmp, content)
await fs.promises.rename(tmp, targetPath)
```

**Alternatives considered**:
- `write-file-atomic` npm package — provides the same pattern with cross-platform handling; rejected because the project already avoids unnecessary dependencies and the pattern is trivial to implement with stdlib.
- Direct `fs.promises.writeFile` — not atomic; a crash mid-write leaves a corrupt file; rejected.

---

## R-002: First-Writer-Wins Exclusive File Creation

**Decision**: Use `fs.open(path, 'wx')` (exclusive create flag) for new file creation.

**Rationale**: The POSIX `O_EXCL` flag (Node's `'wx'` mode) guarantees that `open()` fails with `EEXIST` if the file already exists, even under concurrent access. This implements first-writer-wins without any application-level locking.

**Implementation**:
```
try {
  const fh = await fs.promises.open(path, 'wx')
  await fh.writeFile(content)
  await fh.close()
} catch (err) {
  if (err.code === 'EEXIST') return { success: false, error: new FileConflictError(...) }
  throw err
}
```

**Alternatives considered**:
- Application-level mutex — complex, not process-safe across multiple API instances; rejected.
- Check-then-write (`exists()` then `writeFile()`) — TOCTOU race condition; rejected.

---

## R-003: Path Traversal Prevention

**Decision**: Two-layer defence: `FilePath` value object (domain) + `path.resolve` boundary check (infrastructure).

**Rationale**: The existing `FilePath` value object already rejects `..` and `.` sequences and enforces safe characters. The infrastructure adds a second check: after resolving the full OS path, it verifies the resolved path starts with the project directory, catching any bypass not caught by the domain validator.

**Implementation** (infrastructure layer):
```
function resolveSafe(storageRoot: string, projectId: string, filePath: string): string {
  const projectDir = path.resolve(storageRoot, projectId)
  const resolved = path.resolve(projectDir, filePath.replace(/^\//, ''))
  if (!resolved.startsWith(projectDir + path.sep) && resolved !== projectDir) {
    throw new Error('Path traversal detected')
  }
  return resolved
}
```

**Alternatives considered**:
- Trust `FilePath` alone — sufficient for well-behaved callers but defence-in-depth requires the OS-level check too; both layers kept.

---

## R-004: Server-Sent Events (SSE) in Fastify

**Decision**: Native SSE implementation using `reply.raw` — no additional plugin.

**Rationale**: SSE is a simple HTTP streaming protocol. Fastify's `reply.raw` gives direct access to the underlying `http.ServerResponse`, sufficient for writing `data:` lines. An in-process `EventEmitter` (one emitter per project ID) routes events from route handlers to open SSE connections. This avoids any external pub/sub infrastructure in this phase.

**Implementation sketch**:
```
// Fastify plugin: FileTreeEventBus
const buses = new Map<string, EventEmitter>()

function getBus(projectId: string): EventEmitter { ... }
function emit(projectId: string, event: FileTreeEventDto): void { ... }

// SSE route
fastify.get('/projects/:id/events', async (req, reply) => {
  reply.raw.setHeader('Content-Type', 'text/event-stream')
  reply.raw.setHeader('Cache-Control', 'no-cache')
  reply.raw.setHeader('Connection', 'keep-alive')
  reply.raw.flushHeaders()

  const bus = getBus(projectId)
  const listener = (event: FileTreeEventDto) => {
    reply.raw.write(`data: ${JSON.stringify(event)}\n\n`)
  }
  bus.on('change', listener)
  req.raw.on('close', () => bus.off('change', listener))
})
```

**Alternatives considered**:
- WebSocket via Hocuspocus — Hocuspocus is document-scoped; reusing it for project-scoped file tree events adds coupling; rejected.
- `@fastify/eventsource` plugin — provides the same functionality with no significant benefit over manual implementation; rejected to keep dependencies minimal.
- Redis pub/sub for horizontal scaling — out of scope for this phase; noted for future.

---

## R-005: Hocuspocus Filesystem Persistence

**Decision**: Custom Hocuspocus extension wrapping `YjsStateStore` interface.

**Rationale**: Hocuspocus supports persistence via a `Database` extension interface with two hooks: `onLoadDocument(data)` (load initial state) and `onStoreDocument(data)` (persist updated state). A custom class implementing these hooks and delegating to `YjsStateStore` keeps all storage in one abstraction. The extension receives `documentName` (used as the document key) and `state` (the binary Yjs update).

**Implementation** (infrastructure layer):
```typescript
export class HocuspocusPersistenceExtension implements Extension {
  constructor(
    private readonly store: YjsStateStore,
    private readonly resolveProjectId: (docName: string) => ProjectId,
    private readonly resolveYjsStateId: (docName: string) => YjsStateId,
  ) {}

  async onLoadDocument({ documentName, document }) {
    const projectId = this.resolveProjectId(documentName)
    const yjsStateId = this.resolveYjsStateId(documentName)
    const state = await this.store.load(projectId, yjsStateId)
    if (state) Y.applyUpdate(document, state)
  }

  async onStoreDocument({ documentName, document }) {
    const projectId = this.resolveProjectId(documentName)
    const yjsStateId = this.resolveYjsStateId(documentName)
    const state = Y.encodeStateAsUpdate(document)
    await this.store.save(projectId, yjsStateId, Buffer.from(state))
  }
}
```

**Alternatives considered**:
- `@hocuspocus/extension-database` — generic database extension; would work but adds a dependency for a pattern that is trivial to implement directly; rejected.
- Store Yjs state in PostgreSQL — `yjsStateId` in `Document` entity already points to a resource; storing in the filesystem keeps all project content together for future git integration; rejected PostgreSQL for this.

---

## R-006: Existing Infrastructure Review

**Findings**:
- `FilePath` value object already validates against traversal and unsafe characters — reusable as-is.
- `FileConflictError` domain error already exists — reusable as-is.
- `DeleteFileUseCase` and `RenameFileUseCase` do not currently interact with any filesystem store — they only mutate the database. Both must be extended to also operate on `ProjectFileStore`.
- `DeleteProjectUseCase` does not currently clean up any storage — must be extended to call `ProjectFileStore.removeProject()` and `YjsStateStore.deleteAllForProject()`.
- `PrismaImageRepository` tracks metadata (filename, storagePath, sizeBytes) — the image bytes themselves are not yet stored anywhere. `FilesystemProjectFileStore` fills this gap.
- No `MoveFileUseCase` exists yet. Since the spec requires move operations to propagate in real time, a `MoveFileUseCase` must be created in this phase.
- Config uses `convict` with `ASCIIDOCOLLAB_*` env var prefix — follow same naming for new storage config.
