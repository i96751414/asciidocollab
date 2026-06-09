# Feature Specification: Collaboration Server

**Feature Branch**: `018-collaboration-server`

**Created**: 2026-06-07

**Status**: Draft

**Input**: User description: "start phase 8 - Collaboration server (Hocuspocus, per-document rooms, auth hook, Yjs persistence)"

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Real-Time Co-Editing of a Document (Priority: P1)

Two or more project members have the same file open in the editor. As one user types, their changes appear in the other user's editor in real time — without any manual refresh or explicit send action. Each user's edits are continuously merged so no one loses their work when both type simultaneously.

**Why this priority**: Real-time sync is the defining capability of a collaboration server. Everything else (auth, persistence, presence) is support infrastructure for this core experience. If this doesn't work, the feature has no value.

**Independent Test** *(Phase 9 — requires CodeMirror-Yjs editor integration)*: Two browser sessions open the same project file. User A types text; User B sees it appear within 1 second. User B deletes a word; User A sees the deletion. Both users can type at the same time without one overwriting the other.
l
**Acceptance Scenarios**:

1. **Given** two authenticated project members have the same file open, **When** User A types text, **Then** User B sees the change appear in under 1 second without refreshing.
2. **Given** both users type simultaneously in different parts of the document, **When** both stop typing, **Then** both editors show the same merged content with no data loss.
3. **Given** a network hiccup disconnects User A briefly, **When** the connection is restored, **Then** User A's editor catches up to the current shared state automatically.
4. **Given** User A and User B have edited the same line concurrently during a disconnect, **When** they reconnect, **Then** a deterministic merge is applied and both see the same resolved result.

---

### User Story 2 — Joining an Active Collaboration Session (Priority: P1)

A project member opens a file that other users are already editing. They immediately receive the current collaborative document state — including all edits made while they were absent — and join the live session seamlessly.

**Why this priority**: Late joiners must start from the correct shared state, not from a stale file snapshot. This is foundational: without it, the collaboration server produces divergent documents.

**Independent Test**: User A edits a file for 30 seconds. User B then opens the same file. User B's editor displays all of User A's changes without any manual sync action.

**Acceptance Scenarios**:

1. **Given** User A has been editing a file for several minutes, **When** User B opens the same file, **Then** User B's editor shows the full current state including all of User A's changes.
2. **Given** a file has been edited collaboratively and all previous editors have since closed it, **When** a new user opens the file, **Then** they see the persisted collaborative state, not the original file snapshot.
3. **Given** a user opens a file with no active collaborators, **When** the file loads, **Then** the editor initialises from the persisted Yjs state if one exists, otherwise from the stored file content.

---

### User Story 3 — Access Control for Collaboration Rooms (Priority: P1)

Only authenticated members of a project can join that project's document collaboration rooms. Unauthenticated users and users who do not belong to the project are rejected before they can read or write any document content over the WebSocket connection.

**Why this priority**: Without auth enforcement at the collaboration layer, any knowledge of a document's room identifier is sufficient to read or write it — bypassing all project-level access controls. This must ship together with the collaboration server.

**Independent Test**: An authenticated user from a different project attempts to connect to a document's collaboration room. The connection is refused. An unauthenticated request is also refused. A valid project member connects successfully.

**Acceptance Scenarios**:

1. **Given** a user with a valid session who is a member of the project, **When** they connect to that project's document room, **Then** the connection is accepted.
2. **Given** an unauthenticated request to connect to any room, **When** the WebSocket handshake occurs, **Then** the connection is rejected with an auth error.
3. **Given** an authenticated user who is NOT a member of the project, **When** they attempt to connect to one of that project's document rooms, **Then** the connection is rejected.
4. **Given** a valid project member whose membership is revoked while they are connected, **When** the server next validates the session, **Then** the connection is terminated.
5. **Given** a project viewer (read-only role) connects to a document room, **When** they attempt to send an edit, **Then** the server rejects the edit and the viewer's editor remains non-editable.

---

### User Story 4 — Persistent Collaborative State Across Sessions (Priority: P2)

When all users close a document and the active session ends, the collaborative document state is not lost. The next time any user opens the file, the Yjs document state is loaded from storage, preserving all previously made edits.

**Why this priority**: Without persistence, every collaboration session starts from a stale file snapshot. Persistence is what bridges live sessions and makes the collaboration history durable.

**Independent Test**: Users A and B collaborate on a file, then both close it. After some time, User A reopens the file alone and sees all the edits from the previous session.

**Acceptance Scenarios**:

1. **Given** a completed collaboration session where edits were made, **When** all users disconnect and a new user later opens the file, **Then** the Yjs-persisted state is loaded and the edits are present.
2. **Given** the collaboration server restarts, **When** a user opens a file that has a persisted Yjs state, **Then** the state is restored from storage without requiring users to re-upload or re-edit.
3. **Given** a file that has never been collaboratively edited, **When** a user opens it for the first time, **Then** the initial document state is derived from the stored file content.

---

### Edge Cases

- What happens if a user's connection drops mid-edit and they reconnect after a long time? They should receive a full state sync, not a partial delta.
- What happens if two users each make edits offline and both reconnect at the same time? The Yjs CRDT merge resolves conflicts automatically.
- What happens when a project is deleted while users are in active collaboration rooms? Active connections should be terminated and rooms closed.
- What happens when the collaboration server is shut down with active connections? Before exiting, the server MUST flush the Yjs state of every active room to persistent storage, so no in-memory edits are lost. Clients are disconnected and should reconnect automatically once the server is back up, loading state from persistence.
- What happens when the collaboration server is unreachable when a user tries to open a file? The file opens in read-only mode; the user cannot edit until the collaboration server is available again.
- What happens if a file is modified through the file storage API (e.g., upload) while a collaboration session is active? The upload is blocked and the uploader receives a clear error message indicating the file is currently being edited by active collaborators.

## Clarifications

### Session 2026-06-07

- Q: Does a user see their own avatar/cursor overlaid in the editor? → A: No — a user sees only the cursors, avatars, and names of other connected participants, never their own.
- Q: When the collaboration server is unreachable, can users still edit the file? → A: No — the file opens in read-only mode with a visible message; editing is blocked until the server is available again.
- Q: Can project viewers (read-only role) connect to collaboration rooms? → A: Yes — viewers connect as observers, receiving live document state and presence data, but the server rejects any edits they attempt to send.
- Q: What happens to in-memory edits when the server is shut down? → A: The server MUST perform a full persistence flush on shutdown — all active room states are written to the database and file storage before the process exits; no edits are discarded.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide a WebSocket endpoint that implements the Yjs sync protocol for real-time document collaboration.
- **FR-002**: Each document MUST have an isolated collaboration room identified by a stable document identifier; rooms for different documents MUST NOT share Yjs state.
- **FR-003**: The collaboration server MUST authenticate every connection attempt before allowing any document data to be exchanged, using the application's existing session mechanism.
- **FR-004**: The collaboration server MUST verify that the connecting user is a member of the project that owns the requested document before accepting the connection. Users with write access join as active editors; users with read-only access (viewers) join as observers — they receive live document state and presence data but their own edits are rejected by the server.
- **FR-005**: All connected clients in a room MUST receive document updates in real time as other clients make changes.
- **FR-006**: The collaboration server MUST persist the Yjs document state so that it survives server restarts and session gaps.
- **FR-007**: When a client joins an existing room, it MUST receive a full sync of the current Yjs document state.
- **FR-008**: When a client joins a room for a document with no prior Yjs state, the server MUST initialise the Yjs document from the currently stored file content.
- **FR-009**: The system MUST automatically write the Yjs document state back to the file storage layer at a configurable periodic interval (configurable by administrators) and additionally on room teardown (when the last connected user leaves), keeping file content consistent with collaborative edits.
- **FR-011**: The file storage layer MUST reject any upload or replace operation targeting a document that has an active collaboration room; the rejection response MUST include a human-readable message explaining that the file is currently being edited.
- **FR-012** *(Deferred to Phase 9 — editor integration)*: When the collaboration server is unreachable at the time a user opens a file, the editor MUST open the file in read-only mode and display a clear message explaining that editing is unavailable until the collaboration server is accessible. This requirement depends on the CodeMirror-Yjs provider binding (Phase 9) and cannot be implemented without editor integration. The collaboration server exposes the WebSocket endpoint; the read-only fallback behaviour is the responsibility of the editor client.
- **FR-013**: On receiving a shutdown signal, the collaboration server MUST complete a full persistence flush — writing the current Yjs state of every active room to the database and triggering a write-back to file storage for each room — before the process exits. No in-memory edits may be discarded during a graceful shutdown.
- **FR-010**: The server MUST broadcast real-time awareness data to all connected clients in a room. Each client MUST display the cursor position, text selection, display name, and avatar of every OTHER connected participant — a user MUST NOT see their own cursor overlay, avatar, or name label rendered in the editor.

### Key Entities

- **CollaborationRoom**: An active or dormant session associated with a specific document, identified by the document's unique ID. Maintains the list of connected clients and the authoritative Yjs document state in memory.
- **YjsDocumentStore**: The persisted representation of a Yjs document's binary state, associated with the document ID and stored in the application's database.
- **CollaborationParticipant**: A connected user within a room, carrying their session identity, project membership status, access mode (editor or read-only observer), and awareness metadata (cursor position, text selection, display name, avatar URL, assigned colour).
- **CollaborationSettings**: Administrator-managed configuration for the collaboration server, including the write-back interval and any other operational parameters.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Changes made by one user appear in all other connected users' editors within 1 second under normal network conditions.
- **SC-002**: A user joining an active collaboration session sees the correct current document state within 2 seconds of opening the file.
- **SC-003**: After a graceful server shutdown and restart, all files with active collaboration sessions at shutdown time load with their complete Yjs state for the next user who opens them — zero in-memory edits are lost.
- **SC-004**: Unauthorised connection attempts (unauthenticated or non-member users) are rejected 100% of the time before any document content is transmitted.
- **SC-005**: Concurrent edits by two or more users converge to identical document state on all clients within 2 seconds of the last edit.
- **SC-006**: The collaboration server handles at least 50 simultaneous document rooms without degrading sync latency beyond the SC-001 threshold.

## Assumptions

- The existing file storage and project membership systems are already in place and their APIs are stable (built in previous phases).
- User accounts already have an avatar image stored and accessible (from the account management phase); the collaboration server reuses this without storing its own copy.
- The write-back interval has a sensible default (e.g., 30 seconds) that administrators can override via the application settings UI or configuration.
- The existing session/authentication mechanism can be verified from a WebSocket connection context (e.g., via cookie or token passed during the WebSocket handshake).
- Each document is identified by a stable unique ID that can serve as the room identifier.
- The application database is available to the collaboration server process for Yjs state persistence.
- The CodeMirror editor (Phase 6) will be extended separately to bind to the Yjs provider — the collaboration server exposes the protocol endpoint; editor integration is out of scope for this phase.
- Mobile/offline-first sync (long-term offline editing with merge-on-reconnect) is out of scope; only short disconnections (network hiccups) are handled.
