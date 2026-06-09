# Feature Specification: Real-time Co-editing (Editor Integration)

**Feature Branch**: `020-realtime-co-editing`

**Created**: 2026-06-09

**Status**: Draft

**Input**: User description: "Start Phase 8 - Real-time co-editing (y-codemirror.next, presence indicators, collaborative undo/redo); find Deferred E2E Tests in previous specs tasks"

## Overview

The collaboration server (spec `018-collaboration-server`) provides per-document rooms, an authentication hook, awareness broadcasting, and durable Yjs persistence — but nothing in the editor connects to it yet. This feature is the **client-side editor integration**: binding the in-app code editor to a live collaboration room so that multiple people editing the same file see each other's changes in real time, see each other's cursors and selections, and can undo their own work without clobbering anyone else's.

This feature also discharges the work that spec 018 explicitly deferred to "the editor integration phase":

- **FR-012 of spec 018** — read-only fallback when the collaboration server is unreachable.
- **Four deferred Playwright E2E tests** (collaborative editing, awareness, observer, late-join) — see *Deferred E2E Tests Inherited from Spec 018* below.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Two people edit the same file together (Priority: P1)

Two project members open the same file at the same time. As one person types, the other sees the characters appear in their own editor within about a second, at the correct position, without losing their place. When both type at once, the document converges to the same result for everyone — no edit silently overwrites another. A person who opens the file later sees all edits made so far without any manual refresh or "sync" action.

**Why this priority**: Real-time convergent editing is the entire point of the phase. Presence and collaborative undo are enhancements layered on top; without live shared editing there is no collaboration. This is the smallest slice that delivers user value and is independently shippable.

**Independent Test**: Open the same file in two browser sessions signed in as two different editors. Type in session A and confirm the text appears in session B within ~1 second. Type concurrently in both and confirm both editors show identical text. Close both, reopen in a third session, and confirm all prior edits are present.

**Acceptance Scenarios**:

1. **Given** two editors have the same file open, **When** editor A types a sentence, **Then** editor B sees that sentence appear at the correct position within ~1 second without their own cursor jumping.
2. **Given** two editors have the same file open, **When** both type into different paragraphs at the same time, **Then** both editors converge to a document containing both contributions with no lost characters.
3. **Given** editor A has been editing a file alone for a while, **When** editor B opens the same file, **Then** editor B's editor shows the current collaborative content (not the original stored file), without a manual sync step.
4. **Given** the file has never been collaboratively edited, **When** the first user opens it, **Then** the editor shows the stored file content as the starting point.
5. **Given** a user is editing collaboratively, **When** they stop editing and the room later tears down, **Then** the file's stored content reflects their edits the next time it is opened (persistence is the server's responsibility; the editor must not perform its own conflicting content save while a room is active).

---

### User Story 2 - See where collaborators are working (Priority: P2)

While editing together, each person sees a labelled, coloured cursor for every other participant, and a coloured highlight over any text another participant has selected. Each remote cursor carries that participant's display name and avatar so it is obvious who is doing what. A user never sees their own cursor, name, or avatar rendered as an overlay — only those of others.

**Why this priority**: Presence makes simultaneous editing comprehensible and prevents people from typing over each other. It depends on US1 being in place but adds substantial value, so it is the first enhancement.

**Independent Test**: With two editors in the same file, move editor A's cursor and make a selection; confirm editor B sees A's coloured cursor, name, avatar, and selection highlight at the right place, and that editor A sees none of their own overlays.

**Acceptance Scenarios**:

1. **Given** two editors in the same file, **When** editor A moves their cursor, **Then** editor B sees A's labelled, coloured cursor move to the matching position.
2. **Given** two editors in the same file, **When** editor A selects a range of text, **Then** editor B sees that range highlighted in A's colour.
3. **Given** any participant, **When** they look at their own editor, **Then** they do not see their own cursor overlay, name label, or avatar rendered.
4. **Given** a participant leaves the file, **When** they disconnect, **Then** their cursor, selection highlight, name, and avatar disappear from everyone else's editor within a few seconds.
5. **Given** several participants are present, **When** a user looks at the editor, **Then** they can tell at a glance how many other people are present and who they are.

---

### User Story 3 - Undo only my own changes (Priority: P3)

When a user presses undo, only their own most recent edits are reverted — a collaborator's concurrent changes are never undone by someone who did not make them. Redo re-applies the user's own reverted edits. This holds even while others are actively typing.

**Why this priority**: Collaborative undo prevents a frustrating and destructive failure mode (undo wiping out a colleague's work), but the document is already usable and convergent without it, so it ranks below presence.

**Independent Test**: With two editors in the same file, have editor A type two distinct edits and editor B type one edit in between. Editor A presses undo twice and confirms only A's two edits are removed while B's edit remains; A presses redo and confirms A's edits return.

**Acceptance Scenarios**:

1. **Given** editor A made several edits, **When** A presses undo, **Then** only A's most recent edit is reverted and the document remains consistent for all participants.
2. **Given** editor A and editor B have both edited, **When** A repeatedly presses undo, **Then** B's contributions are never removed by A's undo.
3. **Given** A has undone an edit, **When** A presses redo, **Then** A's reverted edit is restored.
4. **Given** a user undoes a change, **When** the undo is applied, **Then** all other participants see the same reverted state within ~1 second.

---

### User Story 4 - Read-only access when editing is unavailable (Priority: P3)

A project viewer (read-only member) can open a file and watch live collaborative changes and presence, but cannot edit — the editor is read-only and any edit attempt is rejected. Separately, when the collaboration server cannot be reached at the moment a user opens a file, the editor opens in read-only mode and shows a clear message explaining that editing is temporarily unavailable until the collaboration service is reachable, rather than silently accepting edits that would be lost.

**Why this priority**: This protects data integrity and sets correct expectations, and it discharges spec 018's deferred FR-012. It is lower priority than the core editing experience but must ship within this phase because 018 explicitly deferred it here.

**Independent Test**: (a) Sign in as a project viewer, open a file, confirm the editor is read-only and live changes from an editor are still visible. (b) With the collaboration server stopped, open a file as an editor and confirm the editor is read-only with a clear "editing unavailable" message.

**Acceptance Scenarios**:

1. **Given** a user with read-only (viewer) project access, **When** they open a file, **Then** their editor is read-only and they still see live edits and presence from active editors.
2. **Given** a viewer in a file, **When** they attempt to type, **Then** the edit is rejected and the document is not changed.
3. **Given** the collaboration server is unreachable, **When** a user opens a file, **Then** the editor opens read-only and shows a clear message that editing is unavailable until the service is reachable.
4. **Given** a user is editing and the connection to the collaboration server drops mid-session, **When** the disconnection is detected, **Then** the user is clearly informed of the connection state and understands whether their recent edits are still being synchronised.
5. **Given** the connection is restored after a drop, **When** the client reconnects, **Then** editing resumes and the document reconciles to the shared state without losing the user's place.

---

### Edge Cases

- **Slow initial sync**: The editor must not present empty or stale file content as editable before the collaborative state has synchronised; until sync completes the user sees a clear loading/connecting state.
- **Switching files**: When a user switches from one file to another, the editor must cleanly leave the first room (releasing presence) and join the second, with no leakage of cursors or content between files.
- **Rapid concurrent typing**: Sustained simultaneous typing by multiple users must still converge with no dropped characters and acceptable latency.
- **Same user, two tabs**: A single user opening the same file in two browser tabs is treated as two participants; their edits must still converge and not corrupt the document.
- **Large document**: Opening and co-editing a large file must remain responsive and sync within the stated latency targets.
- **Avatar missing**: A participant with no avatar image still gets a clear coloured, named cursor.
- **Permission change mid-session**: If a user's project role changes from editor to viewer while a file is open, subsequent edit attempts are rejected consistent with their new role.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The editor MUST connect to the collaboration server's per-document room for the file being viewed, authenticating as the current user, and MUST bind the editing surface to the shared collaborative document so local edits are published and remote edits are applied live.
- **FR-002**: The editor MUST render edits from other participants in place, in real time, without disturbing the local user's cursor position or scroll location.
- **FR-003**: Concurrent edits from multiple participants MUST converge to an identical document for all participants, with no edit silently overwriting another.
- **FR-004**: When opening a file, the editor MUST initialise its visible content from the synchronised collaborative state (which the server seeds from stored file content on first open), not from a separate direct file-content fetch that could diverge from the live state.
- **FR-005**: A user who joins a room after editing has occurred MUST see all prior collaborative edits automatically, without a manual sync action.
- **FR-006**: While a collaboration room is active for a file, the editor MUST NOT perform its own content-save (write-back) for that file; persistence of collaborative content is the collaboration server's responsibility.
- **FR-007**: The editor MUST display, for every OTHER participant in the room, a coloured cursor marker, that participant's display name, and their avatar; it MUST display a coloured highlight for any text another participant has selected.
- **FR-008**: The editor MUST NOT render the local user's own cursor overlay, name label, or avatar as a presence overlay (the local user sees only their normal native cursor).
- **FR-009**: The editor MUST publish the local user's cursor position and text selection as awareness data so other participants can see it, and MUST remove a participant's presence overlays promptly after that participant disconnects.
- **FR-010**: The editor MUST surface a clear indication of who else is currently present in the file (e.g., a participant count and identities).
- **FR-011**: Undo MUST revert only the local user's own edits, and redo MUST re-apply the local user's own reverted edits; a user's undo MUST NOT revert another participant's changes.
- **FR-012**: When the current user has read-only (viewer) project access, the editor MUST be read-only — the user still receives live document and presence updates, but cannot make edits, consistent with the server rejecting observer edits.
- **FR-013**: When the collaboration server is unreachable at the time a file is opened, the editor MUST open the file in read-only mode and display a clear message explaining that editing is unavailable until the collaboration service is reachable. *(Discharges deferred FR-012 of spec 018.)*
- **FR-014**: The editor MUST communicate connection state to the user — at minimum distinguishing connected/syncing, disconnected, and read-only-fallback states — so users understand whether their edits are being synchronised.
- **FR-015**: When a user switches files or closes the file, the editor MUST leave the corresponding room and stop publishing that user's presence, so stale cursors do not persist for other participants.
- **FR-016**: If the connection drops during an active session and is later restored, the editor MUST reconnect and reconcile to the shared collaborative state, preserving the user's editing position as far as possible.

### Non-Functional Requirements (Security & Operations)

These protect the real-time collaboration service, which is now reachable directly from users' browsers. They are technology-agnostic obligations; the plan/tasks map them to concrete controls.

- **NFR-001** (Connection limits): The collaboration service MUST limit the number of simultaneous connections and the connection rate per user so a single account cannot exhaust service resources.
- **NFR-002** (Trusted origins): The collaboration service MUST accept real-time connections only from the application's approved origins, rejecting connections initiated by other websites.
- **NFR-003** (Message size limits): The collaboration service MUST reject abnormally large edit messages to protect availability.
- **NFR-004** (Audited denials): The system MUST record an audit entry for every rejected collaboration connection and every rejected edit — capturing who, which resource, and why — without logging secrets or credentials.
- **NFR-005** (Secure transport): In production, real-time collaboration traffic MUST be carried over an encrypted connection.

### Key Entities *(include if feature involves data)*

- **Collaborative Document Binding**: The live association between the open editor and a specific document room; carries the synchronised text content and the local user's edit/observer capability for that file.
- **Participant Presence**: The awareness information shown for each other connected participant — cursor position, selected range, display name, avatar, and assigned colour. (Colour is assigned by the server per spec 018.)
- **Connection State**: The user-visible status of the editor's link to the collaboration server — connecting/synced, disconnected/reconnecting, or read-only fallback.
- **Local Edit History**: The per-user record of the local user's own edits that powers undo/redo scoped to that user.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: When one participant types, every other participant in the same file sees the change within 1 second under normal network conditions.
- **SC-002**: A participant who opens a file that has been edited for at least 30 seconds by others sees the full current content within 2 seconds of opening, with no manual sync.
- **SC-003**: After any sequence of concurrent edits by multiple participants, 100% of participants' editors display identical document content once activity settles.
- **SC-004**: In a session with multiple participants, a user pressing undo reverts only their own edits in 100% of trials; no trial removes another participant's contribution.
- **SC-005**: Each participant can correctly identify every other present participant (name and colour) and the location of their cursor in the editor.
- **SC-006**: When the collaboration server is unavailable at open time, 100% of file opens result in a read-only editor with a visible "editing unavailable" message and zero silently-discarded edits.
- **SC-007**: Project viewers can never successfully modify a file's content (0% of edit attempts succeed), while still receiving live updates.
- **SC-008**: All four E2E scenarios deferred from spec 018 (co-editing, awareness, observer, late-join), plus a collaborative-undo scenario, pass in CI before this phase is marked complete.

## Deferred E2E Tests Inherited from Spec 018

Spec 018 (`specs/018-collaboration-server/tasks.md`, "Deferred E2E Tests") explicitly deferred the following Playwright tests to this editor-integration phase. They MUST be created and passing before this feature is marked complete:

| Test file | Requirements covered | Maps to |
|-----------|---------------------|---------|
| `apps/web/e2e/collab-editing.spec.ts` | FR-001/003/005 (here); 018 FR-001, FR-005, FR-007, SC-001, SC-005 | US1 |
| `apps/web/e2e/collab-awareness.spec.ts` | FR-007/008/009 (here); 018 FR-010 | US2 |
| `apps/web/e2e/collab-observer.spec.ts` | FR-012 (here); 018 FR-004 observer, 018 US3 AC5 | US4 |
| `apps/web/e2e/collab-late-join.spec.ts` | FR-004/005 (here); 018 FR-007, FR-008, SC-002 | US1 |

A fifth test, `apps/web/e2e/collab-undo.spec.ts` (collaborative undo scoped to own edits — US3 / FR-011), is added by this phase.

## Assumptions

- **Collaboration is the standard editing path**: All editable project files are edited through the collaboration server going forward; there is no separate non-collaborative editing mode. (Consistent with spec 018, which built rooms for all documents.)
- **Server owns persistence**: The collaboration server seeds new documents from stored file content (018 FR-008) and writes collaborative state back to storage periodically and on room teardown (018 FR-009). This phase's editor therefore does not implement its own file-content save while a room is active, avoiding conflict with the upload/replace lock (018 FR-011).
- **Identity and colour come from the server**: Display name, avatar, and the per-participant colour are provided via the collaboration server's authentication hook and awareness data (018 FR-010, CollaborationParticipant); the editor renders them and does not assign its own colours.
- **Reusing existing editor**: The existing CodeMirror-based AsciiDoc editor in the web app is the surface being bound to collaboration; this phase adds the collaboration binding and presence UI rather than introducing a new editor.
- **Authentication reuse**: The editor authenticates to the collaboration server using the user's existing session credentials; no new login flow is introduced.
- **Network assumptions**: Latency targets (SC-001/002) assume normal broadband conditions; degraded networks may exceed them but must still converge correctly.
- **Single-instance deployment**: Consistent with spec 018's stated single-instance assumption for session/room management.

## Dependencies

- **Spec 018 — Collaboration Server**: Provides the room endpoint, auth hook, awareness broadcasting, observer write-rejection, and Yjs persistence this feature binds to.
- **Existing editor stack**: The web app's CodeMirror AsciiDoc editor and its file-open / file-switch flow.
- **Account avatars**: User avatar images from the account-management phase, surfaced through the collaboration server's awareness data.

## Out of Scope

- Changes to the collaboration server itself (rooms, auth, persistence, write-back) — delivered in spec 018.
- Multi-instance / horizontally-scaled collaboration (explicitly single-instance per 018).
- Commenting, chat, or annotation features beyond cursors/selections/presence.
- Document version history or time-travel UI beyond per-user undo/redo.
- Offline editing with later merge — when the server is unreachable, the editor is read-only (FR-013), not a queued-offline editor.
