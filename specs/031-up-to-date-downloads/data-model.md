# Data Model: Up-to-Date Downloads

**Feature**: 031-up-to-date-downloads | **Date**: 2026-06-21

**No database schema change.** No new tables, columns, or migrations. This feature composes existing entities, ports, and stores. The "model" below documents the entities/relationships the download path traverses and the one new in-memory shape introduced.

---

## Existing entities (unchanged)

### FileNode (`packages/domain/src/entities/file-node.ts`)
- `id: FileNodeId`, `projectId: ProjectId`, `parentId`, `name`, `type` (`file` | `folder`), `path: FilePath`.
- The download iterates FILE-type nodes; `path` locates bytes in the file store. No `yjsStateId` on the node itself.

### Document (`packages/domain/src/entities/document.ts`)
- `id: DocumentId`, `fileNodeId: FileNodeId`, `contentId`, `yjsStateId: YjsStateId`, `mimeType`.
- Bridges a `FileNode` to its collaborative Yjs state. Present only for text documents (binary assets have no `Document`).
- Resolution: `DocumentRepository.findByFileNodeId(fileNodeId)` (single) / `findByFileNodeIds(...)` (batch).

### CollaborationSession (Prisma `CollaborationSession`)
- Queried via `CollaborationSessionRepository.isActive(projectId, documentId): Promise<boolean>` to decide whether a live read is worthwhile.

---

## Ports involved (all existing — no new port)

| Port | Method used | Role in download |
|------|-------------|------------------|
| `ProjectMemberRepository` | `findByCompositeKey` | Authorization (unchanged) |
| `FileNodeRepository` | `findById`, `findByProjectId` | Resolve target file / list project files (unchanged) |
| `DocumentRepository` | `findByFileNodeId`, `findByFileNodeIds` | Detect collaborative documents and get `yjsStateId` |
| `CollaborationSessionRepository` | `isActive` | Gate the live read to actively-edited documents |
| `CollaborativeContentReader` | `readContent(projectId, yjsStateId)` | Read live Yjs text (`string \| null`, or error) |
| `ProjectFileStore` | `readStream`, `read` | Stream / read the disk projection (fallback & binaries) |

---

## New in-memory shape (not persisted)

### DownloadContentSource (discriminated union)

Returned by the download use cases per file; the route maps it mechanically to a response.

```text
DownloadContentSource =
  | { kind: 'inline'; bytes: Buffer }   // live Yjs text obtained from the collab server
  | { kind: 'stored' }                  // route streams fileStore.readStream(projectId, fileNode.path)
```

**Resolution rule** (per file):
1. `document = documentRepo.findByFileNodeId(fileNode.id)`.
2. If `document` exists AND `collaborationSessionRepo.isActive(projectId, document.id)`:
   - `live = collaborativeContentReader.readContent(projectId, document.yjsStateId)`.
   - `live.success && live.value !== null` → `{ kind: 'inline', bytes: Buffer.from(live.value, 'utf8') }`.
   - `live.error` → log `warn`, then `{ kind: 'stored' }` (FR-005).
3. Otherwise → `{ kind: 'stored' }` (dormant document or binary asset; FR-004, FR-006).

**Snapshot guarantee (FR-003)**: `readContent` returns `Y.Text.toString()` taken atomically on the server, so `inline` bytes are a consistent, non-torn snapshot at request time.

---

## Return-shape changes to existing use cases

- `DownloadFileUseCase.execute(...)` → adds the resolved `DownloadContentSource` (alongside the existing `fileNode`; `filePath` retained for the `stored` path).
- `DownloadProjectUseCase.execute(...)` → each entry in `files` gains a way to obtain its `DownloadContentSource` (resolved per file during/just before archiving so memory stays bounded), alongside the existing `relativePath`.

These are additive, in-memory shape changes. No DTO crossing a package boundary is altered in a way that duplicates a type (Architecture Constitution: contracts in `packages/shared` unchanged).
