# Feature Specification: Up-to-Date Downloads

**Feature Branch**: `031-up-to-date-downloads`

**Created**: 2026-06-21

**Status**: Draft

**Input**: User description: "when a user request a download, a single file or the complete project, the downloaded files must be the most up to date (it must consider changes in hocuspocus that may not have been comitted/synced to disk)"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Download a single file reflecting the latest edits (Priority: P1)

A collaborator is actively editing a document. Without waiting, they (or another member of the project) download that single file from the file tree. The downloaded file contains every change made up to the moment of the request, including edits that are still only held in the live collaborative session and have not yet been written to permanent storage.

**Why this priority**: This is the core promise of the feature and the most common download action. A download that silently returns stale content undermines trust in the whole product and can cause data loss for users who assume the download is authoritative.

**Independent Test**: Open a document, type a change, and immediately trigger a single-file download for that document without pausing. Confirm the downloaded file contains the just-typed change.

**Acceptance Scenarios**:

1. **Given** a document with unsaved live edits in an active collaborative session, **When** a member downloads that single file, **Then** the downloaded content includes those live edits.
2. **Given** a document with no active editors and no pending unsynced changes, **When** a member downloads that single file, **Then** the downloaded content matches the most recently stored version.
3. **Given** a document that was just edited and the change is still pending, **When** two members download the same file at nearly the same time, **Then** both receive content that includes the edit.

---

### User Story 2 - Download the complete project reflecting the latest edits (Priority: P1)

A member requests a download of the entire project as a single archive. The archive contains every file in the project, and each file reflects the latest content including any live edits that have not yet been written to permanent storage, across all documents currently or recently being edited.

**Why this priority**: Exporting the whole project is the primary way users take their work elsewhere (backup, sharing, publishing). If any file in the archive is stale, the export is unreliable and the user may not notice until later.

**Independent Test**: With one or more documents holding live unsynced edits, request a full project download and inspect each file in the resulting archive to confirm all of them reflect the latest content.

**Acceptance Scenarios**:

1. **Given** several documents in a project where some have live unsynced edits, **When** a member downloads the complete project, **Then** every file in the archive reflects its latest content including the unsynced edits.
2. **Given** a project where no documents have pending edits, **When** a member downloads the complete project, **Then** the archive matches the stored state of every file.
3. **Given** a project containing binary or non-edited files (e.g., images) alongside edited documents, **When** a member downloads the complete project, **Then** the archive includes all files with edited documents up to date and non-edited files unchanged.

---

### User Story 3 - Download remains reliable when the live session is unavailable (Priority: P2)

A member requests a download for a file or project for which there is no active collaborative session, or the live-editing service cannot be reached at that moment. The download still succeeds and returns the best available content (the most recently stored version) rather than failing outright.

**Why this priority**: Downloads must remain dependable even when no one is editing or when the collaborative service is degraded. Falling back gracefully prevents the feature from becoming a new source of failures.

**Independent Test**: Trigger a download for a document with no active session and confirm it returns the stored content. Simulate the live-editing service being unreachable and confirm the download still completes using stored content.

**Acceptance Scenarios**:

1. **Given** a file with no active collaborative session, **When** a member downloads it, **Then** the download returns the most recently stored content successfully.
2. **Given** the live-editing service is temporarily unreachable, **When** a member downloads a file or project, **Then** the download still completes using stored content rather than returning an error.

---

### Edge Cases

- What happens when a download is requested for a document that has an active session but currently has no pending unsynced changes? The result must equal the stored content (no duplication or corruption).
- How does the system handle a download request that arrives while a file is mid-edit, with a stream of incoming changes? The download must capture a consistent snapshot at the moment of the request, not a torn mix of partial states.
- What happens for very large projects with many actively edited documents? The download must still complete within acceptable time and not be blocked indefinitely waiting on the live session.
- How does the system handle a file that exists in the live session but has been deleted/renamed in storage, or vice versa? The download must reflect the authoritative current file structure and not include phantom or duplicate entries.
- What happens if gathering the latest content for one document in a full-project download fails or times out? The overall download should still complete, and the behavior for the affected file must be predictable (see assumptions).
- How does the system handle non-text/binary files that are not part of the live-editing model? They must be included unchanged from storage.
- What happens if a user without permission to the project or file requests a download? Access control must be enforced exactly as it is today; the freshness change must not weaken authorization.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: When a user requests a single-file download, the system MUST return content that reflects the latest edits known to the live collaborative session, including changes not yet written to permanent storage.
- **FR-002**: When a user requests a complete-project download, the system MUST ensure each included file reflects its latest edits known to the live collaborative session, including changes not yet written to permanent storage.
- **FR-003**: The system MUST capture a consistent snapshot of a document's content at the time of the download request, so the downloaded file is not a torn mix of partial concurrent edits.
- **FR-004**: For files or projects with no active collaborative session, the system MUST return the most recently stored content.
- **FR-005**: If the live-editing service is unreachable or fails to provide the latest content for a file within an acceptable time, the system MUST fall back to the most recently stored content so the download still completes.
- **FR-006**: The system MUST include all files belonging to the project in a complete-project download, including non-edited and binary files, with edited documents reflecting their latest content.
- **FR-007**: The freshness behavior MUST NOT change existing access-control rules; only members authorized to download a file or project today may do so.
- **FR-008**: The downloaded file names, structure, and archive layout MUST remain consistent with the current download behavior; only the freshness of content changes.
- **FR-009**: The system MUST NOT require the user to manually trigger a save or wait for a sync interval before downloading in order to obtain up-to-date content.
- **FR-010**: Obtaining the latest content for a download MUST NOT cause loss or corruption of in-progress edits in the live session, and MUST NOT force other collaborators to lose unsynced work.
- **FR-011**: The complete-project download MUST reflect the current file/folder structure of the project, excluding files that no longer exist and including newly added files.

### Key Entities *(include if feature involves data)*

- **Document content (live)**: The current in-memory state of a document held by the live collaborative session, which may contain edits not yet persisted to storage.
- **Stored file**: The version of a file written to permanent storage; may lag behind the live state by the sync interval.
- **Download request**: A user-initiated action targeting either one file or the whole project, requiring the most up-to-date content as of the request time.
- **Project file structure**: The authoritative set of files and folders that defines what a complete-project download must contain.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of single-file downloads return content that includes edits made up to the moment of the request, with no dependency on a background sync interval having elapsed.
- **SC-002**: 100% of files within a complete-project download reflect their latest content as of the request time for documents under active editing.
- **SC-003**: Downloads continue to succeed in 100% of cases where the live-editing service is unavailable, returning stored content as a fallback.
- **SC-004**: A user who types a change and immediately downloads sees that change in the downloaded file in under the time it currently takes a download to complete (no perceptible added wait beyond a small, bounded freshness step).
- **SC-005**: Zero reports of downloads containing torn/partial document states or missing recently-typed edits after the feature ships.
- **SC-006**: Access-control outcomes for downloads are unchanged: zero new cases where an unauthorized user can download content.

## Assumptions

- The live collaborative session is the authoritative source for the most up-to-date document content; permanent storage may lag by a sync/debounce interval.
- Only text-based documents participate in the live collaborative editing model; binary and other non-edited files are served from storage unchanged.
- A small, bounded delay to fetch the latest content from the live session is acceptable to users in exchange for guaranteed freshness, provided downloads still feel responsive.
- When the latest live content for a specific file cannot be obtained in time during a full-project download, falling back to that file's stored content (rather than failing the entire download) is the desired behavior.
- The set of files included in a project download is defined by the current project file structure, consistent with how downloads currently determine their contents.
- Existing authorization and project-membership checks remain the gate for all downloads and are not relaxed or bypassed by this feature.
- Concurrency expectations (multiple members downloading and editing simultaneously) are within the same order of magnitude already supported by the collaborative editing system.
