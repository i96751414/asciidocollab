# Feature Specification: Review Comments and Tasks

**Feature Branch**: `038-review-comments-tasks`

**Created**: 2026-07-10

**Status**: Draft

**Input**: User description: "Review comments and tasks for AsciiDoc documents in the collaborative editor — reviewers and authors attach threaded comments and actionable tasks to specific places in a document while collaborating in real time."

## Clarifications

### Session 2026-07-10

- Q: Deleting a single comment/task — who can, and is it recoverable? → A: Any EDITOR/OWNER can delete any comment/task; deletion is permanent (no trash) and recorded in the audit log. Deleting a root comment deletes its thread.
- Q: "Delete all at once" — what scope and who can trigger it? → A: Both scopes — an EDITOR/OWNER can clear all comments/tasks for one document; a project OWNER can additionally clear them across the whole project. Both require explicit confirmation and are audit-logged.
- Q: When a user is deleted, what happens to their comments and assigned tasks? → A: Keep the items; show authorship as "Deleted user"; unassign any tasks that were assigned to them.
- Q: "Emojis in comments" — emoji in text or reactions? → A: Both — comment/reply bodies support emoji characters, AND collaborators can react to a comment with emoji. (Emoji reactions are now IN scope for v1.)
- Q: Panel visibility → A: The comments/tasks panel can be shown or hidden without losing data or highlight state.
- Q: Navigation → A: Users can step next/previous through a document's review items, defaulting to open items, with an option to include resolved ones.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Comment on a passage and resolve the discussion (Priority: P1)

While reviewing a document, a collaborator selects a span of text (a sentence, a code block, a heading) and leaves a comment about it. Other collaborators see the comment anchored to that exact passage, reply in a thread, and mark the discussion resolved once addressed.

**Why this priority**: This is the core review loop and the minimum viable product. Without anchored, threaded, resolvable comments there is no review feature; everything else builds on it.

**Independent Test**: With two collaborators in the same document, one selects text and posts a comment; the other sees the highlighted passage and the comment, replies, and resolves it. Delivers value on its own — teams can conduct a document review end to end.

**Acceptance Scenarios**:

1. **Given** an editor viewing a document, **When** they select a passage and submit a comment, **Then** the passage is highlighted and the comment appears in the document's comment panel attributed to them with a timestamp.
2. **Given** a comment exists on a passage, **When** another collaborator opens the document, **Then** they see the same highlight and comment thread anchored to the same passage.
3. **Given** an open comment thread, **When** a collaborator adds a reply, **Then** the reply appears in the thread for all collaborators in order.
4. **Given** an open comment, **When** a collaborator resolves it, **Then** it is removed from the default view and its highlight is cleared, and it remains retrievable via a "resolved" filter.
5. **Given** a comment highlight in the editor, **When** a collaborator clicks it, **Then** the corresponding thread opens in the panel (and vice versa).
6. **Given** the comment composer, **When** a collaborator inserts emoji into the body, **Then** the emoji render in the posted comment for all collaborators.
7. **Given** a comment, **When** a collaborator adds an emoji reaction, **Then** the reaction and its per-emoji count are shown to everyone and the collaborator can toggle their own reaction off.
8. **Given** a document with several review items, **When** a collaborator uses next/previous navigation, **Then** the editor steps through the open items in document order (with an option to include resolved), selecting each item's passage.
9. **Given** the editor, **When** a collaborator hides the comments/tasks panel, **Then** the panel is dismissed without affecting stored items or their highlights, and can be shown again.

---

### User Story 2 - Track review work as assignable tasks (Priority: P2)

A reviewer needs some comments to be acted on, not just discussed. They mark a comment as a task, give it a status, assign it to a teammate, and optionally set a due date. Anyone on the project can open a single panel that lists all open tasks across every document — filtered to "assigned to me" or by document or status — so review work does not get lost.

**Why this priority**: Turns passive discussion into tracked, accountable work and is the key differentiator over plain comments. Builds directly on US1 (a task is a comment with a lifecycle), so it is valuable but not required for the first usable slice.

**Independent Test**: A reviewer converts a comment into a task, assigns it to a teammate, and sets it in-progress; the assignee opens the project task panel, filters to "assigned to me", sees the task, and marks it resolved. Delivers standalone value — a review coordinator can drive a document to done.

**Acceptance Scenarios**:

1. **Given** an existing comment, **When** a collaborator converts it to a task, **Then** it gains a status (default "open"), can carry an assignee and a due date, and still keeps its thread and anchor.
2. **Given** a task, **When** a collaborator assigns it to a project member and sets its status, **Then** the assignee and status are visible to everyone and update in place.
3. **Given** tasks across several documents, **When** a collaborator opens the project task panel and filters to "assigned to me", **Then** they see only their open tasks with document, passage context, status, and due date.
4. **Given** a task, **When** it is resolved, **Then** it records who resolved it and when, and drops out of the open-task list.
5. **Given** the project task panel, **When** a collaborator filters by document or by status, **Then** the list narrows accordingly.

---

### User Story 3 - Comments stay attached while the document changes (Priority: P2)

Because people edit the document concurrently, a comment must keep pointing at the right passage as text is inserted and deleted around it. When the exact commented text is edited away, the comment gracefully falls back to the section it lived in rather than pointing at the wrong place; if even that is gone, it is preserved as "detached" rather than silently lost.

**Why this priority**: Anchor correctness is what makes comments trustworthy in a live collaborative editor; a review tool that mis-points comments is worse than none. It is P2 rather than P1 only because the first usable slice can ship while edits are light, but it must land before general use.

**Independent Test**: Place a comment on a passage; have another collaborator insert and delete large amounts of text above and around it; confirm the highlight still covers the intended passage. Then delete the commented text and confirm the comment degrades to its section, and finally to the detached tray.

**Acceptance Scenarios**:

1. **Given** a comment anchored to a passage, **When** collaborators insert or delete text elsewhere in the document, **Then** the highlight continues to cover the original passage without manual adjustment.
2. **Given** a comment whose exact passage has been edited away, **When** the document is re-opened, **Then** the comment re-attaches to the best-matching text if it still exists.
3. **Given** a comment whose passage no longer exists but whose section remains, **When** the document is viewed, **Then** the comment is shown as attached to that section.
4. **Given** a comment whose anchor cannot be located at all, **When** the document is viewed, **Then** the comment appears in a "detached comments" area for the document rather than being deleted, and can be reattached or resolved.

---

### User Story 4 - Only editors can comment; viewers can read (Priority: P3)

Reviewers with edit rights create and manage comments and tasks. People with view-only access to a project can read existing comments and tasks but cannot add, reply, resolve, or assign.

**Why this priority**: Enforces the intended collaboration model and prevents accidental writes, but the feature is demonstrable for editors before the read-only path is polished.

**Independent Test**: A view-only member opens a document with comments, sees them, and finds no controls to add or change them; an editor in the same document has full controls.

**Acceptance Scenarios**:

1. **Given** a member with editor or owner role, **When** they open a document, **Then** they can create, reply to, resolve, assign, and convert comments and tasks.
2. **Given** a member with viewer role, **When** they open a document, **Then** they can see comments and tasks but have no controls to create or modify them, and any attempt to do so is refused.

---

### User Story 5 - Manage and clean up review items (Priority: P2)

Editors remove individual comments or tasks that are no longer relevant, and can clear an entire document's review items in one confirmed action; a project owner can additionally clear all review items across the whole project. Destructive actions are confirmed and recorded.

**Why this priority**: Long-lived documents accumulate stale review items; without deletion and bulk cleanup the panels become noise. It depends on US1/US2 existing, so it is valuable but follows them.

**Independent Test**: An editor deletes a single obsolete comment and confirms it is gone for everyone; then clears all review items for a document; an owner clears all items across the project. Each action is reflected for all collaborators and appears in the audit trail.

**Acceptance Scenarios**:

1. **Given** a comment or task, **When** an editor deletes it, **Then** it is permanently removed for all collaborators (a root comment removes its whole thread), its highlight is cleared, and the deletion is recorded in the audit trail.
2. **Given** a document with many review items, **When** an editor chooses "delete all for this document" and confirms, **Then** all of that document's comments and tasks are removed.
3. **Given** a project, **When** an owner chooses "delete all across the project" and confirms, **Then** every document's review items are removed; an editor does not see this project-wide option.
4. **Given** a viewer, **When** they view review items, **Then** no delete or bulk-delete controls are available to them.

---

### Edge Cases

- A collaborator posts a comment at the same instant another edits the same passage — the comment anchors to the passage as it stood when submitted and follows the concurrent edit.
- Two collaborators resolve the same thread nearly simultaneously — the thread ends resolved once, without error or duplicate state.
- A comment is left on text inside an included/child file region — the comment anchors within the document being edited; behavior for content owned by other files is bounded to the current document in v1.
- The commented passage spans a very large selection or an empty selection — a minimum/maximum anchor is enforced so the highlight is meaningful.
- A task's assignee is removed from the project — the task remains but surfaces as unassigned.
- The document is exported or downloaded — the exported source contains no trace of comments or tasks.
- A resolved comment's passage is later edited — resolved items do not re-open or re-anchor noisily.
- A very large number of comments on one document — the panel remains usable and the editor highlights do not degrade responsiveness.
- An editor deletes a root comment that has replies — the entire thread is removed, not just the root.
- Two collaborators trigger "delete all" for the same document concurrently — the items are removed once, without error.
- A user account is deleted while they have open comments and assigned tasks — the items remain (authored by "Deleted user") and their assigned tasks become unassigned rather than disappearing.
- The same collaborator reacts with the same emoji twice — the reaction toggles rather than double-counting.
- Navigation is requested when there are no open items — navigation reports nothing to step through (or offers to include resolved) rather than failing.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Editors MUST be able to attach a comment to a selected passage of a document; the passage MUST be visually highlighted in the editor.
- **FR-002**: The system MUST show every comment anchored to the same passage for all collaborators viewing the document, attributed to its author with a creation time.
- **FR-003**: Editors MUST be able to reply within a comment thread; replies MUST appear in order for all collaborators.
- **FR-004**: Editors MUST be able to resolve a comment thread; resolved threads MUST be hidden from the default view, their highlight cleared, and remain retrievable via a filter.
- **FR-005**: Clicking a comment/task indicator — a highlight or gutter marker in the editor, or a marker beside a rendered block in the preview — MUST open its thread; if the comments/tasks panel is currently hidden, doing so MUST first restore the panel. Selecting a thread MUST conversely reveal and select its passage in the editor.
- **FR-006**: Editors MUST be able to designate a comment as a task, giving it a status of open, in-progress, resolved, or won't-fix.
- **FR-007**: Editors MUST be able to assign a task to a project member and optionally set a due date; both MUST be visible to all collaborators and updatable.
- **FR-008**: The system MUST provide a project-wide panel listing open comments and tasks across all documents, filterable by document, by status, and by "assigned to me".
- **FR-009**: The system MUST provide an in-document panel listing the current document's comments and tasks with their passage context.
- **FR-010**: Converting a comment to a task (and back) MUST preserve its thread, author, and anchor.
- **FR-011**: When a task is resolved, the system MUST record who resolved it and when.
- **FR-012**: A comment's highlight MUST continue to cover its original passage as collaborators insert or delete text elsewhere in the document, without manual repositioning.
- **FR-013**: When a comment's exact passage has been edited away, the system MUST attempt to re-attach it to the best-matching remaining text.
- **FR-014**: When the passage no longer exists but its containing section does, the system MUST attach the comment to that section and indicate it is section-level.
- **FR-015**: When a comment's anchor cannot be located, the system MUST preserve it in a per-document "detached comments" area rather than deleting it, and allow it to be reattached or resolved.
- **FR-016**: Only members with editor or owner role MUST be able to create, reply to, resolve, assign, or convert comments and tasks; viewers MUST be able to read them only.
- **FR-017**: The document's source content MUST remain free of any comment or task markup; exporting or downloading the document MUST yield source with no trace of comments.
- **FR-018**: New comments, replies, resolutions, and task changes MUST become visible to other collaborators already viewing the document in near-real-time, without a manual refresh.
- **FR-019**: The system MUST record comment and task lifecycle actions (create, resolve, assign) in the project's audit trail.
- **FR-020**: Comments and tasks MUST persist across sessions and remain associated with their document even when no one is actively editing it.
- **FR-021**: Editors MUST be able to permanently delete an individual comment or task (any editor or owner, not only the author); deleting a root comment MUST delete its entire thread, and the deletion MUST be recorded in the audit trail. Deletion is not recoverable (no trash in v1).
- **FR-022**: An editor MUST be able to delete all comments and tasks for a single document, and a project owner MUST additionally be able to delete all comments and tasks across the entire project; both bulk actions MUST require explicit confirmation and be recorded in the audit trail. The project-wide option MUST NOT be offered to non-owners.
- **FR-023**: Users MUST be able to show or hide the comments/tasks panel; hiding it MUST NOT alter stored items or their anchoring, and the panel MUST be restorable.
- **FR-024**: When a user account is deleted, the system MUST retain that user's comments and tasks with authorship displayed as "Deleted user", and MUST unassign any tasks that were assigned to them (leaving them as unassigned open work).
- **FR-025**: Users MUST be able to navigate sequentially (next/previous) through a document's review items, defaulting to open items in document order, with an option to include resolved items; each step MUST reveal and select the item's passage.
- **FR-026**: Comment and reply bodies MUST support emoji characters, including a way to insert them from a picker.
- **FR-027**: Collaborators MUST be able to add and remove emoji reactions on a comment; reactions MUST be aggregated per emoji, show who reacted, and be visible to all collaborators in near-real-time.
- **FR-028**: While a reviewer hovers a review item in a panel or list, or has that item's composer/edit field focused, the system MUST emphasize the item's anchored passage in the editor (a stronger highlight than the resting state); the emphasis MUST clear when the hover ends or the field loses focus. This is a transient view cue only and MUST NOT modify stored items or anchors, and MUST NOT scroll the editor on its own (distinguishing it from the click-to-navigate behavior of FR-005).

### Key Entities *(include if feature involves data)*

- **Review Item**: A single comment or task attached to a document. Has a kind (comment or task), a body, an author, a creation time, an optional parent (for threaded replies), a resolution record (who/when), and — when it is a task — a status, an optional assignee, and an optional due date. The unified entity lets a comment become a task without losing its thread.
- **Anchor**: The location a review item points to within a document: a primary passage range that follows live edits, a durability fallback description of the surrounding text, and a structural fallback to a containing section. May be in one of the states: located, section-level, or detached.
- **Thread**: The ordered set of a root review item and its replies. Deleting the root removes the whole thread.
- **Reaction**: An emoji reaction placed by a member on a review item. Aggregated per emoji with the set of reactors; a member's own reaction toggles on/off.
- **Project Member Role**: The existing per-project role (owner, editor, viewer) that governs who may create, manage, and delete review items versus only read them. A deleted user's authored items are retained under a "Deleted user" identity.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A collaborator can select a passage and post a comment in under 15 seconds, and it appears for other collaborators already in the document within 2 seconds.
- **SC-002**: After a collaborator makes 100 unrelated insertions and deletions elsewhere in a document, at least 99% of existing comment highlights still cover their original passage.
- **SC-003**: A reviewer can locate all of their open tasks across an entire project from a single panel in under 10 seconds, without opening individual documents.
- **SC-004**: No comment is ever lost: 100% of comments whose passage is edited away end up either re-attached, shown at section level, or preserved in the detached area.
- **SC-005**: Exported or downloaded document source contains zero comment or task artifacts in 100% of cases.
- **SC-006**: View-only members can read comments and tasks but succeed in zero attempts to create or modify them.
- **SC-007**: A document carrying at least 200 comments remains usable — the comment panel and editor highlights respond to interaction within 1 second.
- **SC-008**: Deleting a single item or clearing a document's items reflects to other collaborators within 2 seconds, and a project-wide clear leaves zero review items behind across the project.
- **SC-009**: After a user account is deleted, 100% of their comments and tasks remain viewable (attributed to "Deleted user") and none of their previously assigned tasks reference a missing user.
- **SC-010**: A reviewer can jump from one open item to the next and see its passage selected in under 1 second per step.

## Assumptions

- The feature reuses the existing real-time collaborative editing session, project membership/roles, user identity, and audit trail; no new account or permission concepts are introduced.
- Comments and tasks are stored as durable review records kept separately from the document's source content and from the live collaboration document, so the source stays clean and the records remain queryable across documents.
- v1 anchors comments within the document currently being edited; comments on content owned by other included files are bounded to the editing document and cross-file ownership is not specially handled.
- A task has at most one assignee in v1.
- A comment/reply body is non-empty and bounded to a maximum length (**4000 characters** in v1), enforced at the API boundary against a single named constant (no magic number); emoji count toward the limit as their character length.
- Resolved items are hidden by default but retained and retrievable. Deletion is separate from resolution: deleting is a permanent, audited removal with no trash/undo in v1.
- Deleting a user account retains their review items (shown as "Deleted user") and unassigns their tasks; it does not cascade-delete review content.
- Emoji are supported both as characters within comment/reply bodies and as reactions on comments (reactions are in scope for v1).
- Out of scope for v1: suggestion/track-changes mode, comment notifications or email, and cross-document full-text search of comment bodies.
- The primary surface is the existing web editor; a dedicated mobile experience is out of scope for v1.
