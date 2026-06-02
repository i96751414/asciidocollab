# Implementation Plan: Per-Project Isolated File Storage

**Branch**: `011-project-file-storage` | **Date**: 2026-06-01 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/011-project-file-storage/spec.md`

## Summary

Introduce a per-project filesystem store that persists user-visible files (AsciiDoc documents and binary assets) at paths mirroring the user's logical file tree, and a separate hidden store for Yjs collaborative-editing state. All structural changes to the file tree (create, delete, rename, move) are propagated in real time to every active collaborator via Server-Sent Events. Storage isolation is enforced at the infrastructure layer: every read/write is scoped to the requesting project's directory, with `FilePath` value-object validation and OS-level exclusive-create semantics preventing cross-project access and concurrent-create conflicts.

## Technical Context

**Language/Version**: TypeScript 6, Node.js 24

**Primary Dependencies**: Fastify (API), Next.js 16 (frontend), Prisma (metadata persistence), Yjs / Hocuspocus (collaborative editing state)

**Storage**:
- User-visible files: local filesystem, path `<ASCIIDOCOLLAB_STORAGE_PATH>/<projectId>/<userPath>`
- Yjs states: local filesystem, path `<ASCIIDOCOLLAB_STORAGE_PATH>/<projectId>/.collab/<yjsStateId>`
- Metadata (FileNode, Document, Image records): PostgreSQL via Prisma (unchanged)

**Testing**: Jest (unit + integration), Playwright (E2E), testcontainers (infra integration), in-memory fakes (domain unit)

**Target Platform**: Linux server (Docker-compatible)

**Performance Goals**: File reads ≤ 500 ms p95; file tree event delivery ≤ 2 s under normal conditions (per SC-001, SC-006)

**Constraints**: Max image upload 20 MB (configurable); no external storage services in this phase; no encryption/compression in this phase

**Scale/Scope**: Per project: hundreds of files, tens of MB total

**Frontend Upload Progress Types** (canonical definition — used by `useDropUpload`, `UploadProgressPanel`, and their tests):

```typescript
type UploadItemStatus = 'pending' | 'uploading' | 'done' | 'error';

interface UploadProgress {
  id: string;            // stable unique id for this upload item (e.g. crypto.randomUUID())
  name: string;          // display filename
  relativePath: string;  // relative path within the drop (e.g. "subdir/file.txt")
  status: UploadItemStatus;
  errorMessage?: string; // present only when status === 'error'
}
```

`useDropUpload` returns `{ onDrop, progress: UploadProgress[] }`. There is no separate `errors` array — failed items are items in `progress` with `status: 'error'`. Derived helpers (e.g., `progress.filter(p => p.status === 'error')`) are used where an error-only view is needed.

**Key Binding Types** (canonical definitions — used by `useKeyBindings`, `useKeyBindingSettings`, `KeyboardShortcutsCard`, and their tests):

```typescript
// Domain entity (packages/domain/src/entities/key-binding.ts)
interface KeyBinding {
  userId: string;
  action: string;   // e.g. 'file-tree:rename'
  keyCombo: string; // e.g. 'F2'
}

// Frontend grouping type (apps/web/src/hooks/useKeyBindingSettings.ts)
interface KeyBindingGroup {
  namespace: string;          // e.g. 'file-tree'
  label: string;              // e.g. 'File Tree'
  bindings: KeyBindingDto[];
}
```

`useFileTreeKeyHandler` receives `bindings: Map<action, keyCombo>` and internally builds an inverted `Map<keyCombo, action>` via `useMemo` so lookups are O(1) with no iteration.

## Constitution Check

*GATE: Must pass before implementation. Re-checked after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| Clean Architecture — domain has zero external deps | ✅ Pass | `ProjectFileStore` and `YjsStateStore` are interfaces in `packages/domain`; filesystem impl in `packages/infrastructure`; `HocuspocusPersistenceExtension` in `apps/api/src/plugins/` (delivery layer) to keep `@hocuspocus/server` out of `packages/infrastructure` |
| Dependency rule (Domain ← Infra ← Delivery) | ✅ Pass | Use cases depend on new storage interfaces, not filesystem APIs |
| Business logic in use cases only | ✅ Pass | Path conflict detection, auth checks, size validation all in use cases |
| Repository interfaces in domain | ✅ Pass | `ProjectFileStore` and `YjsStateStore` follow the same pattern as existing repositories |
| In-memory fakes for all domain interfaces | ✅ Pass | `InMemoryProjectFileStore` and `InMemoryYjsStateStore` fakes required |
| Integration tests for infra adapters | ✅ Pass | Filesystem adapters tested against real temp directories |
| TDD (red-green-refactor) | ✅ Pass | Non-negotiable; applies to all new use cases and adapters |
| No `any` / `as` casts in production code | ✅ Pass | Strictly typed Buffer handling throughout |
| Shared DTOs for cross-package types | ✅ Pass | `FileTreeEventDto` defined in `packages/shared` |
| Result<T,E> for fallible operations | ✅ Pass | `createExclusive` and `move` return `Result<void, FileConflictError>` |
| Security — path traversal prevention | ✅ Pass | `FilePath` value object already rejects `..` and `.` sequences; infra does a second `path.resolve` check |
| Security — project isolation | ✅ Pass | All storage ops scoped to project directory; cross-project reads rejected |
| Filesystem access confined to infrastructure | ✅ Required | `node:fs` / `fs/promises` imports are permitted **only** in `packages/infrastructure/src/storage/`; domain, shared, route handlers, and plugins MUST NOT import `fs` directly |
| No optimistic tree nodes (FR-017) | ✅ Pass | File nodes enter the tree only via SSE `created` event after server-confirmed upload; upload state lives in `UploadProgressPanel`, never in the file tree component |
| Key binding namespace isolation (FR-021/FR-023) | ✅ Pass | Conflict detection is scoped per namespace; cross-namespace duplicates permitted by design; new namespaces add entries to `DEFAULT_KEY_BINDINGS` constant without schema changes |
| No hardcoded secrets or paths | ✅ Pass | Storage root via `ASCIIDOCOLLAB_STORAGE_PATH` env var |
| Audit logging | ✅ Pass | Existing use cases already log; new use cases follow same pattern |

## Project Structure

### Documentation (this feature)

```text
specs/011-project-file-storage/
├── plan.md              ← this file
├── research.md          ← Phase 0 output
├── data-model.md        ← Phase 1 output
├── quickstart.md        ← Phase 1 output
├── contracts/
│   ├── file-content.md
│   ├── file-tree.md
│   ├── images.md
│   └── file-tree-events.md
└── tasks.md             ← Phase 2 output (via /speckit-tasks)
```

### Source Code

```text
packages/domain/src/
  constants/
    key-bindings.ts                ← NEW: DEFAULT_KEY_BINDINGS registry (action → namespace, label, defaultCombo)
  errors/
    key-binding-conflict.ts        ← NEW: KeyBindingConflictError
  repositories/
    key-binding.repository.ts      ← NEW: KeyBindingRepository interface
  storage/
    project-file-store.ts          ← NEW: ProjectFileStore interface
    yjs-state-store.ts             ← NEW: YjsStateStore interface
  use-cases/
    get-document-content.ts        ← NEW
    save-document-content.ts       ← NEW
    create-file.ts                 ← NEW (file node + content + ProjectFileStore)
    create-folder.ts               ← NEW (folder node + ProjectFileStore.createDirectory)
    move-file.ts                   ← NEW (moves file node + ProjectFileStore.move)
    upload-asset.ts                ← NEW (asset metadata + ProjectFileStore.createExclusive)
    get-asset-content.ts           ← NEW
    get-key-bindings.ts            ← NEW (returns all bindings for a user, merged with defaults)
    update-key-binding.ts          ← NEW (validates + upserts one binding)
    reset-key-binding.ts           ← NEW (deletes one binding; subsequent reads return default)
    delete-file.ts                 ← MODIFY: inject ProjectFileStore + YjsStateStore
    rename-file.ts                 ← MODIFY: inject ProjectFileStore, move file on disk
    delete-project.ts              ← MODIFY: inject ProjectFileStore + YjsStateStore

packages/shared/src/
  dtos/
    file-tree-event.dto.ts         ← NEW: FileTreeEventDto (type, fileNodeId, name, path, parentId, nodeType)
    key-binding.dto.ts             ← NEW: KeyBindingDto (action, keyCombo, isDefault)

packages/infrastructure/src/
  persistence/
    prisma-key-binding.repository.ts   ← NEW: PrismaKeyBindingRepository
  storage/
    filesystem-project-file-store.ts   ← NEW: FilesystemProjectFileStore
    filesystem-yjs-state-store.ts      ← NEW: FilesystemYjsStateStore

apps/api/src/
  config/schema.ts                   ← MODIFY: add storage.path, storage.maxUploadSizeBytes
  routes/users/
    keybindings.ts                   ← NEW: GET/PATCH/DELETE /users/me/keybindings
  plugins/
    file-tree-event-bus.ts           ← NEW: in-process pub/sub for file tree events
    hocuspocus-persistence.ts        ← NEW: Hocuspocus Extension wiring YjsStateStore
                                          (delivery layer — imports @hocuspocus/server here,
                                          not in packages/infrastructure)
  routes/
    projects/
      file-content.ts                ← NEW: GET/PUT /projects/:id/files/:fileNodeId/content
      file-tree.ts                   ← NEW: POST/DELETE/PATCH /projects/:id/files/...
      images.ts                      ← NEW: POST/GET /projects/:id/images
      events.ts                      ← NEW: GET /projects/:id/events (SSE)
    admin/
      settings.ts                    ← MODIFY: extend to include maxUploadSizeBytes

apps/web/src/
  lib/
    api/
      file-content.ts                ← NEW: client helpers for content R/W
      assets.ts                      ← NEW: client helpers for asset upload/retrieval
    fs-entry-walker.ts               ← NEW: walkEntries — walks DataTransferItemList recursively
  workers/
    file-tree-events.worker.ts       ← NEW: SharedWorker — holds one SSE connection per
                                          project, fans events out to all connected tabs
  hooks/
    useFileTreeEvents.ts             ← NEW: connects to SharedWorker, exposes event stream
    useDropUpload.ts                 ← NEW: orchestrates drag-drop upload queue; exposes
                                          onDrop + progress: UploadProgress[]
    useKeyBindings.ts                ← NEW: read-only; fetches GET /users/me/keybindings
                                          ?namespace=<ns>; returns Map<action, keyCombo>
    useKeyBindingSettings.ts         ← NEW: used by account settings page; loads all
                                          namespaces; exposes updateBinding + resetBinding
    useFileTreeKeyHandler.ts         ← NEW: attaches scoped keydown listener to file tree
                                          container; maps combos to action callbacks
  components/
    file-tree/
      FileTree.tsx                   ← NEW: renders live file tree with real-time updates
      FileTreeNode.tsx               ← NEW: single node renderer
      FileTreeActions.tsx            ← NEW: context menu (create, rename, delete, move)
      DragDropZone.tsx               ← NEW: drop-target wrapper; delegates all orchestration
                                          to useDropUpload; renders UploadProgressPanel
      UploadProgressPanel.tsx        ← NEW: floating panel anchored to bottom of file tree;
                                          shows overall progress bar + scrollable per-item
                                          status list; auto-dismisses on full success;
                                          stays open with close button when errors exist
  app/(dashboard)/dashboard/account/
    keyboard-shortcuts-card.tsx      ← NEW: "Keyboard Shortcuts" settings card; grouped by
                                          namespace; inline capture-mode binding editor
    page.tsx                         ← MODIFY: add KeyboardShortcutsCard
```

## Known Constraints

| Constraint | Impact | Deferred To |
|-----------|--------|-------------|
| `FileTreeEventBus` is in-process only | A second API instance will not receive events emitted by the first; all connected clients must be routed to the same instance | Future phase: replace with Redis pub/sub or similar external broker |
| No horizontal SSE fan-out | SSE connections and event emission are coupled to one process | Same as above |
| No filesystem encryption / compression | Content stored as raw bytes | Future phase if compliance requires it |

## Complexity Tracking

No constitution violations. No complexity justification required.
