# Feature Specification: Per-Project Isolated File Storage

**Feature Branch**: `011-project-file-storage`

**Created**: 2026-06-01

**Status**: Draft

**Input**: User description: "lets start Phase 5, we first need to define how to keep/store files in an isolated way between projects, also note that a future phase will integrate projects with git"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Read Document Content (Priority: P1)

As a project collaborator, I want to open a document and have its current content loaded correctly, so I can read and edit it.

**Why this priority**: Document content retrieval is the core read operation the entire editor is built on — nothing else works without it.

**Independent Test**: Can be fully tested by creating a project, creating a document within it, saving content, then opening it again and verifying the correct content is returned. Delivers the foundational read path.

**Acceptance Scenarios**:

1. **Given** a document exists in Project A, **When** a collaborator opens that document, **Then** the stored content is returned correctly
2. **Given** two projects each have a document with the same logical file name, **When** each document is opened, **Then** each returns its own distinct content without cross-contamination
3. **Given** a document has never been saved, **When** the document is opened for the first time, **Then** an empty content is returned (not an error)

---

### User Story 2 - Persist Document Edits (Priority: P1)

As a project collaborator, I want my edits to a document to be saved and survive a page reload, so my work is never lost.

**Why this priority**: Persistence is the core write operation. Without reliable saves, the editor is not usable.

**Independent Test**: Can be tested by saving content to a document, reloading the page, and verifying the saved content is returned. Delivers the foundational write path.

**Acceptance Scenarios**:

1. **Given** a collaborator edits a document in Project A, **When** the edit is saved, **Then** the updated content can be retrieved on the next open
2. **Given** two projects have identically-named documents, **When** content is saved in Project A, **Then** the content in Project B is unchanged
3. **Given** a document save is requested, **When** the operation completes successfully, **Then** no partial or corrupt state is left on disk

---

### User Story 3 - Upload and Retrieve Files (Priority: P2)

As a project collaborator, I want to upload any file (images, CSVs, PDFs, AsciiDoc includes, etc.) to a project and reference it in documents, so I can include any supporting material alongside my documentation.

**Why this priority**: Projects commonly contain non-editable supporting files. Storage isolation ensures assets from one project cannot be accessed from another.

**Independent Test**: Can be tested by uploading a PNG, a CSV, and a plain-text file to Project A, verifying each can be retrieved in Project A's context with the correct bytes and MIME type, and confirming none are accessible via Project B's context.

**Acceptance Scenarios**:

1. **Given** a file of any type is uploaded to Project A, **When** it is requested in Project A's context, **Then** the correct bytes are returned with the original MIME type
2. **Given** a file exists in Project A, **When** it is requested via Project B's context, **Then** the request is denied
3. **Given** a file is uploaded to a project, **When** the project is subsequently deleted, **Then** the file is also removed
4. **Given** a file upload exceeds the configured size limit, **When** the upload is attempted, **Then** it is rejected before any bytes are persisted
5. **Given** a user drags one or more files from their OS onto a folder in the project tree, **When** they release the drop, **Then** each file is uploaded into that folder and appears in the tree **once its upload has completed successfully**, without a page refresh
6. **Given** a user drags a folder from their OS onto a folder in the project tree, **When** they release the drop, **Then** the entire folder hierarchy is recreated under the target folder and all contained files are uploaded, preserving the original directory structure
7. **Given** a drag-and-drop upload is in progress, **When** the user looks at the UI, **Then** a floating upload panel appears anchored to the bottom of the file tree showing: (a) an overall batch progress counter ("N / M files"), (b) a progress bar advancing as each file completes, and (c) a scrollable per-item list where each item displays a spinner while uploading, a checkmark on success, or an ✕ icon on failure with the error reason. If all items succeed the panel auto-dismisses after 2 seconds. If any item fails the panel remains open with a close button the user must click to dismiss; the failed-item list is scrollable to accommodate large batches. Individual item failures do not cancel remaining uploads.

---

### User Story 4 - Project Storage Lifecycle (Priority: P2)

As a system administrator, I want each project's storage to be automatically set up and torn down with the project, so there is no orphaned data and no manual cleanup required.

**Why this priority**: Automated lifecycle management prevents storage leaks and ensures the system remains consistent as projects are created and deleted.

**Independent Test**: Can be tested by creating a project (verifying storage namespace is ready) and then deleting it (verifying all storage is removed).

**Acceptance Scenarios**:

1. **Given** a new project is created, **When** its first document is saved, **Then** the storage namespace is available without any manual setup
2. **Given** a project is deleted, **When** the deletion completes, **Then** all documents, images, and collaborative state belonging to that project are removed from storage
3. **Given** a project is archived (not deleted), **When** archive completes, **Then** the project's stored files remain intact and accessible — archiving does not remove or restrict file storage

---

### User Story 5 - Real-Time File Tree Sync (Priority: P2)

As a project collaborator, I want to see file additions and deletions made by other team members reflected in my view immediately, without refreshing, so I always work with an up-to-date picture of the project.

**Why this priority**: Without live file tree synchronisation, collaborators will attempt to open files that no longer exist or miss newly added files, breaking the collaborative experience.

**Independent Test**: Can be tested by opening the same project in two browser sessions simultaneously — uploading or deleting a file in session A must cause the file tree in session B to update without any user action.

**Acceptance Scenarios**:

1. **Given** two collaborators have the same project open, **When** collaborator A uploads a new file, **Then** collaborator B's file tree shows the new file without a page refresh
2. **Given** two collaborators have the same project open, **When** collaborator A deletes a file, **Then** the file disappears from collaborator B's file tree without a page refresh
3. **Given** two collaborators have the same project open, **When** collaborator A renames or moves a file, **Then** collaborator B's file tree reflects the new name or location without a page refresh
4. **Given** a collaborator is viewing a project, **When** any file tree change event arrives, **Then** the tree updates within 2 seconds of the originating action under normal conditions
5. **Given** a network interruption causes a collaborator to miss file tree events, **When** connectivity is restored, **Then** the file tree reconciles to the current server state

---

### User Story 6 - Configurable File Tree Keyboard Shortcuts (Priority: P3)

As a project collaborator, I want to trigger file tree actions (rename, delete, new file, new folder) with keyboard shortcuts, and customise those shortcuts to match my workflow, so I can work without reaching for the mouse.

**Why this priority**: Keyboard-driven workflows are a common preference among technical users. Configurability avoids conflicts with individual OS or editor setups.

**Independent Test**: Can be tested by focusing a file in the file tree, pressing the default rename shortcut (F2), and verifying the rename interaction begins. Then navigate to account settings, change the rename binding to a different key, return to the file tree, and verify the new key triggers the same action while the old one no longer does.

**Acceptance Scenarios**:

1. **Given** a file tree node is focused, **When** the user presses the configured rename shortcut (default: `F2`), **Then** the rename interaction begins for that node
2. **Given** a file tree node is focused, **When** the user presses the configured delete shortcut (default: `Delete`), **Then** the delete confirmation flow begins for that node
3. **Given** a folder node is focused, **When** the user presses the configured new-file shortcut (default: `Ctrl+N`), **Then** the new-file creation flow begins inside that folder
4. **Given** a folder node is focused, **When** the user presses the configured new-folder shortcut (default: `Ctrl+Shift+N`), **Then** the new-folder creation flow begins inside that folder
5. **Given** no file tree node is focused, **When** any file tree shortcut is pressed, **Then** no action fires
6. **Given** a user navigates to account settings, **When** they click a binding and press a new key combo, **Then** the binding is saved and the new key triggers the action in the file tree
7. **Given** a user resets a binding, **When** the reset completes, **Then** the default key combo is restored
8. **Given** a user attempts to bind a key already used by another action in the same namespace, **When** they press that key, **Then** an inline error is shown and the previous binding is preserved
9. **Given** a user attempts to bind a browser-reserved key (e.g. `Ctrl+W`, `F5`), **When** they press it, **Then** an inline error is shown and the key is not saved

---

### Edge Cases

- What happens when a write fails mid-operation (e.g., disk full)? The previous content must remain intact — no partial writes.
- How does the system handle a document that exists in the metadata store but whose content file is missing? The system must return a recoverable error rather than a crash.
- What happens if two collaborators save conflicting Yjs states concurrently? The last `onStoreDocument` invocation wins (Hocuspocus processes persistence calls sequentially on the server); no data corruption occurs.
- What is the maximum supported file size for uploads? The system enforces a configurable limit (default: 20 MB). Administrators can change the limit at runtime via the admin settings panel; the active limit takes effect immediately for subsequent uploads. Uploads exceeding the limit are rejected before any bytes are persisted. The limit is never exposed in error responses — a generic rejection message is returned.
- What happens if two collaborators simultaneously create a file at the same path? First writer wins — the second operation fails with an explicit conflict error. No silent overwrites occur.

## Requirements *(mandatory)*

### Storage Isolation Model

Every project is assigned exactly one storage directory, named by the project's unique identifier. All user-visible files for that project — documents and file assets of any type — live exclusively inside that directory, organised however the user chooses. The on-disk layout mirrors the logical file tree the user builds in the application: if a user creates a folder `concepts/` containing `overview.adoc` and `diagram.png`, those files appear on disk at exactly those relative paths within the project directory.

No operation may read from or write to a path that falls outside the requesting project's directory; the storage layer rejects such requests regardless of caller intent.

```
<storage-root>/
  <project-A-uuid>/         ← isolation boundary; all Project A content lives here
    chapter-1.adoc           ← user-defined layout; paths mirror the UI file tree
    concepts/
      overview.adoc
      diagram.png
  <project-B-uuid>/
    README.adoc
    assets/
      logo.svg
```

System-internal files that are not part of the user-visible content (such as collaborative editing state) are stored separately from the user's file tree so they do not pollute what users see or what git would later track. The storage location for these internal files is defined in the Assumptions section.

### Functional Requirements

- **FR-001**: Each project MUST have a dedicated storage directory named by its unique identifier; no read or write operation on one project's directory is permitted when scoped to a different project's identifier.
- **FR-002**: The storage layer MUST reject any path that, after resolution, falls outside the requesting project's directory (path traversal prevention).
- **FR-003**: User-visible files (AsciiDoc documents and file assets of any type) MUST be stored at paths within the project directory that exactly mirror the user's logical file tree organisation; the system MUST NOT impose any fixed subdirectory structure on user files.
- **FR-004**: Collaborative editing state (Yjs CRDT binary) MUST be stored separately from the user-visible file tree so it does not appear in directory listings or future git operations.
- **FR-005**: A project's storage directory MUST be created automatically when first needed; no explicit "initialise storage" step is required of callers.
- **FR-006**: Deleting a project MUST remove its entire storage directory and all files within it, including both user-visible files and system-internal files; no orphaned files may remain.
- **FR-007**: Content writes MUST be atomic from the perspective of readers — a reader must never observe a partially-written file.
- **FR-008**: The storage root path MUST be configurable via an environment variable; no default path is hardcoded in application logic.
- **FR-009**: Users MAY upload any file type as a project asset (images, CSVs, PDFs, AsciiDoc includes, etc.); the system MUST NOT restrict uploads by MIME type.
- **FR-010**: New domain storage port interfaces (`ProjectFileStore` for user-visible file content and `YjsStateStore` for collaborative editing state) MUST be defined in the domain layer; infrastructure MUST provide filesystem-backed implementations.
- **FR-011**: When any structural change occurs in a project's file tree — file or folder added, deleted, renamed, or moved — all collaborators with that project open MUST receive a file tree update event; their view MUST reflect the change within 2 seconds under normal network conditions.
- **FR-012**: File tree update events MUST include sufficient information for receiving clients to update their local tree state without a full reload (incremental update, not full refresh).
- **FR-013**: When a collaborator reconnects after a network interruption, the system MUST provide a mechanism to reconcile the client's file tree state with the current server state.
- **FR-014**: When two operations attempt to create a file at the same path concurrently, the first write MUST succeed and the second MUST fail with an explicit conflict error; silent overwrites are not permitted.
- **FR-015**: All browser tabs from the same user agent MUST share a single SSE connection to the server per project, so that multiple open tabs do not exhaust the browser's per-origin connection limit.
- **FR-016**: The maximum permitted upload size per file MUST be configurable at two levels: (1) an environment variable sets the startup default; (2) an administrator MUST be able to override the limit at runtime via the admin settings panel without restarting the server. The runtime value takes precedence over the env-var default. Uploads exceeding the active limit MUST be rejected before any bytes are persisted to disk.
- **FR-017**: A file node MUST NOT be rendered in the client-side file tree until the server has confirmed its individual upload has fully completed (HTTP 201 response received). Optimistic or ghost-node rendering of in-progress uploads directly in the tree is prohibited; upload state belongs exclusively to the upload progress panel, not the file tree.
- **FR-018**: Each user MUST be able to configure per-action keyboard shortcuts for file tree operations; custom bindings are stored per-user in the database and persist across sessions and devices.
- **FR-019**: The system MUST provide default key bindings for all file tree actions: Rename → `F2`, Delete → `Delete`, New File → `Ctrl+N`, New Folder → `Ctrl+Shift+N`. Defaults apply when no custom binding exists for a user.
- **FR-020**: Keyboard shortcuts for file tree actions MUST fire only when a node in the file tree is focused; they MUST NOT fire when focus is elsewhere in the application (e.g. the document editor, a text input).
- **FR-021**: A user MUST NOT be able to bind two file tree actions to the same key combo; attempting to do so MUST be rejected with an error. Cross-namespace duplicates (e.g. a file-tree binding matching a future editor binding) are permitted because each namespace activates under a distinct focus context.
- **FR-022**: Browser-reserved key combos (`Ctrl+W`, `Ctrl+T`, `Ctrl+R`, `F5`, `F11`, `Alt+F4`) MUST be rejected as bindings; the system MUST return a validation error and leave the existing binding unchanged.
- **FR-023**: The key binding system MUST be namespace-aware so future application areas (e.g. the document editor) can register their own actions and defaults without schema changes; the account settings page MUST group bindings by namespace.

### Key Entities

- **ProjectStorage**: A logical namespace scoped to a single project, containing all stored content for that project. Identified by the project's unique identifier.
- **ContentBlob**: The raw bytes of an AsciiDoc document's content. Stored at a path within the project directory that mirrors the document's logical location in the file tree.
- **YjsState**: The binary Yjs CRDT state of a collaborative editing session. Stored in a system-internal location separate from the user-visible file tree.
- **FileAsset**: Raw bytes of any uploaded file (image, CSV, PDF, AsciiDoc include, or any other type). Stored at a path within the project directory that mirrors the asset's logical location in the file tree. MIME type is recorded from the upload request.
- **FileTreeEvent**: A notification emitted when a structural change occurs in the file tree (add, delete, rename, or move of a file or folder), carrying enough information for connected clients to update their local file tree view incrementally.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A collaborator can open a previously saved document and see its content in under 500 ms under normal load.
- **SC-002**: Content saved in one project is never returned when a document from a different project is opened (zero cross-project content leaks).
- **SC-003**: Deleting a project removes all associated stored files; no orphaned files remain on disk after deletion.
- **SC-004**: A project's storage directory is ready for the first write without any out-of-band setup; callers need no explicit initialization step.
- **SC-005**: The on-disk layout for user-visible files mirrors the logical file tree exactly, making the project directory directly usable as a git repository in a future phase without any structural transformation.
- **SC-006**: File tree changes (additions, deletions, renames, and moves) are reflected in all active collaborator sessions within 2 seconds under normal network conditions.

## Clarifications

### Session 2026-06-01

- Q: Should the system enforce a fixed subdirectory structure within a project's storage directory? → A: No. The user is free to organise files as they choose; the on-disk layout mirrors the logical file tree.
- Q: Should file additions and deletions be propagated in real time to other sessions and users for the same project? → A: Yes. All active collaborators must see file tree changes without refreshing.
- Q: Should rename and move operations also sync in real time, in addition to add and delete? → A: Yes. All structural changes (add, delete, rename, move) propagate in real time to all active collaborators.
- Q: When two collaborators simultaneously create a file at the same path, how is the conflict resolved? → A: First writer wins; the second operation fails with an explicit conflict error — no silent overwrites.
- Q: Are uploads restricted to image files? → A: No. Users may upload any file type (images, CSVs, PDFs, AsciiDoc includes, etc.); no MIME type restriction is enforced by the system.

### Session 2026-06-02

- Q: When should an uploaded file appear in the file tree — during upload or after completion? → A: Only after the individual upload has fully completed (server returns 201). No ghost or placeholder nodes are shown in the tree for in-progress uploads.
- Q: Where and how should upload progress be communicated to the user? → A: Via a floating `UploadProgressPanel` anchored to the bottom of the file tree. It shows an overall batch progress bar (N / M files), and a scrollable per-item list with status icons (spinner / checkmark / ✕ + error reason). See FR-017 and US3-AC7.
- Q: When does the upload panel close? → A: Auto-dismisses 2 seconds after all items complete with no errors. If any item failed, the panel stays open until the user explicitly clicks the close button (the error list is scrollable to handle large batches).
- Q: What does "configurable key bindings" mean — per-user, per-project, or developer-only? → A: Per-user. Each user stores their own bindings in the DB; defaults apply on first use.
- Q: Should key binding shortcuts fire everywhere in the app or only in the file tree? → A: File tree focus only. Shortcuts fire only when a file tree node is focused; this avoids conflicts with the document editor or other inputs.
- Q: Can the same key combo be bound to actions in different namespaces (e.g. file-tree and editor)? → A: Yes. Namespaces activate under distinct focus contexts, so cross-namespace overlap is intentional and permitted. Within a namespace, duplicates are rejected.

## Assumptions

- Storage is backed by the local filesystem. A future phase will overlay a git layer on top of this same filesystem structure; because user-visible files are stored at paths matching the logical file tree, no structural transformation is needed to make the directory a git repository.
- The storage root path is configurable via environment variable per FR-008; no default path is hardcoded.
- Each project's storage directory is named by the project's UUID, giving a stable, collision-free, human-inspectable layout on disk.
- System-internal files (Yjs CRDT state) are stored in a hidden subdirectory within the project directory (e.g., `.collab/`) so they are invisible to directory listings and can be excluded from git via `.gitignore` in the future phase.
- The domain's existing `contentId`, `yjsStateId`, and `storagePath` identifiers are sufficient to address stored resources; no new identifier scheme is needed.
- Collaborative editing (Hocuspocus) reads and writes Yjs state through the same storage abstraction, using the hidden system directory.
- Archiving a project does not affect its stored files; only deletion removes them.
- Content is stored as raw bytes with no server-side compression or encryption in this phase; those concerns are deferred.
- Maximum upload size per file defaults to 20 MB (env-var default); administrators may override this at runtime via the admin settings panel without a server restart (see FR-016). The runtime value stored in the database takes precedence over the env-var default.
- File paths are never exposed in API error responses; `ContentNotFoundError` carries the path for server-side logging only and maps to a generic `404` message at the HTTP boundary.
- Real-time file tree events are delivered via SSE; the event bus is in-process only — horizontal scaling to multiple API instances requires replacing it with an external pub/sub broker (deferred to a future phase).
- Real-time file tree events are delivered over a dedicated SSE channel; no separate push infrastructure beyond Fastify is introduced in this phase.
