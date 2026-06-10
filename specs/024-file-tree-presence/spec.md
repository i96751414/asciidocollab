# Feature Specification: File-Tree Open-File Presence

**Feature Branch**: `024-file-tree-presence`

**Created**: 2026-06-10

**Status**: Draft

**Input**: User description: "mark the files in the file tree that are open by other users (and show which users on a mouse over)"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See which files others have open (Priority: P1)

A collaborator browsing a project's file tree can tell at a glance which files are currently open by other people. Each file that at least one other user has open shows a clear visual marker, so the viewer knows where concurrent activity is happening before they jump in.

**Why this priority**: This is the core of the request and the minimum that delivers value — it lets collaborators avoid blind concurrent edits and coordinate around active files. The marker alone (even without names) is useful.

**Independent Test**: With two accounts, open a file as user B; confirm user A, viewing the same project's file tree, sees that file marked as open — and sees no marker on files no one else has open.

**Acceptance Scenarios**:

1. **Given** user A is viewing a project's file tree, **When** user B opens a file in that project, **Then** user A sees that file marked as "open by others" within a few seconds.
2. **Given** a file that no other user has open, **When** user A views the tree, **Then** that file shows no open marker.
3. **Given** user A has a file open themselves and no one else does, **When** user A views the tree, **Then** that file is not marked as "open by others" (the marker reflects *other* users).

---

### User Story 2 - See who has a file open (Priority: P2)

When a file is marked as open, the viewer can hover (or focus) the marker to see which user(s) currently have that file open — by display name, with avatar when available — so they know whom to coordinate with.

**Why this priority**: Knowing *who* turns the signal into actionable coordination ("ping Sara, she's in this file"). It builds directly on US1 and is the second half of the request.

**Independent Test**: With user B (and optionally user C) holding a file open, user A hovers the file's marker and sees exactly B (and C) listed.

**Acceptance Scenarios**:

1. **Given** a file marked as open by user B, **When** user A hovers/focuses the marker, **Then** user A sees B's identity (display name, avatar if available).
2. **Given** a file open by users B and C, **When** user A hovers the marker, **Then** user A sees both B and C listed.
3. **Given** a file open by many users, **When** user A hovers, **Then** the list shows the users with a sensible overflow indication (e.g., "+N more") rather than an unbounded list.

---

### User Story 3 - The signal stays accurate as people come and go (Priority: P3)

The markers reflect reality in near-real-time: they appear when someone opens a file, clear when the last other user leaves, and never linger after a disconnect or crash. The viewer can trust the indicator.

**Why this priority**: A presence signal that goes stale (showing files as "open" when no one is there) is worse than none — it erodes trust and misleads coordination. This robustness is essential but layered on top of the visible behavior in US1/US2.

**Independent Test**: Have user B open a file (A sees the marker), then have B close the file or drop their connection; confirm A's marker clears within a few seconds and no stale marker remains.

**Acceptance Scenarios**:

1. **Given** a file marked open by user B, **When** B closes the file, **Then** the marker clears for user A within a few seconds (if no other user still has it open).
2. **Given** a file open by user B, **When** B's connection drops abnormally (crash/network loss), **Then** the marker clears within the liveness window — no permanently-stuck "open" indicator.
3. **Given** user B has the same file open in two browser tabs, **When** user A hovers the marker, **Then** B is listed once (deduplicated by user).

---

### Edge Cases

- **Same user, multiple tabs/devices**: counts and displays as one user.
- **Abnormal disconnect (crash, network loss, tab killed)**: presence clears within the liveness window via the room teardown mechanism; no stale marker persists.
- **Many users on one file**: the hover lists users with a bounded overflow ("+N more").
- **Rapid open/close churn**: the marker is debounced/smoothed so it does not flicker distractingly.
- **File renamed or moved while open**: the marker follows the underlying file, not the old path/name.
- **Viewer is not a project member**: they cannot join the project's presence room and receive no open-file presence for it (file access is project-scoped — no per-file permissions).
- **Folder containing open files**: whether a folder reflects that a descendant is open is a secondary concern (see Assumptions) — v1 marks files.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST visually mark each file in the file tree that is currently open by at least one user other than the viewer.
- **FR-002**: The system MUST NOT mark a file that no other user currently has open.
- **FR-003**: The marker MUST reflect users *other than the viewer*; the viewer's own open file is not marked as "open by others".
- **FR-004**: Hovering or keyboard-focusing a file's marker MUST reveal the identity (display name; avatar when available) of each other user currently with that file open.
- **FR-005**: When multiple other users have the same file open, the reveal MUST represent all of them, with a bounded overflow indication when the list is long.
- **FR-006**: A marker MUST appear and disappear in near-real-time (no manual refresh) — quantified by SC-001 (appears ≤3s after another user opens the file) and SC-003 (clears ≤5s after the last other user closes it).
- **FR-007**: A marker MUST clear when a user's session ends abnormally (disconnect, crash, last client leaving), leaving no stale "open" indicator.
- **FR-008**: Open-file presence MUST be access-controlled — a viewer sees presence only for projects they are a member of. File access in this product is project-scoped (a project member can access every file in the project; there are no per-file permissions), so project-membership authorization fully bounds what presence a viewer may receive (no presence for projects they cannot access).
- **FR-009**: A user with the same file open across multiple tabs/devices MUST be represented as a single user in both the marker and the hover list.
- **FR-010**: The marker and hover MUST be accessible (keyboard-focusable, screen-reader labelled) and MUST follow the application's design-token theming, legible in both light and dark modes.
- **FR-011**: The feature MUST be presence-only — it MUST NOT modify document content, shared document state, or any other user's view of a document.

### Key Entities

- **Open-file presence**: the association between a file (its underlying document) and the set of users who currently have it open for editing. Ephemeral, derived from active collaboration sessions / room membership; not persisted as historical data.
- **Presence participant**: the identity shown on hover for a user holding a file open — display name and, when available, avatar — scoped to a single user regardless of how many tabs/devices they use.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: When another user opens a file, the viewer sees it marked in their file tree within 3 seconds.
- **SC-002**: For a marked file, the hover lists exactly the set of other users currently holding it open (correct membership) in ≥99% of checks.
- **SC-003**: When the last other user closes a file, the marker clears for the viewer within 5 seconds.
- **SC-004**: After an abnormal disconnect/crash, zero files remain falsely marked as open once the liveness window elapses.
- **SC-005**: A viewer never sees open-file presence for a project or file they are not authorized to access (0 leaks).
- **SC-006**: The marker and hover are legible and correct in both light and dark themes and are reachable and labelled for assistive technology.

## Assumptions

- The system already tracks active collaboration sessions per document (a room open/close lifecycle exists, including teardown on last-client-leave and a watchdog for orphaned rooms). "Open by other users" is derived from this active-session state.
- Per-user attribution for the hover (which specific users have a file open) is currently held as in-document real-time presence/awareness and is not stored in the active-session record; surfacing that user attribution to the file tree is in scope for this feature.
- "Open" means a user has the document open in the editor (an active collaboration session), not merely browsing the tree or previewing.
- The viewer's own currently-open file is not counted as "open by others" (the viewer already knows what they have open).
- v1 marks individual files. A folder reflecting that one of its descendants is open is a possible later enhancement and is out of scope unless it falls out naturally.
- Open-file presence is ephemeral and is NOT captured as audit/history data (separate from any audit-logging concern).
- Identity shown is the user's existing display name and avatar as already used elsewhere in the app (e.g., the in-document presence bar).
- Liveness window: the "few seconds" / clearing thresholds align with the existing collaboration room teardown and watchdog timing rather than introducing a new mechanism.
