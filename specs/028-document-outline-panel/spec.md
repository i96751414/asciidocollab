# Feature Specification: Document Outline View in Editor Left Panel

**Feature Branch**: `028-document-outline-panel`

**Created**: 2026-06-19

**Status**: Draft

**Input**: User description: "Give writers a document Outline alongside the file tree in the editor's left panel, with a view switcher so only one is shown at a time."

## Clarifications

### Session 2026-06-19

- Q: How is the view switcher presented? → A: A slim vertical activity rail (VS Code style, icon-only, one icon per view) on the panel's far-left edge; the active icon gets a primary tint + a left accent bar. The selected pane keeps the panel's full width, with a small uppercase section title ("FILES"/"OUTLINE") above the content.
- Q: How is the active-view choice persisted? → A: In browser local storage, scoped per user on the current browser — remembered across reloads (not across devices), consistent with existing editor preferences. Default: Files.
- Q: Which heading levels appear in the Outline? → A: The document title (level 0) and section levels 1–5, matching what the preview renders; nested visually by level (title flush, deeper levels indented).
- Q: How is the current section detected? → A: From the editor's current cursor line (fallback: the topmost visible line) mapped to the nearest preceding heading, reusing the existing line↔preview scroll-sync mapping (no second mapping is introduced).
- Q: What does clicking an Outline heading do? → A: Scrolls the editor to that heading's source line and places the cursor there; the existing scroll-sync moves the preview (no separate preview-only jump).
- Q: Where do file actions live, and what does the Outline header show? → A: The "+" new-file button and the file-tree options "⋯" menu render in the content-column header and only while Files is active; while Outline is active that header shows the "OUTLINE" title plus an optional Collapse-all/Expand-all toggle (optional — may be omitted in the first pass).
- Q: Are view counts shown on the rail icons? → A: No — icons only; each view is named via a tooltip on hover/focus. A count badge is a possible future addition (out of scope).
- Q: What do the empty states say? → A: No document open → "Open a document to see its outline."; document with zero headings → "No headings yet — add a section title (=, ==, …)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Navigate a document by its outline (Priority: P1)

A writer working in a long AsciiDoc document switches the left panel from **Files** to **Outline**, sees the document's section headings nested by level in document order, and clicks one to jump the editor straight to that section.

**Why this priority**: This is the core value of the feature — fast in-document navigation that the file-tree-only panel cannot provide. With just this slice the panel becomes useful for writers of long documents; everything else refines it.

**Independent Test**: Open a document with several nested headings, switch the panel to Outline, confirm every heading appears indented by level in order, click a deep heading, and confirm the editor moves to that section (and the preview follows via existing scroll-sync). Fully demonstrable on its own.

**Acceptance Scenarios**:

1. **Given** a document with multiple heading levels is open and the panel shows Files, **When** the writer activates the Outline view from the switcher, **Then** the panel content swaps in place to a list of all headings, visually nested by level, in document order, and a label indicates the Outline view is active.
2. **Given** the Outline view is active, **When** the writer clicks a heading, **Then** the editor moves to that section and the live preview stays in sync via the existing mechanism.
3. **Given** the editor first loads, **When** no view choice has been made, **Then** the Files view is shown by default with no change to existing file-tree behavior.

---

### User Story 2 - See which section I'm in (Priority: P2)

While editing, the writer sees the heading of the section containing their current cursor/scroll position marked as current in the Outline, so they always know where they are in the document's structure.

**Why this priority**: Strong orientation aid that builds directly on US1, but the outline is already valuable for jumping without it. Independent of persistence and empty-state work.

**Independent Test**: With the Outline active, move the cursor into different sections and confirm the corresponding heading becomes the marked "current" one each time, with only one heading current at a time.

**Acceptance Scenarios**:

1. **Given** the Outline view is active, **When** the cursor or scroll position is within a section, **Then** that section's heading is visually marked as current.
2. **Given** the cursor moves from one section to another, **When** the new section is entered, **Then** the previously current heading is no longer marked and the new one is.

---

### User Story 3 - My view choice is remembered (Priority: P2)

The writer's choice of active view (Files or Outline) persists across page reloads and is scoped to them, so returning to the editor restores the view they last used.

**Why this priority**: A quality-of-life expectation that reduces repeated switching, but the feature works within a session without it.

**Independent Test**: Switch to Outline, reload the page, and confirm the Outline view is still active; verify a different user on the same browser is unaffected.

**Acceptance Scenarios**:

1. **Given** the writer has selected the Outline view, **When** they reload the editor, **Then** the Outline view is active again.
2. **Given** two different users share a browser, **When** each sets a different active view, **Then** each user's choice is preserved independently.

---

### User Story 4 - Graceful empty states (Priority: P3)

When there is no document open, or the open document has no headings, the Outline shows a short, friendly message instead of a blank panel.

**Why this priority**: Polish that prevents a confusing empty panel; the navigation value is delivered by earlier stories.

**Independent Test**: Activate the Outline with no document open, then with a heading-less document, and confirm a clear short message appears in each case rather than blank space.

**Acceptance Scenarios**:

1. **Given** no document is open, **When** the Outline view is active, **Then** a short message explains there is nothing to outline yet.
2. **Given** an open document has no headings, **When** the Outline view is active, **Then** a short message explains the document has no headings.

---

### User Story 5 - File actions stay with the Files view (Priority: P3)

File-management controls (creating a new file, the file-tree options menu) appear only while the Files view is active and are hidden while the Outline view is active, so the controls always match the visible content.

**Why this priority**: Keeps the two views coherent and uncluttered; refinement on top of the switching mechanism.

**Independent Test**: With Files active, confirm the new-file and file-tree options controls are present; switch to Outline and confirm they are gone; switch back and confirm they return.

**Acceptance Scenarios**:

1. **Given** the Files view is active, **When** the writer looks at the panel, **Then** the new-file control and the file-tree options menu are available.
2. **Given** the Outline view is active, **When** the writer looks at the panel, **Then** the file-management controls are not shown.

---

### Edge Cases

- **Switching documents while in Outline**: when the open document changes, the Outline updates to the new document's headings (or its empty state) without the writer leaving the Outline view.
- **Live edits to headings**: as the writer adds, removes, renames, or re-levels headings, the Outline reflects the change without a manual refresh.
- **Duplicate or repeated heading text**: multiple headings with identical text are each listed and individually navigable to their own location.
- **Deeply nested or very long documents**: a large number of headings remains scannable within the panel (the panel scrolls; nesting stays legible).
- **Jumping to a heading currently off-screen**: clicking it brings that section into view in the editor.
- **Non-AsciiDoc or binary file open**: treated as "no outline available" via the empty state, consistent with no document open.
- **Stored view preference is missing or unreadable**: the panel falls back to the default Files view without error.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The left panel MUST offer exactly two views — Files and Outline — selectable from a slim vertical activity rail (icon-only, one icon per view) on the panel's far-left edge. The active view's icon MUST be visually distinguished (primary tint + a left accent bar). The selected pane MUST keep the panel's full content width, with a small uppercase section title ("FILES"/"OUTLINE") above the content identifying the active view. Each rail icon MUST expose its view name via a tooltip on hover/focus.
- **FR-002**: The system MUST show exactly one view in the panel at a time; activating the other view MUST swap the panel content in place.
- **FR-003**: Switching views MUST be instant and MUST NOT reload, reflow, or otherwise disrupt the editor or the live preview, and MUST NOT alter the document or any other user's view.
- **FR-004**: The Files view MUST preserve the existing project file tree and its behavior unchanged.
- **FR-005**: On first use, with no stored preference, the system MUST default to the Files view.
- **FR-006**: The Outline view MUST list the open document's headings — the document title (level 0) and section levels 1–5, matching what the preview renders — visually nested by level (the title flush, deeper levels progressively indented), in document order.
- **FR-007**: The Outline MUST update to reflect live changes to the document's headings (added, removed, renamed, re-leveled) without a manual refresh.
- **FR-008**: The Outline MUST mark exactly one heading as the current section, derived from the editor's current cursor line (or, when unavailable, the topmost visible line) mapped to the nearest preceding heading, reusing the existing line↔preview scroll-sync mapping rather than introducing a second one.
- **FR-009**: Selecting a heading in the Outline MUST scroll the editor to that heading's source line and place the cursor there; the live preview MUST follow through the existing scroll-sync mechanism (no separate preview-only jump).
- **FR-010**: The system MUST persist the active view choice in browser local storage, scoped per user on the current browser, so it is remembered across reloads (not across devices), consistent with how existing editor preferences are scoped.
- **FR-011**: The "+" new-file button and the file-tree options "⋯" menu MUST render in the content-column header and MUST be shown only while the Files view is active. While the Outline view is active, that header MUST instead show the "OUTLINE" title; it MAY include a single Collapse-all/Expand-all toggle for nested headings (optional — may be omitted in the first pass).
- **FR-012**: The Outline MUST show the empty state "Open a document to see its outline." when no document is open, and the distinct empty state "No headings yet — add a section title (=, ==, …)." when the open document has zero headings.
- **FR-013**: Both views and the switcher MUST be usable and legible in light and dark mode.
- **FR-014**: The feature MUST NOT change existing content sanitization or scroll-sync behavior.
- **FR-015**: The view switcher MUST be structured to accommodate adding a third view (e.g., search or history) later without redesign.

### Key Entities *(include if feature involves data)*

- **Active Panel View**: the writer's currently selected left-panel view (Files or Outline). Persisted per user in browser local storage (remembered across reloads on the current browser, not across devices); defaults to Files. The only new persisted state the feature introduces.
- **Outline Heading**: a derived representation of one document heading — its display text, its level (for nesting), its position in document order, and the editor location it navigates to. Derived live from the open document; not stored.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From any point in an open document with headings, a writer can reach a target section in 2 actions or fewer (activate Outline if needed, then click the heading).
- **SC-002**: Switching between Files and Outline swaps the panel content within a single render frame, with zero reload or reflow of the editor or preview (the editor/preview component instances are not remounted).
- **SC-003**: The Outline lists 100% of the open document's headings, in correct document order and correct relative nesting.
- **SC-004**: At all times while editing, at most one heading is marked current, and it matches the section containing the cursor.
- **SC-005**: After choosing a view, the same view is active for that user on a later reload of the same browser in at least 99% of returns.
- **SC-006**: 100% of "no document open" and "no headings" situations show a message rather than a blank panel.
- **SC-007**: While the Outline view is active, no file-management controls are visible.

## Assumptions

- **Heading source**: "Headings" means the open document's AsciiDoc section titles; the document's structure already drives the existing preview scroll-sync, and the Outline reflects the same structure.
- **Current-section tracking**: the current section is resolved from the editor's cursor line with a topmost-visible-line fallback (FR-008), reusing the existing line↔preview scroll-sync mapping rather than a new signal.
- **Persistence scope**: the active-view preference is stored per user in browser local storage on the current browser (FR-010) — not synced across devices — consistent with how existing editor preferences are scoped (no server-side persistence).
- **Switcher visuals**: the activity-rail treatment, active-icon tint, and left accent bar are defined in FR-001; finer visual polish is left to design.
- **Single-document scope**: the Outline always reflects the one currently open document; a project-wide/multi-file outline is explicitly out of scope.
- **Navigation reuse**: jumping to a heading reuses the editor's existing in-document navigation and the existing preview scroll-sync rather than introducing a new sync mechanism.

### Out of Scope

- Showing Files and Outline at the same time (split or resizable panels).
- A project-wide or multi-file outline.
- Reordering, editing, or re-leveling headings from the Outline.
- Drag-and-drop in the Outline.
- Per-view count badges on the switcher icons.
- (The switcher is, however, expected to accommodate a future third view such as search or history.)
