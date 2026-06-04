# Feature Specification: File Tree UX Improvements & Project Page Consistency

**Feature Branch**: `013-file-tree-ux`

**Created**: 2026-06-03

**Status**: Draft

**Input**: User description: "the file tree must be sorted alphabetically; it must be possible to find a file in the tree and select the first match and iterate over the matches, if the file is in a collapsed folder, the folder must be uncollapsed until the file is selected; the errors related to the files must appear outside of the tree item so that it does not affect the view of the tree; review the look and feel of the project page to be more consistent"

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Alphabetically Sorted File Tree (Priority: P1)

A user opens a project and sees the file tree with all files and folders listed in alphabetical order at every level of the hierarchy. When new files are added or existing ones are renamed, the tree reorders to maintain alphabetical sorting automatically.

**Why this priority**: Alphabetical ordering is a fundamental expectation for any file browser. It reduces cognitive load when navigating large projects and is required before search/find can work predictably.

**Independent Test**: A user opens a project with mixed-order files and folders; the tree renders them in alphabetical order at each level (folders and files each sorted among themselves, or interleaved alphabetically).

**Acceptance Scenarios**:

1. **Given** a project with files and folders in an arbitrary server-side order, **When** the file tree renders, **Then** all items at each tree level are displayed in case-insensitive alphabetical order.
2. **Given** a folder with both sub-folders and files, **When** the folder is expanded, **Then** all children are displayed alphabetically, with no special grouping of folders before files required (natural alphabetical order).
3. **Given** a new file is created via the tree, **When** the tree updates, **Then** the new file appears at its correct alphabetical position, not appended to the end.
4. **Given** a file is renamed, **When** the tree updates, **Then** the renamed file moves to its new alphabetical position in the tree.

---

### User Story 2 — Find File in Tree (Priority: P2)

A user types a search query to find files or folders in the project tree. The first matching item is highlighted and selected. The user can cycle through all matches using a keyboard shortcut or UI control. If a match is inside a collapsed folder, all ancestor folders are automatically expanded to reveal the match.

**Why this priority**: As projects grow, scrolling to find a specific file becomes impractical. Search/find is essential for navigating large file trees efficiently. It depends on alphabetical sorting (P1) being in place.

**Independent Test**: A user opens a project with nested folders and files, triggers the find panel, types a partial filename, and the first match is selected and visible. Pressing "next match" cycles to the second match, expanding any collapsed folders as needed.

**Acceptance Scenarios**:

1. **Given** the file tree is visible, **When** the user activates the find feature (keyboard shortcut or UI button), **Then** a search input appears within the file tree panel.
2. **Given** a search query is entered, **When** the query matches one or more files or folders, **Then** the first match is highlighted and selected in the tree, scrolled into view.
3. **Given** multiple matches exist, **When** the user presses "next match", **Then** the selection moves to the next matching item; pressing "previous match" moves back.
4. **Given** a match is inside a collapsed folder, **When** that match is navigated to (first match or via next/previous), **Then** all ancestor folders containing that match are expanded so the item is visible.
5. **Given** the last match is selected and the user presses "next match", **Then** the selection wraps around to the first match.
6. **Given** no files match the search query, **When** the user types the query, **Then** a clear "no matches found" message is shown and no items are selected.
7. **Given** the find panel is active, **When** the user clears the query or dismisses the panel (Escape key), **Then** the tree returns to its normal state with all previously expanded folders restored and no match highlighting.

---

### User Story 3 — File Errors Outside Tree Items (Priority: P2)

Validation errors and operational errors associated with file or folder operations (e.g., invalid name, rename failure, creation failure) are displayed in a dedicated error area outside of the individual tree items, rather than inline within the tree row itself.

**Why this priority**: Inline errors within tree rows disrupt the visual alignment and make the tree hard to read, especially when errors appear and disappear. Errors belong in a stable UI region that does not shift the tree layout.

**Independent Test**: A user triggers a file naming error (e.g., creates a file with an invalid name). The error message appears in a designated area above or below the tree, not inside the tree row, and the tree items maintain their normal size and alignment.

**Acceptance Scenarios**:

1. **Given** a user attempts to create a file or folder with an invalid name, **When** the validation fires, **Then** the error message is shown in a designated error area outside the tree items (e.g., a banner or status area at the top or bottom of the file tree panel), not inside the tree row.
2. **Given** a rename operation fails (e.g., duplicate name, server error), **When** the error is received, **Then** the error is shown in the designated error area and the tree item returns to its normal (non-editing) state without layout disruption.
3. **Given** an error is displayed in the error area, **When** the user dismisses it or starts a new operation, **Then** the error area clears and the tree layout remains stable throughout.
4. **Given** multiple errors occur in sequence, **When** displayed, **Then** only the most recent error is shown (or errors are stacked in a readable, non-overlapping manner), and none disrupt the tree row heights.

---

### User Story 4 — Project Page Visual Consistency (Priority: P3)

The project editor page is reviewed for visual consistency: spacing, typography, color usage, and component appearance are aligned across the file tree panel, content panel, preview panel, and header. The page feels cohesive and uses design tokens and patterns consistently with the rest of the dashboard.

**Why this priority**: Visual consistency is a quality-of-life improvement that does not block core functionality but impacts the product's professional appearance. It is addressed after the more critical functional issues.

**Independent Test**: A reviewer opens the project page and compares header, sidebar, content panel, and preview panel — identifying no jarring visual mismatches in font size, spacing, border treatment, or button style relative to the design system.

**Acceptance Scenarios**:

1. **Given** the project page header, **When** reviewed against the rest of the dashboard, **Then** the back link, project name, description, and navigation links (Settings, Members) use consistent typography, spacing, and color tokens.
2. **Given** the file tree panel header ("Files" label and collapse button), **When** reviewed, **Then** it uses consistent styling with other panel headers in the application and the collapse/expand controls are legible and appropriately sized.
3. **Given** the sidebar collapse/expand affordance (the `‹`/`›` character buttons), **When** reviewed, **Then** they are replaced or styled consistently with the icon system used elsewhere in the dashboard.
4. **Given** the content panel and preview panel, **When** both are visible, **Then** their padding, border treatment, and empty-state typography are consistent with each other and with the design system.
5. **Given** the overall page, **When** a member (non-owner) views it, **Then** the absence of owner-only controls (Settings, Members links) does not leave visual gaps or misaligned remaining elements.

---

### Edge Cases

- What happens if all files in a project are nested in collapsed folders and a search is performed — all ancestor folders must expand for each match navigated to.
- What happens if a file is deleted while it is the active find match — the find session should gracefully advance to the next match or show "no matches".
- What happens if the tree is empty and the find panel is activated — an appropriate empty/no-files state is shown.
- How does sorting behave for files and folders with names that start with special characters or numbers — use standard locale-aware case-insensitive sort.
- What happens if an error is associated with a tree node that has since been deleted — the error area should not reference a stale node or crash.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The file tree MUST display all items at each level sorted in case-insensitive alphabetical order at all times, including after creation, rename, and real-time SSE updates.
- **FR-002**: The file tree MUST provide a find/search interface that accepts a text query and highlights matching files and folders.
- **FR-003**: The find feature MUST automatically select and scroll to the first match when a query is entered.
- **FR-004**: The find feature MUST support navigating forward and backward through all matches, cycling at the end/beginning.
- **FR-005**: The find feature MUST expand all collapsed ancestor folders of a matched item before selecting it.
- **FR-006**: The find feature MUST restore the tree's previous collapse state when the search is dismissed — specifically, folders that were auto-expanded by find navigation MUST be re-collapsed, while folders the user had manually expanded before the search remain expanded.
- **FR-007**: The find feature MUST display a "no matches" indicator when the query yields zero results.
- **FR-008**: File operation errors (create, rename, delete failures and name validation) MUST be displayed in a dedicated error area outside of the tree item rows. *(See FR-009 for the structural invariant this placement must preserve.)*
- **FR-009**: The error area MUST NOT alter the height, alignment, or visual structure of tree item rows. *(Companion constraint to FR-008: establishing where errors appear is insufficient if that placement disrupts tree layout.)*
- **FR-010**: The error area MUST clear when the user dismisses the error or begins a new operation.
- **FR-011**: The project page header, file tree panel, content panel, and preview panel MUST use consistent spacing, typography scale, and color tokens from the design system.
- **FR-012**: Sidebar collapse/expand controls MUST use a consistent icon representation aligned with the rest of the dashboard UI.

### Key Entities

- **FileTreeNode**: An existing entity representing a file or folder in the hierarchy; sorting applies to the `children` array of every node.
- **FindSession**: A transient UI state representing an active search query, the list of matches, the current match index, and a snapshot of which folders were expanded before the search began.
- **FileOperationError**: A transient UI error state containing the error message and the operation that caused it, displayed outside the tree item scope.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All file tree levels display items in alphabetical order on every page load and after every tree mutation, with zero out-of-order items observable by a user.
- **SC-002**: A user can locate any file in a 50-item, 3-level-deep project tree using the find feature in under 10 seconds.
- **SC-003**: Navigating to a match inside a collapsed folder takes a single "next" action and results in the folder being visibly expanded and the item selected — no extra manual expansion step required.
- **SC-004**: File operation errors are never displayed inside tree item rows; 100% of error messages appear in the designated error area.
- **SC-005**: The project page receives no new visual inconsistency reports from team reviewers after the consistency pass.
- **SC-006**: The find panel can be fully operated by keyboard alone (activate, type, next, previous, dismiss) without requiring mouse interaction.

## Assumptions

- Alphabetical sorting is applied purely on the client side by reordering the `children` arrays before rendering; server response order is not guaranteed.
- Folders and files are sorted together in a single alphabetical list (no "folders first" grouping), unless the team decides otherwise during planning.
- The find feature searches only by file/folder name (not file content), using a simple case-insensitive substring match.
- The find panel is keyboard-accessible with a shortcut to activate it (e.g., Ctrl+F / Cmd+F within the file tree panel scope), but the exact shortcut is defined during implementation.
- The "previous collapse state" restoration on find dismissal means restoring the expand/collapse state of folders that were auto-expanded by find navigation; folders the user had manually expanded before the search remain expanded.
- The error area for file operations is scoped to the file tree panel (not a global toast system), keeping the error contextually close to where the operation occurred.
- The visual consistency pass is a refinement of the existing project page layout; it does not introduce new panels or restructure the three-panel layout from spec 012.
- Non-owner users do not see file management controls; the find feature is available to all project members.
