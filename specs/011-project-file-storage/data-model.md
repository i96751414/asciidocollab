# Data Model: Per-Project Isolated File Storage

**Date**: 2026-06-01 | **Branch**: `011-project-file-storage`

No new database tables are introduced in this phase. All new storage is filesystem-based. The existing Prisma schema tracks metadata; the new filesystem stores hold the raw bytes.

---

## New Domain Interfaces (Ports)

### `ProjectFileStore` — `packages/domain/src/storage/project-file-store.ts`

Abstracts all reads and writes of user-visible project files (AsciiDoc documents and binary assets). Files are addressed by their logical `FilePath` within a project's namespace. All methods operate within the requesting project's directory; no cross-project access is possible.

```
ProjectFileStore
  read(projectId: ProjectId, filePath: FilePath): Promise<Buffer | null>
    — Returns file bytes, or null if the file does not exist.

  write(projectId: ProjectId, filePath: FilePath, content: Buffer): Promise<void>
    — Atomically overwrites the file at filePath. Creates intermediate directories.

  createExclusive(projectId, filePath, content): Promise<Result<void, FileConflictError>>
    — Creates the file only if it does not yet exist (first-writer-wins).
    — Returns FileConflictError if a file already exists at filePath.

  remove(projectId: ProjectId, filePath: FilePath): Promise<void>
    — Deletes the file. No-op if the file does not exist.

  move(projectId, fromPath, toPath): Promise<Result<void, FileConflictError>>
    — Moves or renames a file. Fails if a file already exists at toPath.

  createDirectory(projectId: ProjectId, dirPath: FilePath): Promise<void>
    — Creates the directory and all intermediate directories. No-op if already exists.

  removeDirectory(projectId: ProjectId, dirPath: FilePath): Promise<void>
    — Recursively removes the directory and all contents.

  removeProject(projectId: ProjectId): Promise<void>
    — Removes the entire project directory tree (called on project deletion).
```

**Filesystem layout** (infrastructure-level detail for reference):
```
<ASCIIDOCOLLAB_STORAGE_PATH>/
  <project-uuid>/          ← project directory (one per project)
    <user-defined paths>   ← mirrors logical file tree; no system-imposed structure
```

---

### `YjsStateStore` — `packages/domain/src/storage/yjs-state-store.ts`

Abstracts persistence of Yjs CRDT binary states. States are addressed by `YjsStateId` within a project's namespace and stored in a hidden system directory invisible to the user-facing file tree.

```
YjsStateStore
  load(projectId: ProjectId, yjsStateId: YjsStateId): Promise<Buffer | null>
    — Returns the current Yjs state bytes, or null if none persisted yet.

  save(projectId: ProjectId, yjsStateId: YjsStateId, state: Buffer): Promise<void>
    — Overwrites the stored Yjs state. Creates the storage directory on first use.

  delete(projectId: ProjectId, yjsStateId: YjsStateId): Promise<void>
    — Removes the state file for a single document.

  deleteAllForProject(projectId: ProjectId): Promise<void>
    — Removes all Yjs states for the project (called on project deletion).
```

**Filesystem layout** (infrastructure-level detail for reference):
```
<ASCIIDOCOLLAB_STORAGE_PATH>/
  <project-uuid>/
    .collab/                    ← hidden; excluded from git via .gitignore
      <yjs-state-uuid>          ← binary Yjs state, one file per collaborative document
```

---

## New Shared DTO

### `FileTreeEventDto` — `packages/shared/src/dtos/file-tree-event.dto.ts`

Emitted by the API to all SSE subscribers when the file tree structure of a project changes.

```
FileTreeEventDto {
  type:       'created' | 'deleted' | 'renamed' | 'moved'
  fileNodeId: string       — UUID of the affected file or folder node
  nodeType:   'file' | 'folder'
  name:       string       — current name after the operation
  path:       string       — current full path after the operation
  parentId:   string | null  — parent folder node ID after the operation
}
```

---

## Modified Use Cases

### `DeleteFileUseCase` — MODIFIED

**New constructor dependency**: `ProjectFileStore`, `YjsStateStore`

**Ordering guarantee (RT-5)**: DB deletions MUST complete fully and successfully before any filesystem cleanup is attempted. Filesystem cleanup happens last because:
- If DB deletion fails mid-recursion, no filesystem bytes have been removed → state is consistent (both DB and disk still have the data).
- If filesystem cleanup fails after successful DB deletion → orphaned files on disk (benign: no DB reference, invisible to users; can be cleaned by a future background sweep).
- The inverse order (filesystem first, then DB) would risk ghost DB records pointing to deleted files, causing `ContentNotFoundError` on subsequent access.

After ALL database records are deleted:
1. If the deleted node is a `file`: calls `projectFileStore.remove(projectId, fileNode.path)` and, if a document exists, `yjsStateStore.delete(projectId, document.yjsStateId)`.
2. If the deleted node is a `folder`: calls `projectFileStore.removeDirectory(projectId, fileNode.path)` (after the entire `deleteFolderRecursively` DB recursion completes).

---

### `RenameFileUseCase` — MODIFIED

**New constructor dependency**: `ProjectFileStore`

After updating the `FileNode` record in the database with the new name/path, the use case calls `projectFileStore.move(projectId, oldPath, newPath)`. Returns `FileConflictError` if a file already exists at the new path.

---

### `DeleteProjectUseCase` — MODIFIED

**New constructor dependency**: `ProjectFileStore`, `YjsStateStore`

After deleting all database records for the project, calls:
1. `projectFileStore.removeProject(projectId)` — removes the entire project content directory.
2. `yjsStateStore.deleteAllForProject(projectId)` — removes the `.collab/` directory.

---

## New Use Cases

### `GetDocumentContentUseCase`

Reads the raw content bytes of an AsciiDoc document for a project member.

```
Input:  actorId: UserId, projectId: ProjectId, fileNodeId: FileNodeId
Output: Result<{ content: Buffer, mimeType: MimeType }, DomainError>
Errors: PermissionDeniedError, FileNodeNotFoundError, ContentNotFoundError (new)
```

Logic:
1. Verify actor is a project member.
2. Load `FileNode` by `fileNodeId`.
3. Load associated `Document`.
4. Call `projectFileStore.read(projectId, fileNode.path)`.
5. Return bytes + mimeType from `Document`.

---

### `SaveDocumentContentUseCase`

Atomically saves updated AsciiDoc content for a document a project member can edit.

```
Input:  actorId: UserId, projectId: ProjectId, fileNodeId: FileNodeId, content: Buffer
Output: Result<void, DomainError>
Errors: PermissionDeniedError, FileNodeNotFoundError
```

Logic:
1. Verify actor is a project member.
2. Load `FileNode` by `fileNodeId`.
3. Call `projectFileStore.write(projectId, fileNode.path, content)`.
4. Update `Document.contentId` (new UUID) and `Document.updatedAt` via `DocumentRepository`.

---

### `CreateFileUseCase`

Creates a new AsciiDoc document node in the file tree and its corresponding content file.

```
Input:  actorId: UserId, projectId: ProjectId, parentId: FileNodeId,
        name: string, mimeType: MimeType, initialContent: Buffer
Output: Result<{ fileNodeId: FileNodeId, path: FilePath }, DomainError>
Errors: PermissionDeniedError, FileNodeNotFoundError (parent), FileConflictError
```

Logic:
1. Verify actor is a project member.
2. Verify parent `FileNode` exists and is a folder.
3. Derive `newPath` from parent path + name.
4. Call `projectFileStore.createExclusive(projectId, newPath, initialContent)` — fails if path taken.
5. Persist new `FileNode` and `Document` records in the database.

---

### `CreateFolderUseCase`

Creates a new folder node in the file tree and its directory on disk.

```
Input:  actorId: UserId, projectId: ProjectId, parentId: FileNodeId, name: string
Output: Result<{ fileNodeId: FileNodeId, path: FilePath }, DomainError>
Errors: PermissionDeniedError, FileNodeNotFoundError (parent), FileConflictError
```

Logic:
1. Verify actor is a project member.
2. Verify parent `FileNode` exists and is a folder.
3. Derive `newPath`.
4. Call `projectFileStore.createDirectory(projectId, newPath)`.
5. Persist new `FileNode` record.

---

### `MoveFileUseCase`

Moves a file or folder to a different parent folder within the same project.

```
Input:  actorId: UserId, projectId: ProjectId, fileNodeId: FileNodeId,
        newParentId: FileNodeId
Output: Result<{ fileNodeId: FileNodeId, newPath: FilePath }, DomainError>
Errors: PermissionDeniedError, FileNodeNotFoundError, CannotDeleteRootFolderError,
        FileConflictError
```

Logic:
1. Verify actor is a project member.
2. Load `FileNode`; verify it is not the root.
3. Load new parent `FileNode`; verify it is a folder.
4. Derive `newPath` from new parent path + file name.
5. Call `projectFileStore.move(projectId, oldPath, newPath)` — fails if target exists.
6. Update `FileNode` with new `parentId` and `path`.

---

### `UploadAssetUseCase`

Saves an uploaded file of any type to the project's file store and persists its metadata. No MIME type restriction is enforced; the caller-provided MIME type is recorded as-is. Metadata is stored using the existing `Image` domain entity, which is treated as a generic file asset record.

The maximum permitted size is read at request time from `SystemSettingRepository` (key: `maxUploadSizeBytes`). If no runtime setting is stored, the use case falls back to the `defaultMaxUploadSizeBytes` constructor parameter (sourced from the env var). This allows administrators to change the limit at runtime without a server restart.

```
Input:  actorId: UserId, projectId: ProjectId, parentId: FileNodeId,
        filename: string, mimeType: MimeType, bytes: Buffer
Output: Result<{ assetId: ImageId, storagePath: string }, DomainError>
Errors: PermissionDeniedError, FileNodeNotFoundError (parent),
        FileConflictError, ValidationError (size limit exceeded)
```

Logic:
1. Verify actor is a project member.
2. Read effective limit: call `systemSettingRepo.find('maxUploadSizeBytes')`; parse value if present, else use `defaultMaxUploadSizeBytes`.
3. Verify `bytes.length ≤ effectiveLimit`; return `ValidationError` if exceeded (message must NOT include the limit value — use generic "File exceeds maximum permitted size").
4. Verify parent `FileNode` exists and is a folder.
5. Derive `storagePath` = parent path + filename.
6. Call `projectFileStore.createExclusive(projectId, storagePath, bytes)`.
7. Persist new `FileNode` and `Image` records.

Constructor: `(memberRepo, fileNodeRepo, imageRepo, fileStore: ProjectFileStore, systemSettingRepo: SystemSettingRepository, defaultMaxUploadSizeBytes: number)`

---

### `GetAssetContentUseCase`

Reads the raw bytes of an uploaded file asset for a project member.

```
Input:  actorId: UserId, projectId: ProjectId, assetId: ImageId
Output: Result<{ bytes: Buffer, mimeType: MimeType, filename: string }, DomainError>
Errors: PermissionDeniedError, FileNodeNotFoundError, ContentNotFoundError
```

---

## New Domain Error

### `ContentNotFoundError` — `packages/domain/src/errors/content-not-found.ts`

Thrown when a `FileNode` or `Image` record exists in the database but its corresponding file is missing from the filesystem (e.g., storage corruption or incomplete deletion).

The `path` parameter is stored as private metadata for **server-side logging only**. The `message` property exposed to callers (and ultimately to API clients) MUST be a generic string that does not include the filesystem path, to prevent internal path leakage per the security constitution.

```
ContentNotFoundError extends DomainError {
  name = 'ContentNotFoundError'
  readonly internalPath: string   // for logging; NEVER sent to clients
  constructor(path: string) {
    super('Content not found')    // generic message — no path in client-visible text
    this.internalPath = path
  }
}
```

The Fastify error handler MUST map `ContentNotFoundError` to `404 { error: { code: 'NOT_FOUND', message: 'The requested content could not be found' } }` — stripping `internalPath` from the response.

---

## In-Memory Fakes (Test Infrastructure)

Both new interfaces require in-memory fakes for domain unit tests:

### `InMemoryProjectFileStore`

- Backed by `Map<string, Buffer>` keyed on `"${projectId}:${filePath}"`.
- `createExclusive` checks map for existing key before inserting.
- `move` checks for conflict at destination, then renames the key.
- `removeDirectory` removes all keys with matching path prefix.
- `removeProject` removes all keys with matching project prefix.

### `InMemoryYjsStateStore`

- Backed by `Map<string, Buffer>` keyed on `"${projectId}:${yjsStateId}"`.
- `deleteAllForProject` removes all keys with matching project prefix.
