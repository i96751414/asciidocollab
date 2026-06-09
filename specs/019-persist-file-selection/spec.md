# Feature Specification: Persist & Restore File Selection

**Feature Branch**: `019-persist-file-selection`

**Created**: 2026-06-09

**Status**: Draft

**Input**: User description: "when a user has a file selected and move to a different page (e.g. settings) when he returns to the same project, the same file should be selected, if the file is an asciidoc file also selected the closest line that was previously selected (if any)"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Resume on the last opened file (Priority: P1)

A user is working inside a project with a particular file open in the editor. They navigate away to another part of the app (for example, the project's Settings or Members page, the dashboard, or another project) and later come back to the same project. When they return, the file they last had open is automatically selected and shown in the editor again, so they can pick up where they left off without hunting through the file tree.

**Why this priority**: This is the core of the feature and delivers the primary value on its own — eliminating the friction of manually re-finding and re-opening the same file every time a user returns to a project. It is usable and valuable even without any cursor-position restoration.

**Independent Test**: Open a project, select a file, navigate to the project's Settings page, then navigate back to the project view. Confirm the same file is selected and its content is shown, with no manual action.

**Acceptance Scenarios**:

1. **Given** a user has file "A.adoc" selected in a project, **When** they navigate to Settings and then back to the project, **Then** "A.adoc" is automatically selected and its content is displayed.
2. **Given** the remembered file lives several folders deep and those folders are collapsed when the tree loads, **When** the user returns to the project, **Then** the ancestor folders are expanded and the file's node is scrolled into view and highlighted (not just loaded in the editor).
3. **Given** a user had a file selected and then closes and reopens the browser (returning to the same project while still signed in), **When** the project view loads, **Then** the previously selected file is selected again.
4. **Given** a user has different files selected in two separate projects, **When** they return to either project, **Then** each project restores its own last-selected file independently.
5. **Given** a user is visiting a project for the very first time (no prior selection recorded), **When** the project view loads, **Then** the app behaves as it does today (no file forced open) without error.

---

### User Story 2 - Resume at the last cursor line in AsciiDoc files (Priority: P2)

When the restored file is an AsciiDoc document, the editor also returns the user to the line where their cursor was when they left, scrolling that line into view. If the document has since changed and the exact remembered line no longer exists, the editor positions the cursor at the closest still-valid line instead.

**Why this priority**: Builds on top of US1 to further reduce context-switching cost for the main editing workflow, but the feature is already useful without it. Requires US1 (the file must be restored before a line within it can be).

**Independent Test**: Open an AsciiDoc file, place the cursor on a line well below the top, navigate away and back, and confirm the editor returns to that line (visible and focused). Then shorten the document below the remembered line, return again, and confirm the cursor lands on the closest available line without error.

**Acceptance Scenarios**:

1. **Given** a user had the cursor on line 42 of an AsciiDoc file, **When** they navigate away and return to the project, **Then** the file is restored and the cursor is positioned on line 42 with that line scrolled into view.
2. **Given** the remembered line number is greater than the number of lines now in the document, **When** the file is restored, **Then** the cursor is placed on the last line of the document (the closest available line) without error.
3. **Given** the restored file is not an AsciiDoc document (e.g., an image or other non-editable file), **When** it is restored, **Then** only the file selection is restored and no line position is applied.
4. **Given** no cursor line was ever recorded for the file (e.g., it was selected but never focused), **When** the file is restored, **Then** the editor opens at its default position without error.

---

### User Story 3 - Graceful fallback when the remembered file is gone (Priority: P3)

If the file a user last had selected has since been deleted, moved, or otherwise no longer identifiable when they return, the app does not error or get stuck. It quietly falls back to the normal "no file selected" state and forgets the stale selection so it does not keep trying to restore something that no longer exists.

**Why this priority**: A robustness/edge-case story that protects the experience but is not part of the happy path. The feature is demonstrable without it, but it should not be skipped before release.

**Independent Test**: Select a file, delete that file (e.g., from another session or device), then return to the project. Confirm no error is shown, the editor shows the normal empty/default state, and subsequent navigation no longer attempts to restore the deleted file.

**Acceptance Scenarios**:

1. **Given** the last-selected file has been deleted, **When** the user returns to the project, **Then** no error is shown and the project view loads in its default no-file-selected state.
2. **Given** the remembered selection points to a file that can no longer be found, **When** restoration is attempted, **Then** the stale memory is cleared so it is not retried on future visits.

---

### Edge Cases

- **Remembered line exceeds current document length** (document was shortened): position the cursor on the last available line.
- **Remembered file was deleted or moved so its identity changed**: fall back to no selection and clear the stale memory (US3).
- **File still exists but was renamed/relocated while keeping its identity**: the same file is still restored (its new name/location is reflected).
- **User left the project with no file selected**: nothing is restored; the project opens in its default state.
- **A folder (not a content file) was the last thing interacted with**: folders are not "opened" as content, so only the last selected content file is remembered and restored.
- **Document content changed around the remembered line** (e.g., edited collaboratively): restoration is by line number on a best-effort basis; the cursor returns to that line number (or the closest valid one), accepting that the surrounding text may have shifted.
- **Remembered file is inside collapsed folders**: the ancestor folders are expanded and the node is scrolled into view so the selection is visible (not merely loaded in the editor). The default tree state shows only top-level folders expanded, so a nested remembered file would otherwise be hidden.
- **User collapses a folder containing the currently selected file**: the tree does NOT auto-re-expand it — reveal only reacts to the selection changing, not to manual collapse of an already-selected file.
- **Very large file tree / large document**: restoration must still feel instant and must not block the project view from becoming interactive.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST remember, for each project the user opens, which file the user most recently had selected.
- **FR-002**: When a user returns to a project for which a selection was remembered, the system MUST automatically re-select that file, **make it visible in the file tree (expanding any collapsed ancestor folders and scrolling the node into view so it is highlighted)**, and display its content, without requiring any manual action.
- **FR-003**: The system MUST remember selections per project independently, so selecting a file in one project does not change what is restored in another.
- **FR-004**: For AsciiDoc files, the system MUST additionally remember the line on which the user's cursor was positioned when they left the file.
- **FR-005**: When restoring an AsciiDoc file, the system MUST position the cursor on the remembered line and scroll it into view; if that line no longer exists in the current document, it MUST use the closest still-valid line.
- **FR-006**: For non-AsciiDoc files, the system MUST restore only the file selection and MUST NOT attempt to apply a line position.
- **FR-007**: The remembered selection MUST persist across in-app navigation away from and back to the project, and across browser reloads/restarts within the same browser while the user remains signed in.
- **FR-008**: The system MUST keep the remembered selection current as the user works — updating it when the user changes which file is selected and when they move the cursor within an AsciiDoc file — so that the most recent state is what gets restored.
- **FR-009**: If the remembered file can no longer be found when the user returns, the system MUST NOT show an error; it MUST fall back to the default no-file-selected state and clear the stale memory.
- **FR-010**: Restoration MUST NOT block the project view from loading; the view MUST become usable even if restoration is still resolving or ultimately fails.
- **FR-011**: The remembered selection MUST reflect the individual user's own activity and MUST NOT be shared with or applied to other users of the same project.
- **FR-012**: Whenever a file is selected programmatically (in particular when restoring on return), if the file is hidden because its ancestor folders are collapsed, the system MUST expand those ancestor folders and scroll the node into view so the selection is visible and highlighted in the tree. This MUST NOT fight the user: manually collapsing a folder that contains the already-selected file MUST NOT trigger a re-expand.

### Key Entities *(include if feature involves data)*

- **Last Selection Memory**: Represents, for a given user and a given project, the most recently selected file and (when applicable) the last cursor line within it. Key attributes: the project it belongs to, the identity of the selected file, and an optional remembered line number for AsciiDoc files. There is at most one such record per user-project pair; updating it overwrites the previous value.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In at least 99% of returns to a project where the previously selected file still exists, that file is automatically re-selected with no manual action by the user.
- **SC-002**: For AsciiDoc files, when a user returns the cursor is restored to within one line of where they left it in at least 95% of cases (accounting for documents that changed while away).
- **SC-003**: File (and line, where applicable) restoration completes within 1 second of the project view becoming visible, so it is perceived as instantaneous.
- **SC-004**: Returning to a project after the previously selected file was deleted results in a usable default state with no error 100% of the time.
- **SC-005**: Returning users no longer need to manually locate and re-open their working file — the manual re-selection step is eliminated for the restore happy path.

## Assumptions

- **Persistence durability**: The remembered selection persists on the same browser across page reloads and browser restarts (consistent with how the app already persists editor drafts and preferences). Synchronizing the remembered selection across different devices/browsers is considered a future enhancement and is out of scope for this feature; restoration is expected to work on the browser where the selection was made. *(Candidate for `/speckit-clarify` if cross-device restoration is required.)*
- **File identity**: Files are tracked by a stable identifier. A rename or move that preserves a file's identity keeps the selection restorable; a change that replaces the file's identity is treated as the file no longer existing.
- **"Closest line" semantics**: Restoration is by line number on a best-effort basis. If the remembered line number exceeds the current document length, the cursor is clamped to the last line. The feature does not attempt to track the original line's content through subsequent edits.
- **Scope of "selection"**: Only content-bearing files are remembered and restored; folders (which expand rather than open content) are not the subject of restoration.
- **Cursor granularity**: Restoration targets the remembered line (and scrolls it into view). Restoring exact column, text selection ranges, scroll offset within a line, or undo history is out of scope.
- **Existing behavior reuse**: This feature reuses the existing project editor, file tree, and AsciiDoc editor; it adds last-selection memory alongside the existing editor-preference and draft-persistence mechanisms rather than replacing them.
- **Authentication & user isolation**: The user is signed in; restoration is tied to the user's own context. The remembered selection is scoped to the individual user's identity (not just the browser), so two accounts that share the same browser profile do not see each other's remembered selection (FR-011).
