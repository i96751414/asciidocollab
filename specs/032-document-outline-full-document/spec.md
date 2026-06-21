# Feature Specification: Full-Document Outline Across Includes

**Feature Branch**: `032-document-outline-full-document`

**Created**: 2026-06-21

**Status**: Draft

**Input**: User description: "Outline must show the all headers for the entire document from the main document and considers includes. Add option to only show the ones from the currently open asciidoc file. When no main document exists, show only the currently open asciidoc file"

## Clarifications

### Session 2026-06-21

- Q: For included files not currently open in the editor, what content should the full-document outline reflect? → A: Live collaborative (Hocuspocus/Yjs) state when the file is in an active session; fall back to last-saved stored content otherwise.
- Q: When a collaborator edits headings in an included file the author is not viewing, when must the outline reflect it? → A: Live — in near-real-time as edited, without requiring a save or reopen.
- Q: Acceptable maximum delay between a synced collaborator heading edit in an included file and it appearing in the outline? → A: Within 2 seconds.
- Q: How should the full-document outline present the source file each heading comes from? → A: One seamless heading hierarchy (no per-file dividers), with the currently open file's headings subtly marked for orientation.
- Q: Up to what document scale must the outline's performance targets hold? → A: Up to ~50 included files and ~500 total headings.
- Q: At what granularity should collaborator presence be shown in the outline (mirroring the file tree)? → A: Section/cursor-level — mark the heading each remote collaborator's cursor is currently under, not just file-level.
- Q: In which outline scopes should collaborator presence indicators appear? → A: Both scopes (full-document and current-file-only).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Navigate the whole document from one outline (Priority: P1)

An author is working on a multi-file AsciiDoc book that has a configured main document which pulls in chapters and sections through `include::` directives. While editing any one of those files, the author opens the outline panel and sees the complete heading hierarchy of the *entire* assembled document — every chapter and section title from the main document and all of its included files — not just the headings of the file currently open in the editor. The author can read the full structure at a glance and jump to any section.

**Why this priority**: This is the core of the request. A document split across many include files is unusable for navigation if the outline only ever shows the fragment currently open. Seeing the assembled structure is what turns the outline from a per-file table of contents into a true document map.

**Independent Test**: Configure a project with a main document that includes two or more child files containing headings. Open any file in the editor and confirm the outline lists headings drawn from the main document and all included files, in the correct hierarchical order, as one seamless list with the open file's entries marked.

**Acceptance Scenarios**:

1. **Given** a project with a configured main document that includes child files containing headings, **When** the author opens the outline panel while editing the main document, **Then** the outline shows the headings of the main document followed by the headings of each included file in document order, nested by their effective levels.
2. **Given** the same project, **When** the author opens the outline panel while editing one of the *included* child files, **Then** the outline still shows the complete heading hierarchy of the whole assembled document (not only the open child file).
3. **Given** the full-document outline is displayed, **When** the author selects a heading that belongs to a file other than the one currently open, **Then** the editor opens that file and positions the view at the selected heading.
4. **Given** the full-document outline is displayed, **When** the author selects a heading that belongs to the currently open file, **Then** the editor scrolls to that heading without switching files.

---

### User Story 2 - Narrow the outline to the open file (Priority: P2)

While editing one chapter of a large multi-file document, the author wants to focus only on the structure of the file in front of them. They use an option in the outline panel to switch its scope to "current file only", and the outline collapses to show just the headings authored in the open file. They can switch back to the full-document view at any time.

**Why this priority**: Useful focus aid for authors deep in a single chapter, but the full-document view (Story 1) delivers the primary value on its own. This refines the experience rather than enabling it.

**Independent Test**: With a multi-file document open, toggle the "current file only" option and confirm the outline shows exactly the headings of the open file; toggle it off and confirm the full assembled outline returns.

**Acceptance Scenarios**:

1. **Given** a configured main document and the full-document outline showing, **When** the author activates the "current file only" option, **Then** the outline shows only the headings authored in the currently open file.
2. **Given** the "current file only" option is active, **When** the author switches to a different file, **Then** the outline updates to show only that newly opened file's headings.
3. **Given** the "current file only" option is active, **When** the author deactivates it, **Then** the outline returns to the full-document hierarchy.
4. **Given** the author set the scope option, **When** they reload the editor later, **Then** the previously chosen scope is still in effect.

---

### User Story 3 - Standalone file with no main document (Priority: P2)

An author works in a project where no main document has been configured, or on a file that is not part of any main document's include tree. The outline shows the headings of the currently open file only, behaving as a per-file table of contents.

**Why this priority**: Defines the essential fallback so the feature degrades sensibly. Without it the full-document behavior would be undefined for the common single-file / unconfigured case.

**Independent Test**: Open a file in a project with no main document configured and confirm the outline lists exactly that file's headings; confirm the full-document option is unavailable or has no effect.

**Acceptance Scenarios**:

1. **Given** a project with no main document configured, **When** the author opens the outline panel for any file, **Then** the outline shows only that file's headings.
2. **Given** a project with a configured main document, **When** the author opens a file that is not reachable from the main document through includes, **Then** the outline shows only that open file's headings.

---

### User Story 4 - Outline reflects collaborators' live edits across files (Priority: P1)

Two authors work on the same multi-file document. One author edits chapter headings in a child file through the real-time collaborative session; the other author, viewing a different file, sees those heading changes appear in the full-document outline within a couple of seconds — without anyone saving or reopening the file.

**Why this priority**: The outline is a live navigation map of a collaboratively edited document. A stale outline that only updates on save or reopen would mislead co-authors about the document's current structure, which is the explicit "most recent data" requirement.

**Independent Test**: With two sessions open on a main document and its includes, edit a heading in an included file from session A and confirm the full-document outline in session B reflects the change within 2 seconds, with no save or reopen.

**Acceptance Scenarios**:

1. **Given** a configured main document with included files and the full-document outline showing, **When** a collaborator adds, removes, renames, or re-levels a heading in an included file that is in an active collaborative session, **Then** the outline reflects the change in near-real-time (within 2 seconds of the change syncing) without a save or reopen.
2. **Given** an included file that is not currently in any active collaborative session, **When** the full-document outline is assembled, **Then** its headings are drawn from the last-saved stored content of that file.
3. **Given** an included file whose headings are shown from saved content, **When** that file later enters an active collaborative session and is edited, **Then** the outline begins reflecting the live edits.

---

### User Story 5 - See where collaborators are working in the outline (Priority: P2)

Just as the file tree marks files that other users have open, the outline marks where other collaborators are working within the document. A presence indicator (with avatar/identity) appears on the heading each remote collaborator's cursor is currently under, so an author scanning the outline can see who is in which section and coordinate — across the whole document in full-document scope, and within the open file in current-file-only scope.

**Why this priority**: Extends the established file-tree presence signal onto the document map, turning the outline into a coordination surface. It builds on the core navigation value (Stories 1–4) rather than enabling it, and reuses the existing presence/awareness mechanism.

**Independent Test**: With two accounts editing the same multi-file document, place user B's cursor in a section of one file; confirm user A sees a presence indicator on that section's heading in the outline (in both outline scopes where that section is shown), and that it identifies user B on hover/focus.

**Acceptance Scenarios**:

1. **Given** user A views the full-document outline, **When** user B's cursor is in a section of any included file in an active collaborative session, **Then** user A sees a presence indicator on that section's heading identifying user B (matching how the file tree marks presence).
2. **Given** a presence indicator on a heading, **When** user A hovers or focuses it, **Then** the collaborator(s) at that section are shown by display name and avatar (when available), with sensible overflow (e.g., "+N more") when many.
3. **Given** user B moves their cursor to a different section, **When** the move syncs, **Then** the indicator moves to the new section's heading and clears from the old one in near-real-time.
4. **Given** user B closes the file or disconnects, **When** their presence ends, **Then** the indicator clears from the outline within the liveness window, leaving no stale marker.
5. **Given** the outline is narrowed to the current file, **When** other collaborators have their cursors in that same file, **Then** their presence indicators appear on the corresponding section headings.
6. **Given** user A's own cursor position, **When** the outline shows presence, **Then** the presence indicators reflect *other* users (user A's own position is conveyed by the current-section indication, not a presence marker).

---

### Edge Cases

- **Presence on a section not shown**: If a collaborator's cursor is in content excluded from the outline (e.g., an inactive conditional branch, or a file whose section is filtered out), their presence attaches to the nearest shown enclosing heading or is omitted rather than shown on a non-existent entry.
- **Presence without a live session**: Cursor-level presence is only available for files in an active collaborative session; a file sourced from saved content shows no presence indicators.
- **Many collaborators on one heading**: Multiple collaborators at the same section are deduplicated per user and shown with an overflow indication rather than an unbounded list.
- **Stale vs live source**: An included file in an active collaborative session shows live (possibly unsaved) headings; the same file with no active session shows last-saved headings — the outline must not show stale content for a file that is being actively co-edited.
- **Circular includes**: If included files reference each other in a cycle, outline assembly must terminate and not loop indefinitely; each file's headings appear at most once per resolved include path.
- **Missing / inaccessible include**: If the main document or an included file referenced by the outline cannot be found or read, the outline omits that branch (or marks it) and continues showing the rest without breaking.
- **Level offsets**: Headings from included files must be shown at their effective level after `:leveloffset:` and include `leveloffset=` adjustments, so a chapter included at offset +1 nests correctly under the parent.
- **Conditional content**: Headings inside inactive `ifdef`/`ifndef`/`ifeval` branches are excluded from the outline across all included files, consistent with the current single-file behavior.
- **Attribute references in titles**: Heading titles that contain `{attr}` references resolve using the cross-document attribute scope (attributes inherited from the main document and parents), in both outline scopes.
- **Partial includes**: When an include selects only certain `tags=` or `lines=`, only the headings actually included by that selection appear in the outline.
- **Same file included more than once**: A file included at multiple points appears once per include site, each at the appropriate position and effective level.
- **Open file edited live**: Edits to the currently open file update its headings in the outline immediately, even while the full-document hierarchy from other (unedited) files remains stable.
- **Main document changed**: Changing which file is the main document, or changing the include structure, refreshes the assembled outline.
- **Sandbox boundary**: Includes that point outside the project boundary are not resolved into the outline.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: When a main document is configured for the project, the outline MUST display the complete heading hierarchy of the entire document, assembled by recursively following `include::` directives starting from the main document, regardless of which file is currently open in the editor.
- **FR-002**: The assembled outline MUST present headings using their effective levels, applying level offsets (the `:leveloffset:` attribute and include `leveloffset=` option) so that headings from included files nest correctly beneath their including context.
- **FR-003**: The system MUST provide a user-controllable option in the outline panel to switch the outline scope between (a) the full document (main document plus all includes) and (b) only the currently open file's headings.
- **FR-004**: When the "current file only" scope is active, the outline MUST display only the headings authored in the currently open file.
- **FR-005**: When no main document is configured for the project, the outline MUST display only the currently open file's headings, and the full-document scope MUST be unavailable or have no effect.
- **FR-006**: When a main document is configured but the currently open file is not reachable from it through includes (directly or transitively), the outline MUST fall back to showing only the currently open file's headings.
- **FR-007**: In full-document scope, selecting an outline entry that originates from a file other than the one currently open MUST open that source file and position the editor at the corresponding heading.
- **FR-008**: In full-document scope, selecting an outline entry that originates from the currently open file MUST position the editor at that heading without switching files.
- **FR-009**: The outline MUST exclude headings inside inactive conditional (`ifdef`/`ifndef`/`ifeval`) branches and MUST exclude `[discrete]`/`[float]` headings, applying this consistently across all files contributing to the full-document outline.
- **FR-010**: The outline MUST resolve attribute references (`{attr}`) in heading titles using the resolved cross-document attribute scope, in both the full-document and current-file scopes.
- **FR-011**: The outline MUST indicate the section corresponding to the editor cursor's current position within the currently open file, in both scopes.
- **FR-012**: The chosen outline scope option MUST persist across editor sessions so the author does not have to reselect it each time.
- **FR-013**: The outline MUST update reactively when the open file's text changes, when the main-document setting changes, when the include structure changes, or when relevant attributes change.
- **FR-013a**: For included files that are not currently open in the editor, the full-document outline MUST source headings from the file's live collaborative (real-time / Hocuspocus) document state when that file is in an active collaborative session, and MUST fall back to the file's last-saved stored content when it is not.
- **FR-013b**: When a heading-affecting change is made to an included file in an active collaborative session (by any collaborator), the full-document outline MUST reflect that change in near-real-time, without requiring the file to be saved or reopened.
- **FR-013c**: An included file whose headings are sourced from saved content MUST switch to live-sourced headings once it enters an active collaborative session, and continue reflecting subsequent live edits.
- **FR-014**: When the main document or an included file referenced by the outline cannot be resolved (missing or inaccessible), the outline MUST handle it gracefully — omitting or marking the unresolved branch — without breaking the rest of the outline.
- **FR-015**: Include resolution for the outline MUST respect the same project sandbox boundaries as preview assembly, so references outside the project are not resolved into the outline.
- **FR-016**: Recursive include resolution for the outline MUST be cycle-safe, terminating even when included files reference one another in a loop.
- **FR-017**: The full-document outline MUST present headings as a single seamless hierarchy that mirrors the assembled document order, without per-file dividers or labels grouping entries by source file.
- **FR-018**: The full-document outline MUST visually mark the entries that originate from the currently open file, so the author can orient themselves within the whole document.
- **FR-019**: The outline MUST display collaborator presence indicators consistent with how the file tree marks open files, showing presence at the section/cursor level: an indicator on the heading under which each remote collaborator's cursor is currently positioned.
- **FR-020**: Presence indicators MUST reflect *other* users only; the current user's own position is conveyed through the current-section indication (FR-011), not a presence marker.
- **FR-021**: On hover or focus of a presence indicator, the outline MUST reveal the collaborator(s) at that section by display name and avatar (when available), deduplicated per user, with a sensible overflow indication (e.g., "+N more") when many.
- **FR-022**: Presence indicators MUST appear in both outline scopes: full-document (collaborators across all included files in active sessions) and current-file-only (collaborators in the open file).
- **FR-023**: Presence indicators MUST update in near-real-time as collaborators move their cursors, join, or leave, and MUST clear within the presence liveness window on close or abnormal disconnect, leaving no stale markers — consistent with the file-tree presence behavior.
- **FR-024**: A remote collaborator's cursor MUST be attributed to the section of the nearest enclosing heading shown in the outline; if no such heading is shown (e.g., cursor in excluded content), the presence is attributed to the nearest shown enclosing heading or omitted, never to a non-existent entry.

### Key Entities *(include if feature involves data)*

- **Outline entry**: A single navigable heading in the outline. Attributes: display title (with attributes resolved), effective heading level, source file, and location within that file.
- **Outline scope option**: The author's choice of how much the outline shows — full document (main document + includes) or current file only. Persisted per author.
- **Main document setting**: The project-level designation of which file is the root of the include tree; determines whether a full-document outline is possible and what it contains.
- **Include tree**: The graph of files reachable from the main document through `include::` directives, including per-site level offsets, partial-include selections, and conditional gating, traversed to assemble the full outline. Each file's content is drawn from its live collaborative session when active, otherwise from its last-saved stored content.
- **Collaborator presence**: A live signal, per other user with an active session, of the section (heading) their cursor is currently under. Carries the user's identity (display name, avatar when available) and is deduplicated per user. Used to render presence indicators on outline entries.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With a main document that includes child files, the outline shows headings from the main document and every reachable included file, in correct hierarchical order, no matter which of those files is open in the editor.
- **SC-002**: An author can reach any section of a multi-file document by selecting a single outline entry, without first manually opening the file that contains it.
- **SC-003**: Switching the outline scope option (full document ↔ current file only) updates the displayed outline within 1 second for a document at the supported scale (up to ~50 included files and ~500 total headings).
- **SC-004**: In a project with no main document configured, the outline shows exactly the open file's headings, matching the prior single-file behavior with no regression.
- **SC-005**: Selecting an outline entry lands the editor on the correct heading in its correct source file in 100% of attempts during testing.
- **SC-006**: The outline never enters an infinite loop or fails to render when the include structure contains cycles or unresolved/missing includes.
- **SC-007**: A heading edit made in an included file during an active collaborative session appears in another author's full-document outline within 2 seconds of the change syncing, with no save or reopen required.
- **SC-008**: An included file with no active collaborative session contributes headings that match its last-saved content (no stale or partially-applied state shown).
- **SC-009**: The full-document outline renders and assembles without perceptible lag for documents at the supported scale (up to ~50 included files and ~500 total headings).
- **SC-010**: When a collaborator's cursor is in a section shown in the outline, another author sees a presence indicator on that section's heading identifying the collaborator on hover, in both outline scopes.
- **SC-011**: A presence indicator moves to the collaborator's new section and clears from the old one within a few seconds of their cursor moving, and clears entirely within the liveness window when they leave or disconnect — with no stale markers and reflecting only other users.

## Assumptions

- The full-document scope is the default behavior whenever a main document is configured and the open file is part of its include tree; the "current file only" option is an opt-in narrowing, matching the user's phrasing that the outline "must show all headers for the entire document" with an added option to narrow it.
- When a main document is configured but the open file is not reachable from it, the sensible fallback is to show the open file's own headings (treated as standalone), rather than showing an empty outline or an unrelated document's outline (FR-006).
- The outline scope option is remembered as a per-author preference (consistent with existing editor preferences such as the preview style and show-includes settings), not a per-file or per-project shared setting.
- "Main document" refers to the existing project-level main-file setting already used for cross-document attribute resolution and preview assembly; this feature reuses that concept rather than introducing a new one.
- Include resolution for the outline reuses the project's existing include-assembly and cross-document-scope mechanisms (path resolution, sandboxing, level offsets, conditional gating, partial includes) so outline structure stays consistent with how the preview assembles the same document.
- The current-file scope preserves the existing single-file outline behavior, including effective-level handling from inherited offsets.
- The supported document scale for performance targets is up to ~50 included files and ~500 total headings; larger documents should still function correctly but are not held to the stated latency targets.
- Outline presence indicators reuse the existing file-tree presence/awareness behaviors (other-users-only, display name + avatar, per-user dedup, overflow for many, near-real-time join/leave, liveness window for disconnects); this feature maps that signal to section/cursor granularity rather than redefining presence semantics.

## Dependencies

- Existing project main-document (main-file) configuration.
- Existing include-resolution / document-assembly capability used by the preview.
- Existing cross-document attribute resolution (resolved scope per file).
- Existing outline panel and heading-extraction capability (single-file outline) that this feature extends.
- Existing real-time collaboration (Hocuspocus/Yjs) system, used as the live content source for included files in active sessions (FR-013a–FR-013c).
- Existing file-tree open-file presence capability and its underlying collaborative awareness (identity, avatars, liveness window, per-user dedup), reused to render outline presence indicators (FR-019–FR-024).
