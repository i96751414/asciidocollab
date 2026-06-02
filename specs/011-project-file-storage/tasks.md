# Tasks: Per-Project Isolated File Storage

**Input**: Design documents from `specs/011-project-file-storage/`

**Constitution**: TDD is NON-NEGOTIABLE — every production code task is preceded by a failing test task. Write the test, confirm it fails (RED), then implement (GREEN).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no shared dependencies)
- **[Story]**: Which user story this task belongs to (US1–US5)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: New config fields, shared error types, and DTOs that every subsequent phase depends on.

- [X] T001 Add `storage.path` (`ASCIIDOCOLLAB_STORAGE_PATH`) and `storage.maxUploadSizeBytes` (`ASCIIDOCOLLAB_STORAGE_MAX_UPLOAD_BYTES`, default `20971520`) fields to `apps/api/src/config/schema.ts`
- [X] T001a Add `maxUploadSizeBytes` constant to `packages/domain/src/constants.ts` (the string key used to read/write the setting in `SystemSettingRepository`) — e.g. `export const SETTING_MAX_UPLOAD_SIZE_BYTES = 'maxUploadSizeBytes'`
- [X] T001b Write unit tests (RED) for the admin max-upload-size setting in `packages/domain/tests/use-cases/admin-set-max-upload-size.test.ts` — using existing `InMemorySystemSettingRepository`; cover: admin can set `maxUploadSizeBytes` to a new value, non-admin is rejected with `PermissionDeniedError`, setting is persisted and readable on next call
- [X] T001c Extend the existing admin settings use-case and route (`apps/api/src/routes/admin/settings.ts`) to include `maxUploadSizeBytes`: `GET /admin/settings` returns current value (falling back to env-var default if no DB entry), `PATCH /admin/settings` with `{ maxUploadSizeBytes: number }` persists the value via `SystemSettingRepository` — make T001b GREEN
- [X] T002 [P] Create `ContentNotFoundError` in `packages/domain/src/errors/content-not-found.ts` — extends `DomainError`; constructor takes `path: string` stored as `readonly internalPath: string` (for server-side logging only); `super('Content not found')` sets a generic message that NEVER includes the path; `name = 'ContentNotFoundError'`; Fastify error handler maps this to `404 { error: { code: 'NOT_FOUND', message: 'The requested content could not be found' } }` with no path in the response
- [X] T003 [P] Create `FileTreeEventDto` in `packages/shared/src/dtos/file-tree-event.dto.ts` — fields: `type: 'created'|'deleted'|'renamed'|'moved'`, `fileNodeId: string`, `nodeType: 'file'|'folder'`, `name: string`, `path: string`, `parentId: string|null`
- [X] T004 Export `ContentNotFoundError` from `packages/domain/src/index.ts`
- [X] T005 Export `FileTreeEventDto` from `packages/shared/src/index.ts`

**Checkpoint**: Config, error type, and shared DTO in place.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: `ProjectFileStore` and `YjsStateStore` interfaces, in-memory fakes (for domain unit tests), and filesystem implementations (for infra integration tests). All user story use cases depend on these.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T006 Define `ProjectFileStore` interface in `packages/domain/src/storage/project-file-store.ts` — methods: `read`, `write`, `createExclusive`, `remove`, `move`, `createDirectory`, `removeDirectory`, `removeProject` (exact signatures per data-model.md)
- [X] T007 [P] Define `YjsStateStore` interface in `packages/domain/src/storage/yjs-state-store.ts` — methods: `load`, `save`, `delete`, `deleteAllForProject`
- [X] T008 [P] Implement `InMemoryProjectFileStore` in `packages/domain/tests/storage/in-memory-project-file-store.ts` — backed by `Map<string, Buffer>` keyed on `"${projectId}:${filePath}"`; `createExclusive` returns `FileConflictError` if key exists; `move` checks destination; `removeDirectory`/`removeProject` use prefix matching
- [X] T009 [P] Implement `InMemoryYjsStateStore` in `packages/domain/tests/storage/in-memory-yjs-state-store.ts` — backed by `Map<string, Buffer>` keyed on `"${projectId}:${yjsStateId}"`; `deleteAllForProject` removes all matching prefix
- [X] T010 Create `packages/domain/src/storage/index.ts` exporting `ProjectFileStore` and `YjsStateStore`; add `export * from './storage'` to `packages/domain/src/index.ts` — fakes live in `tests/storage/` and are NOT exported from the production index
- [X] T011 Write integration tests (RED) for `FilesystemProjectFileStore` in `packages/infrastructure/tests/storage/filesystem-project-file-store.test.ts` — cover: read/write roundtrip, atomic overwrite, `createExclusive` conflict, `move` conflict, directory auto-creation, `removeProject` removes all files, path traversal rejected
- [X] T012 Implement `FilesystemProjectFileStore` in `packages/infrastructure/src/storage/filesystem-project-file-store.ts` — constructor takes `storageRoot: string`; uses write-then-rename for atomicity; `createExclusive` uses `fs.open(path, 'wx')`; `resolveSafe` helper verifies resolved path starts with project dir (GREEN for T011)
- [X] T013 Write integration tests (RED) for `FilesystemYjsStateStore` in `packages/infrastructure/tests/storage/filesystem-yjs-state-store.test.ts` — cover: load returns null when missing, save then load roundtrip, `delete` removes file, `deleteAllForProject` removes `.collab/` dir
- [X] T014 Implement `FilesystemYjsStateStore` in `packages/infrastructure/src/storage/filesystem-yjs-state-store.ts` — states stored under `<storageRoot>/<projectId>/.collab/<yjsStateId>`; auto-creates `.collab/` on first `save` (GREEN for T013)
- [X] T015a Write unit tests (RED) for `HocuspocusPersistenceExtension` in `apps/api/tests/plugins/hocuspocus-persistence.test.ts` — using `InMemoryYjsStateStore` and a synthetic `Y.Doc`; cover: `onLoadDocument` applies previously saved state, `onLoadDocument` is a no-op when no state exists, `onStoreDocument` calls `yjsStateStore.save` with the correct projectId and yjsStateId (parsed from document name `<projectId>/<yjsStateId>`), and state round-trips correctly
- [X] T015 Implement `HocuspocusPersistenceExtension` in `apps/api/src/plugins/hocuspocus-persistence.ts` — this is a delivery-layer file; imports `@hocuspocus/server` Extension interface here (NOT in packages/infrastructure); constructor takes `yjsStateStore: YjsStateStore` injected from outside; `onLoadDocument` calls `yjsStateStore.load`; `onStoreDocument` calls `yjsStateStore.save`; document name format: `<projectId>/<yjsStateId>` (GREEN for T015a)
- [X] T016 Export `FilesystemProjectFileStore`, `FilesystemYjsStateStore` from `packages/infrastructure/src/index.ts` — HocuspocusPersistenceExtension lives in apps/api and is NOT exported from this package

**Checkpoint**: Storage interfaces and adapters complete. Domain tests can use in-memory fakes; infra tests pass against real temp directories.

---

## Phase 3: User Story 1 — Read Document Content (Priority: P1) 🎯 MVP

**Goal**: A project member can open a document and retrieve its current AsciiDoc content via the API.

**Independent Test**: Seed a file directly to the filesystem at `<storageRoot>/<projectId>/<filePath>`, call `GET /projects/:id/files/:fileNodeId/content`, verify the correct bytes are returned.

- [X] T017 Write domain unit tests (RED) for `GetDocumentContentUseCase` in `packages/domain/tests/use-cases/get-document-content.test.ts` — using `InMemoryProjectFileStore`; cover: returns content for project member, returns `PermissionDeniedError` for non-member, returns `FileNodeNotFoundError` for unknown node, returns `ContentNotFoundError` when file missing from store
- [X] T018 Implement `GetDocumentContentUseCase` in `packages/domain/src/use-cases/get-document-content.ts` — constructor: `(memberRepo, fileNodeRepo, documentRepo, fileStore: ProjectFileStore)`; validates membership, loads FileNode + Document, calls `fileStore.read(projectId, fileNode.path)` (GREEN for T017)
- [X] T019 Export `GetDocumentContentUseCase` from `packages/domain/src/index.ts`
- [X] T020 Implement `GET /projects/:projectId/files/:fileNodeId/content` route in `apps/api/src/routes/projects/file-content.ts` — calls `GetDocumentContentUseCase`; responds `200 text/plain` on success; maps `PermissionDeniedError→403`, `FileNodeNotFoundError→404`, `ContentNotFoundError→404`
- [X] T021 Register `file-content` routes under `/projects` in `apps/api/src/index.ts` and inject `GetDocumentContentUseCase` with `FilesystemProjectFileStore`
- [X] T022 [P] Create `apps/web/src/lib/api/file-content.ts` — export `getDocumentContent(projectId, fileNodeId): Promise<string>` fetching `GET /projects/:id/files/:fileNodeId/content`

**Checkpoint**: `GET` endpoint live; content is readable via API for any project member.

---

## Phase 4: User Story 2 — Persist Document Edits (Priority: P1)

**Goal**: A project member can save updated AsciiDoc content for a document; edits survive page reload.

**Independent Test**: `PUT` content to `/projects/:id/files/:fileNodeId/content`, then `GET` the same endpoint and verify the saved content is returned.

- [X] T023 Write domain unit tests (RED) for `SaveDocumentContentUseCase` in `packages/domain/tests/use-cases/save-document-content.test.ts` — using `InMemoryProjectFileStore`; cover: saves content, subsequent `read` returns new content, returns `PermissionDeniedError` for non-member, returns `FileNodeNotFoundError` for unknown node
- [X] T024 Implement `SaveDocumentContentUseCase` in `packages/domain/src/use-cases/save-document-content.ts` — constructor: `(memberRepo, fileNodeRepo, documentRepo, fileStore: ProjectFileStore)`; validates membership, calls `fileStore.write(projectId, fileNode.path, content)`, updates `Document.contentId` with a new UUID and persists via `documentRepo.save` (GREEN for T023)
- [X] T025 Export `SaveDocumentContentUseCase` from `packages/domain/src/index.ts`
- [X] T026 Add `PUT /projects/:projectId/files/:fileNodeId/content` to `apps/api/src/routes/projects/file-content.ts` — reads body as `text/plain`, calls `SaveDocumentContentUseCase`, responds `204`
- [X] T027 Inject `SaveDocumentContentUseCase` with `FilesystemProjectFileStore` in `apps/api/src/index.ts`

**Checkpoint**: Full read–write cycle works end-to-end; edits persist across requests.

---

## Phase 5: User Story 4 — Project Storage Lifecycle (Priority: P2)

**Goal**: Project directory is automatically created on first write; deleted when the project is deleted; file tree operations (create file/folder, rename, move, delete) keep DB metadata and filesystem in sync.

**Independent Test**: Create a project, create a file via API, verify file exists on disk at the expected path. Delete the project, verify the directory is gone. Rename a file, verify the old path is gone and new path has the content.

- [X] T028 [US4] Write domain unit tests (RED) for `CreateFileUseCase` in `packages/domain/tests/use-cases/create-file.test.ts` — cover: creates FileNode + Document + calls `fileStore.createExclusive`; returns `FileConflictError` when path taken; returns `PermissionDeniedError` for non-member; returns `FileNodeNotFoundError` for unknown parent
- [X] T029 [US4] Implement `CreateFileUseCase` in `packages/domain/src/use-cases/create-file.ts` — constructor: `(memberRepo, fileNodeRepo, documentRepo, fileStore: ProjectFileStore)`; validates membership, derives path, calls `fileStore.createExclusive`, persists FileNode + Document (GREEN for T028)
- [X] T030 [P] [US4] Write domain unit tests (RED) for `CreateFolderUseCase` in `packages/domain/tests/use-cases/create-folder.test.ts` — cover: creates FileNode, calls `fileStore.createDirectory`; returns errors for non-member and unknown parent
- [X] T031 [P] [US4] Implement `CreateFolderUseCase` in `packages/domain/src/use-cases/create-folder.ts` — constructor: `(memberRepo, fileNodeRepo, fileStore: ProjectFileStore)`; validates membership, derives path, calls `fileStore.createDirectory`, persists FileNode (GREEN for T030)
- [X] T032 [US4] Write domain unit tests (RED) for `MoveFileUseCase` in `packages/domain/tests/use-cases/move-file.test.ts` — cover: updates FileNode parentId + path, calls `fileStore.move`; returns `FileConflictError` on destination conflict; cannot move root
- [X] T033 [US4] Implement `MoveFileUseCase` in `packages/domain/src/use-cases/move-file.ts` — constructor: `(memberRepo, fileNodeRepo, fileStore: ProjectFileStore)`; validates membership, resolves new path, calls `fileStore.move`, updates FileNode (GREEN for T032)
- [X] T034 [US4] Write domain unit tests (RED) for modified `DeleteFileUseCase` with `ProjectFileStore` + `YjsStateStore` — extend existing test file `packages/domain/tests/use-cases/delete-file.test.ts`; add cases: `fileStore.remove` called for file nodes, `yjsStateStore.delete` called when document exists, `fileStore.removeDirectory` called for folder nodes
- [X] T035 [US4] Modify `DeleteFileUseCase` in `packages/domain/src/use-cases/delete-file.ts` — add `fileStore: ProjectFileStore` and `yjsStateStore: YjsStateStore` constructor params; after DB deletion call `fileStore.remove`/`fileStore.removeDirectory` and `yjsStateStore.delete` as appropriate (GREEN for T034)
- [X] T036 [US4] Write domain unit tests (RED) for modified `RenameFileUseCase` with `ProjectFileStore` — extend `packages/domain/tests/use-cases/rename-file.test.ts`; add case: `fileStore.move` called with old and new path; returns `FileConflictError` when new path occupied
- [X] T037 [US4] Modify `RenameFileUseCase` in `packages/domain/src/use-cases/rename-file.ts` — add `fileStore: ProjectFileStore` constructor param; after updating FileNode call `fileStore.move(projectId, oldPath, newPath)` (GREEN for T036)
- [X] T038 [US4] Write domain unit tests (RED) for modified `DeleteProjectUseCase` with storage cleanup — extend `packages/domain/tests/use-cases/delete-project.test.ts`; add cases: `fileStore.removeProject` called, `yjsStateStore.deleteAllForProject` called
- [X] T039 [US4] Modify `DeleteProjectUseCase` in `packages/domain/src/use-cases/delete-project.ts` — add `fileStore: ProjectFileStore` and `yjsStateStore: YjsStateStore` constructor params; after DB deletion call both cleanup methods (GREEN for T038)
- [X] T040 [US4] Export `CreateFileUseCase`, `CreateFolderUseCase`, `MoveFileUseCase` from `packages/domain/src/index.ts`
- [X] T041 [US4] Implement `POST /projects/:projectId/files`, `DELETE /projects/:projectId/files/:fileNodeId`, and `PATCH /projects/:projectId/files/:fileNodeId` routes in `apps/api/src/routes/projects/file-tree.ts` — `POST` dispatches to `CreateFileUseCase` or `CreateFolderUseCase` based on `type` field; `DELETE` calls `DeleteFileUseCase`; `PATCH` calls `RenameFileUseCase` (name change) or `MoveFileUseCase` (parentId change) or both; maps `FileConflictError→409`
- [X] T042 [US4] Register `file-tree` routes and inject all modified/new use cases with `FilesystemProjectFileStore` + `FilesystemYjsStateStore` in `apps/api/src/index.ts`

**Checkpoint**: Full file tree CRUD works; filesystem and database stay in sync; project deletion cleans up all storage.

---

## Phase 6: User Story 3 — Upload and Retrieve Files (Priority: P2)

**Goal**: A project member can upload a file of any type to a project folder and retrieve its bytes; assets are isolated per project; oversized uploads are rejected.

**Independent Test**: Upload a PNG, a CSV, and a plain-text file to `POST /projects/:id/images`, verifying `201` with `assetId` each time; call `GET /projects/:id/images/:assetId` for each, verify the correct bytes and original `Content-Type` are returned. Attempt any upload from a different project, verify `403`.

- [X] T043 [US3] Write domain unit tests (RED) for `UploadAssetUseCase` in `packages/domain/tests/use-cases/upload-asset.test.ts` — cover: creates FileNode + Image for any MIME type (image, CSV, PDF, plain text); rejects bytes over the DB-configured limit with `ValidationError` (message must not include the limit value); rejects bytes over `defaultMaxUploadSizeBytes` when no DB setting exists; admin-set limit overrides the default; rejects non-member with `PermissionDeniedError`; rejects conflict with `FileConflictError`; MIME type is stored as-is without restriction
- [X] T044 [US3] Implement `UploadAssetUseCase` in `packages/domain/src/use-cases/upload-asset.ts` — constructor: `(memberRepo, fileNodeRepo, imageRepo, fileStore: ProjectFileStore, systemSettingRepo: SystemSettingRepository, defaultMaxUploadSizeBytes: number)`; reads effective limit from `systemSettingRepo.find(SETTING_MAX_UPLOAD_SIZE_BYTES)` falling back to `defaultMaxUploadSizeBytes`; validates size without MIME type check; error message is generic (no limit value exposed); derives storagePath; calls `fileStore.createExclusive`; persists FileNode + Image (GREEN for T043)
- [X] T045 [P] [US3] Write domain unit tests (RED) for `GetAssetContentUseCase` in `packages/domain/tests/use-cases/get-asset-content.test.ts` — cover: returns bytes + mimeType + filename for member for any file type; `PermissionDeniedError` for non-member; `ContentNotFoundError` when file missing
- [X] T046 [P] [US3] Implement `GetAssetContentUseCase` in `packages/domain/src/use-cases/get-asset-content.ts` — constructor: `(memberRepo, imageRepo, fileNodeRepo, fileStore: ProjectFileStore)`; validates membership, loads Image + FileNode, calls `fileStore.read` (GREEN for T045)
- [X] T047 [US3] Export `UploadAssetUseCase`, `GetAssetContentUseCase` from `packages/domain/src/index.ts`
- [X] T048 [US3] Add `@fastify/multipart` to `apps/api` and implement `POST /projects/:projectId/images` (multipart) and `GET /projects/:projectId/images/:assetId` routes in `apps/api/src/routes/projects/images.ts` — `POST` streams bytes to the use case which enforces the admin-configurable limit; accepts ANY MIME type; `GET` sets `Content-Type` and `Content-Disposition` headers from Image metadata; maps `ValidationError→413` (generic message, no limit value in response), `FileConflictError→409`
<!-- T049 intentionally omitted — was a draft task that was merged into T048 during planning -->
- [X] T050 [US3] Register `images` routes and inject `UploadAssetUseCase` + `GetAssetContentUseCase` with `FilesystemProjectFileStore` + `PrismaSystemSettingRepository` + `defaultMaxUploadSizeBytes` from config in `apps/api/src/index.ts`
- [X] T051 [P] [US3] Create `apps/web/src/lib/api/assets.ts` — export `uploadAsset(projectId, parentId, file: File): Promise<{assetId, filename, storagePath, sizeBytes, mimeType}>` and `getAssetUrl(projectId, assetId): string`
- [X] T052a [US3] Write unit tests (RED) for `walkEntries` in `apps/web/tests/lib/fs-entry-walker.test.ts` — using jsdom with mocked `DataTransferItem` objects; cover: flat file drop yields correct `{file, relativePath}` pairs, directory drop recursively yields all contained files with correct relative paths (e.g. `subdir/file.txt`), mixed file+folder drop works, empty DataTransferItemList yields nothing, `readEntries` pagination (batch returns fewer than total) is handled by looping until empty batch
- [X] T052 [US3] Create `apps/web/src/lib/fs-entry-walker.ts` — export `walkEntries(items: DataTransferItemList): AsyncIterable<{file: File, relativePath: string}>` that resolves each drag item via `(item.getAsEntry?.() ?? item.webkitGetAsEntry?.())` (unprefixed first for standards compliance, vendor-prefixed as fallback for Safari/older browsers), recursively traverses `FileSystemDirectoryEntry` nodes via `reader.readEntries()` (calling until the batch is empty, as the API may return fewer entries than available), and yields each `FileSystemFileEntry` with its relative path (e.g. `subdir/file.txt`)
- [X] T052b [US3] Write unit tests (RED) for `useDropUpload` hook in `apps/web/tests/hooks/useDropUpload.test.ts` — using `renderHook` with mocked `walkEntries`, `createFolder`, and `uploadAsset`; cover: flat file drop calls `uploadAsset` for each file with correct `parentId`; folder drop calls `createFolder` for each intermediate directory (depth-first, in order) before `uploadAsset` for each file; deeply nested drop (e.g. `a/b/c/file.txt`) creates folders `a`, `a/b`, `a/b/c` in that order before uploading the file; per-item status transitions are reflected in `progress` (`pending` → `uploading` → `done`); one item failure sets that item's status to `error` with an `errorMessage` and does not cancel remaining items; `FileConflictError` on `createFolder` is skipped (folder already exists) and upload proceeds; after all items complete with no errors the hook signals completion (to trigger auto-dismiss); **no test may assert that a file node appears in the file tree during upload — the hook's only tree-visible side effect is the SSE `created` event emitted server-side after HTTP 201**
- [X] T052c [US3] Implement `useDropUpload(targetFolderId: string, projectId: string)` hook in `apps/web/src/hooks/useDropUpload.ts` — exposes `{ onDrop(items: DataTransferItemList): void, progress: UploadProgress[] }` (types per plan.md Technical Context); calls `walkEntries`, creates all intermediate folders sequentially (depth-first), then uploads each file; each item transitions through `pending → uploading → done | error`; failed items record `errorMessage`; all orchestration logic lives here; `DragDropZone` calls this hook and renders only drop-highlight UI plus `<UploadProgressPanel progress={progress} />` (GREEN for T052b)
- [X] T052d [P] [US3] Add shadcn `Progress` component via `npx shadcn@latest add progress` in `apps/web` — prerequisite for `UploadProgressPanel` (T052e); no tests required
- [X] T052e_a [US3] Write unit tests (RED) for `UploadProgressPanel` in `apps/web/tests/components/file-tree/UploadProgressPanel.test.tsx` — using React Testing Library; cover: renders overall progress counter text ("N / M files") with correct numbers; progress bar `aria-valuenow` equals number of completed items (done + error); each item row shows the filename and the correct aria-label on its status icon (`"uploading"`, `"done"`, `"failed: <errorMessage>"`); when all items have status `done` no close button is rendered and `onDismiss` is called after 2 s; when any item has status `error` a close button is rendered and `onDismiss` is NOT called automatically; clicking the close button calls `onDismiss`; the items list has `overflow-y: auto` / `max-height` styling so it scrolls when the list is long; items with `status: 'error'` display their `errorMessage`
- [X] T052e [US3] Implement `UploadProgressPanel` in `apps/web/src/components/file-tree/UploadProgressPanel.tsx` — props: `progress: UploadProgress[]`, `onDismiss: () => void`; renders a floating panel positioned absolute at the bottom of the nearest positioned ancestor (the `DragDropZone` root); contents: (1) header row showing "N / M files" counter, (2) shadcn `Progress` bar (`value = completedCount / total * 100`), (3) scrollable items list (`overflow-y: auto`, `max-height: 16rem`) where each item shows filename + status icon (spinner from lucide-react while `uploading`, checkmark when `done`, ✕ + `errorMessage` when `error`); footer: close button rendered only when any item has `status: 'error'` — clicking it calls `onDismiss`; when all items are `done` or `error` and none are `error`, auto-calls `onDismiss` after 2 s via `useEffect` cleanup (GREEN for T052e_a)
- [X] T053a [US3] Write unit tests (RED) for `DragDropZone` in `apps/web/tests/components/file-tree/DragDropZone.test.tsx` — using React Testing Library with mocked `useDropUpload` and mocked `UploadProgressPanel`; cover: drop highlight appears on `dragOver`, clears on `dragLeave` and after drop; `onDrop` from `useDropUpload` is called with `dataTransfer.items` on drop; `UploadProgressPanel` is rendered when `progress` is non-empty; `UploadProgressPanel` is not rendered when `progress` is empty; **no test may assert that any file tree node is added to the tree during an upload**
- [X] T053 [US3] Implement `DragDropZone` in `apps/web/src/components/file-tree/DragDropZone.tsx` — purely presentational; delegates all orchestration to `useDropUpload(targetFolderId, projectId)`; handles only `onDragOver` (show drop highlight), `onDragLeave` (clear highlight), `onDrop` (call hook's `onDrop`); renders `<UploadProgressPanel progress={progress} onDismiss={clearProgress} />` when `progress` is non-empty; `clearProgress` resets the progress array to `[]` (GREEN for T053a)
- [X] T054 [US3] Integrate `DragDropZone` into `FileTreeNode.tsx` — wrap each folder node render with `DragDropZone` passing the folder's `fileNodeId` as `targetFolderId`; also wrap the tree root so files can be dropped at the top level

**Checkpoint**: File asset upload and retrieval work end-to-end for any file type; size limit enforced; no MIME type restriction; drag-and-drop of files and folders works with recursive directory support; `UploadProgressPanel` appears on drop, shows overall progress bar and scrollable per-item status list, auto-dismisses on full success, stays open with close button on any error; file nodes do not appear in the tree until server confirms each individual upload.

---

## Phase 7: User Story 5 — Real-Time File Tree Sync (Priority: P2)

**Goal**: All browser tabs and collaborator sessions see file tree changes (create, delete, rename, move) within 2 seconds, without a page refresh. Multiple tabs in the same browser share a single SSE connection.

**Independent Test**: Open the same project in two browser sessions. In session A, create a file via API. Verify the file appears in session B's file tree within 2 seconds without any manual action. Open two tabs in the same browser; verify only one SSE connection appears in the network inspector.

- [X] T055a [US5] Write unit tests (RED) for `FileTreeEventBus` plugin in `apps/api/tests/plugins/file-tree-event-bus.test.ts` — build a test Fastify instance and register the plugin; cover: subscribed listener receives emitted event for same project, multiple listeners on same project all receive the event, listener for project A does not receive events emitted for project B, returned unsubscribe function stops delivery, emitter is cleaned up when last subscriber unsubscribes
- [X] T055 [US5] Implement `FileTreeEventBus` as a Fastify plugin in `apps/api/src/plugins/file-tree-event-bus.ts` — decorates `fastify.fileTreeEventBus` with `emit(projectId, event: FileTreeEventDto): void` and `subscribe(projectId, listener): () => void`; backed by per-project `EventEmitter` instances; cleans up empty emitters (GREEN for T055a)
- [X] T056a [US5] Write route tests (RED) for the SSE events endpoint in `apps/api/tests/routes/events.test.ts` — using `fastify.inject()`; cover: returns `403` for non-member, returns `200` with `Content-Type: text/event-stream` and `Cache-Control: no-cache` headers for project member, verifies `fileTreeEventBus.subscribe` is called with the correct `projectId` (streaming data lines are validated by Phase 7 independent test)
- [X] T056 [US5] Implement `GET /projects/:projectId/events` SSE route in `apps/api/src/routes/projects/events.ts` — verifies project membership; sets `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`; calls `reply.raw.flushHeaders()`; subscribes to `fileTreeEventBus` and writes `data: <JSON>\n\n` per event; emits `: keepalive\n\n` every 30 s; unsubscribes on `req.raw.on('close')` (GREEN for T056a)
- [X] T057 [US5] Register `FileTreeEventBus` plugin and `events` route in `apps/api/src/index.ts`
- [X] T058 [US5] Emit `FileTreeEventDto` via `fastify.fileTreeEventBus.emit(projectId, event)` in `apps/api/src/routes/projects/file-tree.ts` and `apps/api/src/routes/projects/images.ts` after each successful `CreateFile`, `CreateFolder`, `DeleteFile`, `RenameFile`, `MoveFile`, and `UploadAsset` operation
- [X] T059 [US5] Implement `apps/web/src/workers/file-tree-events.worker.ts` as a `SharedWorker` — holds one `EventSource` per project (keyed `Map<projectId, EventSource>`); tracks registered `MessagePort`s per project; on `subscribe` message: registers port, opens `EventSource` if not yet open; on SSE `message`: fans out to all ports for that project; on `onerror`: sends `{type:'reconnect'}` to all ports; closes `EventSource` and cleans up when last port for a project disconnects
- [X] T060a [US5] Write unit tests (RED) for `useFileTreeEvents` in `apps/web/tests/hooks/useFileTreeEvents.test.ts` — using `renderHook` with a mocked `SharedWorker`; cover: posts `subscribe` message on mount with correct `projectId` and `apiBase`, calls `onEvent` callback when `file-tree-change` message received, calls `onReconnect` when `reconnect` message received, removes message listener on unmount
- [X] T060 [US5] Implement `apps/web/src/hooks/useFileTreeEvents.ts` — lazy-initialises the `SharedWorker` singleton; posts `{type:'subscribe', projectId, apiBase}` on mount; listens for `file-tree-change` and `reconnect` messages; calls `onEvent` / `onReconnect` callbacks; removes listener on unmount
- [X] T061a [US5] Write unit tests (RED) for `FileTreeNode` in `apps/web/tests/components/file-tree/FileTreeNode.test.tsx` — using React Testing Library; cover: renders file node name, renders folder node as collapsible (click toggles children), calls `onSelect` on click, calls `onContextMenu` on right-click, folder nodes are wrapped in `DragDropZone`
- [X] T061 [US5] Implement `FileTreeNode` in `apps/web/src/components/file-tree/FileTreeNode.tsx` — renders a single file or folder node; folder nodes are collapsible; accepts `node: FileTreeNode`, `depth: number`, `onSelect`, `onContextMenu` props
- [X] T062a [US5] Write unit tests (RED) for `FileTreeActions` in `apps/web/tests/components/file-tree/FileTreeActions.test.tsx` — using React Testing Library; cover: all six menu items are present (New File, New Folder, Upload File, Rename, Move, Delete), each item invokes the correct API helper when selected, `FileConflictError` response shows conflict toast, other errors show generic error toast
- [X] T062 [US5] Implement `FileTreeActions` in `apps/web/src/components/file-tree/FileTreeActions.tsx` — context menu (shadcn/ui `DropdownMenu`) with items: New File, New Folder, Upload File, Rename, Move, Delete; each item calls the appropriate API helper then optimistically updates local state; shows inline conflict or error toast on failure
- [X] T063a [US5] Write unit tests (RED) for `FileTree` in `apps/web/tests/components/file-tree/FileTree.test.tsx` — using React Testing Library with mocked fetch and mocked `useFileTreeEvents`; cover: initial tree is fetched and rendered on mount, `created` event adds a node to the rendered tree, `deleted` event removes a node, `renamed` event updates the node name, `moved` event updates the node position, `reconnect` triggers a full re-fetch
- [X] T063 [US5] Implement `FileTree` in `apps/web/src/components/file-tree/FileTree.tsx` — fetches initial tree via `GET /projects/:id/files`; calls `useFileTreeEvents` with an `onEvent` handler that applies incremental `FileTreeEventDto` updates to the tree state; on `reconnect` re-fetches the full tree to reconcile; tracks `selectedNodeId: string | null` state (updated when a `FileTreeNode` is clicked); renders `FileTreeNode` list; exposes `selectedNodeId` and `containerRef` for use by `useFileTreeKeyHandler` (wired in T094)

**Checkpoint**: Live file tree visible; multi-tab browsers use one SSE connection; all structural changes propagate in real time.

---

## Phase 9: User Story 6 — Configurable File Tree Keyboard Shortcuts (Priority: P3)

**Goal**: Users can trigger Rename, Delete, New File, and New Folder from the keyboard while the file tree is focused. Each user can remap bindings from their account settings page. The binding system is namespace-aware for future extensibility.

**Independent Test**: Focus a file tree node, press `F2`, verify the rename interaction begins. Navigate to account settings → Keyboard Shortcuts, remap rename to `F3`, return to the file tree, press `F3` and verify rename begins; press `F2` and verify nothing happens.

- [X] T072a [P] [US6] Define `KeyBinding` domain entity in `packages/domain/src/entities/key-binding.ts` — plain interface `{ userId: string; action: string; keyCombo: string }`; export from `packages/domain/src/index.ts`
- [X] T072 [US6] Add `UserKeyBinding` model to Prisma schema — fields: `id String @id @default(uuid())`, `userId String`, `action String`, `keyCombo String`, `updatedAt DateTime @updatedAt`; relation `user User @relation(fields: [userId], references: [id], onDelete: Cascade)`; unique constraint `@@unique([userId, action])`; generate and apply migration
- [X] T073 [US6] Create `DEFAULT_KEY_BINDINGS` registry in `packages/domain/src/constants/key-bindings.ts` — export `KeyBindingDefinition { namespace: string, label: string, defaultCombo: string }` and `DEFAULT_KEY_BINDINGS: Record<string, KeyBindingDefinition>` containing the four file-tree actions: `'file-tree:rename'→F2`, `'file-tree:delete'→Delete`, `'file-tree:new-file'→Ctrl+N`, `'file-tree:new-folder'→Ctrl+Shift+N`; export `RESERVED_KEY_COMBOS: string[]` listing browser-reserved combos (`Ctrl+W`, `Ctrl+T`, `Ctrl+R`, `F5`, `F11`, `Alt+F4`); add inline comment on `Alt+F4`: "listed defensively — browsers typically cannot intercept this OS-level shortcut; entry serves as documentation intent rather than a runtime guard"
- [X] T074 [P] [US6] Create `KeyBindingConflictError` in `packages/domain/src/errors/key-binding-conflict.ts` — extends `DomainError`; constructor takes `action: string` and `conflictingAction: string`; generic message; name `'KeyBindingConflictError'`
- [X] T075 [P] [US6] Define `KeyBindingRepository` interface in `packages/domain/src/repositories/key-binding.repository.ts` — methods: `findAll(userId: string): Promise<KeyBinding[]>`, `upsert(userId: string, action: string, keyCombo: string): Promise<void>`, `delete(userId: string, action: string): Promise<void>`
- [X] T076 [P] [US6] Create `KeyBindingDto` in `packages/shared/src/dtos/key-binding.dto.ts` — fields: `action: string`, `keyCombo: string`, `isDefault: boolean`; export from `packages/shared/src/index.ts`
- [X] T083 [US6] Implement `InMemoryKeyBindingRepository` in `packages/domain/tests/repositories/in-memory-key-binding.repository.ts` — backed by `Map<string, string>` keyed `"${userId}:${action}"`; satisfies all `KeyBindingRepository` contract cases; used by T077–T082 tests
- [X] T077 [US6] Write unit tests (RED) for `GetKeyBindingsUseCase` in `packages/domain/tests/use-cases/get-key-bindings.test.ts` — using `InMemoryKeyBindingRepository`; cover: returns all four actions merged with defaults when no DB rows exist; returns custom combo when DB row present; `isDefault: false` for customised binding; `isDefault: true` for default binding; optional namespace filter returns only matching actions
- [X] T078 [US6] Implement `GetKeyBindingsUseCase` in `packages/domain/src/use-cases/get-key-bindings.ts` — constructor: `(keyBindingRepo: KeyBindingRepository)`; accepts optional `namespace?: string`; filters `DEFAULT_KEY_BINDINGS` by namespace if provided; merges DB rows; returns `KeyBindingDto[]` (GREEN for T077)
- [X] T079 [US6] Write unit tests (RED) for `UpdateKeyBindingUseCase` in `packages/domain/tests/use-cases/update-key-binding.test.ts` — cover: `result.isOk()` on valid binding; `result.isErr()` with `ValidationError` for reserved combo; `result.isErr()` with `ValidationError` for unknown action; `result.isErr()` with `KeyBindingConflictError` when another action in the same namespace already uses the combo; cross-namespace duplicate returns `result.isOk()`
- [X] T080 [US6] Implement `UpdateKeyBindingUseCase` in `packages/domain/src/use-cases/update-key-binding.ts` — constructor: `(keyBindingRepo: KeyBindingRepository)`; returns `Result<void, KeyBindingConflictError | ValidationError>`; validates action exists in `DEFAULT_KEY_BINDINGS`; checks combo not in `RESERVED_KEY_COMBOS`; calls `repo.findAll(userId)`, filters to the action's namespace (from `DEFAULT_KEY_BINDINGS`), checks no other action in that namespace uses the combo; upserts on success (GREEN for T079)
- [X] T081 [P] [US6] Write unit tests (RED) for `ResetKeyBindingUseCase` in `packages/domain/tests/use-cases/reset-key-binding.test.ts` — cover: `result.isOk()` on valid action; deletes DB row so subsequent `GetKeyBindingsUseCase` returns default; `result.isErr()` with `ValidationError` for unknown action
- [X] T082 [P] [US6] Implement `ResetKeyBindingUseCase` in `packages/domain/src/use-cases/reset-key-binding.ts` — constructor: `(keyBindingRepo: KeyBindingRepository)`; returns `Result<void, ValidationError>`; validates action exists; calls `repo.delete` (GREEN for T081)
- [X] T084 [US6] Export new use cases and errors from `packages/domain/src/index.ts`; export `KeyBindingDto` already done in T076
- [X] T085 [US6] Write integration tests (RED) for `PrismaKeyBindingRepository` in `packages/infrastructure/tests/persistence/prisma-key-binding.repository.test.ts` — using testcontainers; cover: `findAll` returns empty array for new user, `upsert` inserts then returns on next `findAll`, second `upsert` updates existing row, `delete` removes row, cascade delete when user is deleted
- [X] T086 [US6] Implement `PrismaKeyBindingRepository` in `packages/infrastructure/src/persistence/prisma-key-binding.repository.ts` (GREEN for T085); export from `packages/infrastructure/src/index.ts`
- [X] T087 [US6] Write route tests (RED) for key binding routes in `apps/api/tests/routes/keybindings.test.ts` — using `fastify.inject()`; cover: `GET` returns 4 bindings with defaults for new user, `GET ?namespace=file-tree` filters correctly, `PATCH` valid binding returns updated dto, `PATCH` reserved combo returns `400`, `PATCH` duplicate within namespace returns `409`, `PATCH` duplicate across namespaces succeeds, `DELETE` returns `204` and subsequent `GET` shows default, `401` for unauthenticated
- [X] T088 [US6] Implement `GET /users/me/keybindings`, `PATCH /users/me/keybindings/:action`, and `DELETE /users/me/keybindings/:action` routes in `apps/api/src/routes/users/keybindings.ts` — inject `GetKeyBindingsUseCase`, `UpdateKeyBindingUseCase`, `ResetKeyBindingUseCase`; maps `KeyBindingConflictError→409`, `ValidationError→400` (GREEN for T087)
- [X] T089 [US6] Register keybinding routes and inject use cases with `PrismaKeyBindingRepository` in `apps/api/src/index.ts`
- [X] T090a [US6] Write unit tests (RED) for `useKeyBindings` hook in `apps/web/tests/hooks/useKeyBindings.test.ts` — using mocked fetch; cover: fetches `GET /users/me/keybindings?namespace=file-tree` on mount, returns correct `Map<action, keyCombo>`, re-fetches when namespace changes
- [X] T090 [US6] Implement `useKeyBindings(namespace: string)` in `apps/web/src/hooks/useKeyBindings.ts` — fetches `GET /users/me/keybindings?namespace=<namespace>` on mount; returns `Map<action, keyCombo>` (GREEN for T090a)
- [X] T091a [US6] Write unit tests (RED) for `useKeyBindingSettings` hook in `apps/web/tests/hooks/useKeyBindingSettings.test.ts` — using mocked fetch; cover: fetches all namespaces, groups by namespace, `updateBinding` calls `PATCH` and updates local state optimistically, `updateBinding` rolls back on error, `resetBinding` calls `DELETE` and reverts to default, optimistic rollback on `resetBinding` error
- [X] T091 [US6] Implement `useKeyBindingSettings()` in `apps/web/src/hooks/useKeyBindingSettings.ts` — fetches all bindings (no namespace filter); returns `{ groups: KeyBindingGroup[], updateBinding, resetBinding }`; optimistic update with rollback on error (GREEN for T091a)
- [X] T092a [US6] Write unit tests (RED) for `useFileTreeKeyHandler` in `apps/web/tests/hooks/useFileTreeKeyHandler.test.ts` — using `renderHook` and `fireEvent.keyDown`; cover: `F2` fires `onRename` when `selectedNodeId` non-null; `Delete` fires `onDelete`; `Ctrl+N` fires `onNewFile`; `Ctrl+Shift+N` fires `onNewFolder`; no callback fires when `selectedNodeId` is null; remapped binding fires correct callback after bindings prop changes; `e.preventDefault` called on match; old binding no longer fires after remap; pressing a lone modifier key (`Shift`, `Ctrl`, `Alt`, `Meta`) does not fire any callback
- [X] T092 [US6] Implement `useFileTreeKeyHandler(containerRef, selectedNodeId, bindings, callbacks)` in `apps/web/src/hooks/useFileTreeKeyHandler.ts` — builds `invertedBindings: Map<keyCombo, action>` via `useMemo` from `bindings` (O(1) lookup, no iteration at event time); attaches `keydown` listener to `containerRef.current`; normalises `KeyboardEvent` to canonical combo string (e.g. `"Ctrl+Shift+N"`); ignores lone modifier keys (where `e.key` is `"Shift"`, `"Control"`, `"Alt"`, or `"Meta"`); looks up action from `invertedBindings`; fires matching callback from `callbacks`; calls `e.preventDefault()` + `e.stopPropagation()` on match; no-op when `selectedNodeId` is null; cleans up listener on unmount (GREEN for T092a)
- [X] T093a [US6] Write unit tests (RED) for `KeyboardShortcutsCard` in `apps/web/tests/app/account/keyboard-shortcuts-card.test.tsx` — using React Testing Library with mocked `useKeyBindingSettings`; cover: renders one section per namespace; each row shows action label, current binding, and reset button; clicking a binding cell enters capture mode showing "Press a key…"; keydown in capture mode calls `updateBinding` with correct action and combo; a lone modifier keydown (`Shift`, `Ctrl`, `Alt`, `Meta`) in capture mode does not call `updateBinding` and keeps capture mode active; `Escape` exits capture mode without calling `updateBinding`; conflict error shows inline error message; reserved-combo error shows inline error message; reset button calls `resetBinding`; reset button disabled when `isDefault: true`
- [X] T093 [US6] Implement `KeyboardShortcutsCard` in `apps/web/src/app/(dashboard)/dashboard/account/keyboard-shortcuts-card.tsx` — uses `useKeyBindingSettings`; renders shadcn `Card` with namespace-grouped sections; each row: action label | binding cell (click → capture mode) | reset button; capture mode: bordered input "Press a key…", next non-modifier keypress constructs canonical combo and calls `updateBinding`, `Escape` cancels; inline error on conflict/reserved; reset button calls `resetBinding`, disabled when `isDefault` (GREEN for T093a)
- [X] T094 [US6] Modify `FileTree` in `apps/web/src/components/file-tree/FileTree.tsx` — add `tabIndex={0}` and `containerRef` to root element; call `useKeyBindings('file-tree')` to obtain bindings; call `useFileTreeKeyHandler(containerRef, selectedNodeId, bindings, { onRename, onDelete, onNewFile, onNewFolder })`; action callbacks reuse the same handlers already wired to `FileTreeActions` context menu items
- [X] T095 [US6] Add `KeyboardShortcutsCard` to `apps/web/src/app/(dashboard)/dashboard/account/page.tsx`

**Checkpoint**: File tree keyboard shortcuts fire on correct key combos for focused nodes; bindings are user-configurable from account settings; namespace grouping is extensible; all bindings persist across sessions.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [X] T064 Add `.collab/` to `.gitignore` at the repository root
- [X] T065 [P] Verify all new domain use cases and errors are exported from `packages/domain/src/index.ts`
- [X] T066 [P] Verify all new infrastructure adapters are exported from `packages/infrastructure/src/index.ts`
- [X] T067 Consolidate all DI wiring in `apps/api/src/index.ts` — confirm `FilesystemProjectFileStore`, `FilesystemYjsStateStore`, and `HocuspocusPersistenceExtension` are constructed with `config.get('storage.path')` and injected into all use cases that require them
- [X] T068 Verify filesystem access is confined to `packages/infrastructure/src/storage/` — run `grep -r "from 'fs'" packages/domain packages/shared apps/api/src/routes apps/api/src/plugins` and `grep -r "from 'node:fs'" packages/domain packages/shared apps/api/src/routes apps/api/src/plugins`; any match is a constitution violation that must be resolved before proceeding
- [X] T069 [P] Run `pnpm lint` and `pnpm typecheck` across the monorepo; resolve any issues
- [X] T070 [P] Run the full test suite (`pnpm test`); confirm all new and modified tests pass and no regressions
- [X] T071 Validate SC-001 manually: open a previously saved document in the browser, measure time from navigation to content render using DevTools Network panel; document the result in `specs/011-project-file-storage/quickstart.md` under a "Performance Baseline" section; flag if p95 exceeds 500 ms under local conditions (no load-testing infrastructure required in this phase)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundational)**: Depends on Phase 1 — BLOCKS all user story phases
- **Phase 3 (US1)**: Depends on Phase 2
- **Phase 4 (US2)**: Depends on Phase 2; Phase 3 recommended first (same route file)
- **Phase 5 (US4)**: Depends on Phase 2
- **Phase 6 (US3)**: Depends on Phase 2
- **Phase 6 (US3)**: T052–T054 (drag-and-drop) are frontend-only; T052 (`fs-entry-walker`) can be written in parallel with any backend tasks
- **Phase 7 (US5)**: Depends on Phase 5 (needs route handlers to emit events)
- **Phase 9 (US6)**: Depends on Phase 7 (FileTree component must exist); frontend tasks depend on Phase 7 completing T063
- **Phase 8 (Polish)**: Depends on all preceding phases including Phase 9

### User Story Dependencies

- **US1 (P1)**: Unblocked after Phase 2
- **US2 (P1)**: Unblocked after Phase 2; shares route file with US1
- **US3 (P2)**: Unblocked after Phase 2
- **US4 (P2)**: Unblocked after Phase 2
- **US5 (P2)**: Depends on US4 (route handlers must exist to emit events)
- **US6 (P3)**: Depends on US5 (FileTree component must exist to wire keyhandler into)

### Within Each User Story

- Test task (RED) → implementation task (GREEN) — never reversed
- Use case before API route
- API route before client helper
- Client helper before UI component

---

## Parallel Opportunities

### Phase 2

```
T006 ProjectFileStore interface
T007 YjsStateStore interface          ← parallel with T006
T008 InMemoryProjectFileStore         ← parallel with T007
T009 InMemoryYjsStateStore            ← parallel with T008
```

After T006+T007+T008+T009 complete:
```
T011+T012 FilesystemProjectFileStore (test → impl)
T013+T014 FilesystemYjsStateStore (test → impl)   ← parallel track
```

### Phase 5 (US4)

```
T028+T029 CreateFileUseCase (test → impl)
T030+T031 CreateFolderUseCase (test → impl)    ← parallel with above
T032+T033 MoveFileUseCase (test → impl)        ← parallel with above
T034+T035 DeleteFile modification (test → impl)
T036+T037 RenameFile modification (test → impl) ← parallel with above
T038+T039 DeleteProject modification (test → impl)
```

### Phase 6 (US3)

```
T043+T044 UploadAssetUseCase (test → impl)
T045+T046 GetAssetContentUseCase (test → impl)  ← parallel with above
T052a+T052 walkEntries (test → impl)            ← parallel with above (frontend only)
T052b+T052c useDropUpload hook (test → impl)    ← after T052
T052d shadcn Progress install                   ← parallel with T052b+T052c
T052e_a+T052e UploadProgressPanel (test → impl) ← after T052c + T052d
T053a+T053 DragDropZone (test → impl)           ← after T052e
T054 integrate DragDropZone into FileTreeNode   ← after T053
```

### Phase 9 (US6)

```
T072a KeyBinding domain entity                   ← parallel with T072
T072 Prisma schema + migration
T073 DEFAULT_KEY_BINDINGS registry               ← after T072
T074 KeyBindingConflictError                     ← parallel with T073
T075 KeyBindingRepository interface              ← parallel with T073
T076 KeyBindingDto                               ← parallel with T073
T083 InMemoryKeyBindingRepository                ← after T075
T077+T078 GetKeyBindingsUseCase (test → impl)    ← after T073 + T083
T079+T080 UpdateKeyBindingUseCase (test → impl)  ← parallel with above
T081+T082 ResetKeyBindingUseCase (test → impl)   ← parallel with above
T085+T086 PrismaKeyBindingRepository (test → impl) ← after T075
T087+T088 keybinding routes (test → impl)        ← after T078 + T080 + T082 + T086
T089 register routes in DI                       ← after T088
T090a+T090 useKeyBindings (test → impl)          ← after T089
T091a+T091 useKeyBindingSettings (test → impl)   ← parallel with above
T092a+T092 useFileTreeKeyHandler (test → impl)   ← after T090
T093a+T093 KeyboardShortcutsCard (test → impl)   ← after T091
T094 wire FileTree                               ← after T092
T095 add card to account settings page           ← after T093
```

---

## Implementation Strategy

### MVP (User Stories 1 + 2 only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational ← critical path
3. Complete Phase 3: US1 — read content
4. Complete Phase 4: US2 — save content
5. **STOP and VALIDATE**: seed a file, read it, edit it, reload, verify

At this point the editor can persist and retrieve document content. Everything else is additive.

### Incremental Delivery

1. Phase 1 + 2 → storage infrastructure ready
2. Phase 3 + 4 → document content read/write (MVP)
3. Phase 5 → full file tree CRUD with lifecycle management
4. Phase 6 → image upload/retrieval
5. Phase 7 → real-time sync across sessions and tabs
6. Phase 8 → polish and validation

---

## Notes

- `[P]` tasks touch different files and have no shared incomplete dependencies — safe to parallelise
- TDD cycle is non-negotiable per constitution: RED (test fails) before GREEN (impl passes)
- In-memory fakes (`InMemoryProjectFileStore`, `InMemoryYjsStateStore`) must behave identically to the real implementations — same error conditions, same ordering
- Infrastructure integration tests use real temp directories (`mkdtemp`) cleaned up in `afterEach`
- The SharedWorker (T055) is a browser API — no Node.js/Jest test is possible; manual browser testing per the independent test criteria in Phase 7
- Commit after each GREEN phase per conventional commits: `feat(domain): add GetDocumentContentUseCase`, `feat(infra): add FilesystemProjectFileStore`, etc.
