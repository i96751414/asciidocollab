# Feature Specification: In-Editor Symbol Rename Refactor Suggestion

**Feature Branch**: `033-symbol-rename-refactor`

**Created**: 2026-07-04

**Status**: Draft

**Input**: User description: "When changing a symbol name (id / anchor / attribute) in the editor, suggest a refactor of all the documents to that new symbol name. The suggestion must be in the editor itself and must only appear after the user has stopped changing the symbol name after 2 sec, if user keeps changing the name the suggestion must auto update. If the user leaves the location of the symbol the suggestion must disappear after 5 sec unless the user goes back to the symbol location where the name was changed. Also suggest improvements to this approach before finalizing the specification."

## Clarifications

### Session 2026-07-04

- Q: Which symbols should trigger the rename suggestion? → A: Explicit anchors (`[[id]]`, `[#id]`, `anchor:id[]`) **and** attribute definitions (`:name:`) **and** section-heading auto-generated IDs.
- Q: How wide should the refactor reach when searching for usages? → A: Every file in the project (not limited to the current document's include tree).
- Q: Where does editing count as a "rename"? → A: Only when editing the symbol's **definition** site; editing a reference does not trigger the suggestion.
- Q: When the user clicks the inline suggestion, how should the refactor apply? → A: One-click apply that immediately rewrites all usages across files, with a dismiss option and undo.
- Q: What is the source of truth when searching for usages, given files may have unsaved live (Hocuspocus) edits? → A: Use live collaborative (Hocuspocus) content for files in an active shared session, falling back to persisted server content for files without a live session.
- Q: How is the apply performed, given the existing refactor code and live (Hocuspocus) sessions? → A: Reuse the single existing symbol-refactor implementation; it must perform collaboration-aware updates (applying into the live collaborative document where a session exists, persisted rewrite otherwise). If the existing code does not yet support collaborative-document updates, it MUST be fixed and that same code reused — no parallel apply path is created for this feature.
- Q: What is the undo expectation for an applied rename spanning multiple files and collaborative sessions? → A: A single atomic undo that reverts every rewritten file and collaborative session in one step.
- Q: What happens when the new name collides with an existing symbol of the same kind? → A: Warn and block the apply while the collision exists; the author must choose a non-colliding name to proceed.
- Q: What counts as "other symbols anywhere else" when deciding whether to suggest a refactor? → A: Suppress the suggestion only when there are zero other occurrences of the old name of any kind — no references and no other definitions — anywhere in the project. Any other occurrence (a reference or another same-named definition) warrants the suggestion.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Rename an attribute definition and propagate to all references (Priority: P1)

An author edits an attribute definition line (e.g. changes `:product-name:` to `:product-title:`) in the editor. After they pause, the editor offers to update every reference to that attribute across all documents in the project. With one click, all `{product-name}` references become `{product-title}` everywhere, and the change is undoable.

**Why this priority**: Attributes are the most commonly reused symbol and the most error-prone to rename by hand — a missed reference silently breaks rendering across many documents. This is the core value of the feature and is independently shippable.

**Independent Test**: In a project with an attribute referenced from several files, rename the attribute definition, wait for the suggestion, click apply, and confirm every reference is rewritten and the preview still resolves. Delivers immediate, verifiable value on its own.

**Acceptance Scenarios**:

1. **Given** an attribute `:product-name:` defined in one file and referenced as `{product-name}` in three other files, **When** the author changes the definition to `:product-title:` and stops typing for 2 seconds, **Then** an in-editor suggestion appears stating that the old name has references elsewhere and offering to rename them to the new name, including a count of references and affected files.
2. **Given** the suggestion is showing, **When** the author clicks apply, **Then** all references across all project files are rewritten to the new name, the author sees confirmation of how many files/references changed, and the operation can be undone as a single step.
3. **Given** the author renamed the attribute but the old name has no references anywhere else, **When** they stop typing, **Then** no suggestion appears (nothing to refactor).

---

### User Story 2 - Rename an explicit anchor/ID and update all cross-references (Priority: P1)

An author changes an explicit anchor definition (e.g. `[[install-guide]]` → `[[installation]]`, or `[#install-guide]`, or `anchor:install-guide[]`). After a pause, the editor offers to update every cross-reference (`<<install-guide>>`, `xref:install-guide[]`) across all project documents to the new anchor name.

**Why this priority**: Broken cross-references produce dangling links and failed builds; anchors are frequently referenced from other documents, so manual renaming is unreliable. Equal in importance to attribute rename.

**Independent Test**: In a project with an anchor referenced by xrefs from other files, rename the anchor definition, apply the suggestion, and confirm all xrefs resolve to the new target.

**Acceptance Scenarios**:

1. **Given** an anchor `[[install-guide]]` referenced by `<<install-guide>>` and `xref:install-guide[Setup]` in other files, **When** the author renames the anchor definition and pauses for 2 seconds, **Then** a suggestion offers to update all cross-references to the new name.
2. **Given** the suggestion is showing, **When** the author applies it, **Then** every cross-reference to the old anchor is rewritten to the new anchor and none are missed.

---

### User Story 3 - Rename a section heading and update auto-generated ID references (Priority: P2)

An author edits a section heading whose auto-generated ID is referenced by cross-references elsewhere (e.g. renaming `== Install Guide`, whose derived ID changes). After a pause, the editor offers to update cross-references that targeted the heading's previous auto-generated ID.

**Why this priority**: Heading-derived IDs are convenient but fragile — editing heading text silently changes the ID and breaks references. Valuable but lower priority than explicit symbols because detecting "the heading's ID changed" is more subtle and only matters when references exist.

**Independent Test**: In a project where a heading's auto-generated ID is referenced by an xref in another file, edit the heading text, apply the suggestion, and confirm the xref now targets the new derived ID.

**Acceptance Scenarios**:

1. **Given** a section heading whose derived ID is referenced by cross-references in other files, **When** the author changes the heading text and pauses for 2 seconds, **Then** a suggestion offers to update cross-references from the old derived ID to the new derived ID.
2. **Given** the heading has an explicit ID assigned (so its derived ID is not used), **When** the author edits only the heading text, **Then** no ID-rename suggestion appears (the reference target has not changed).

---

### User Story 4 - Timing and location behavior of the suggestion (Priority: P1)

The suggestion's appearance and disappearance follow strict timing tied to the author's activity and cursor location, so it is helpful without being intrusive.

**Why this priority**: The timing/location behavior is an explicit, non-negotiable requirement from the request and governs the feel of the entire feature; it must be correct for the feature to be acceptable.

**Independent Test**: Drive the editing/cursor sequence described below and assert the suggestion appears, updates, hides, and re-appears at the specified times.

**Acceptance Scenarios**:

1. **Given** the author is actively changing a symbol name, **When** fewer than 2 seconds have elapsed since their last change to it, **Then** no suggestion is shown yet.
2. **Given** the author stops changing the symbol name, **When** 2 seconds elapse with no further change, **Then** the suggestion appears reflecting the current (latest) name.
3. **Given** a suggestion is showing for name X, **When** the author resumes changing the name to Y, **Then** the current suggestion is withdrawn while typing and a refreshed suggestion for Y appears 2 seconds after they stop again (the suggestion auto-updates to the newest name).
4. **Given** a suggestion is showing, **When** the author moves the cursor away from the renamed symbol's location and does not return, **Then** the suggestion disappears 5 seconds after leaving.
5. **Given** the author left the symbol location less than 5 seconds ago, **When** they return the cursor to the renamed symbol's location before the 5 seconds elapse, **Then** the suggestion remains visible (the disappearance is cancelled) and continues to reflect the latest name.

---

### Edge Cases

- **No other occurrences**: If the old name has no other occurrences of any kind anywhere in the project — no references and no other definitions — outside the definition being edited, no suggestion is shown.
- **New name collides with an existing symbol**: If the new name already exists as a symbol of the same kind elsewhere, the suggestion warns of the collision and the apply is blocked until the author chooses a non-colliding name (references are never merged into an ambiguous state).
- **Invalid new name**: If the in-progress new name is empty or not a valid symbol name, no apply is offered (the suggestion either does not appear or indicates the name is not yet valid).
- **Reverting to the original**: If the author edits the name and then changes it back to the original spelling, the pending suggestion is dismissed (there is nothing to rename).
- **Rapid successive renames**: Continuous edits keep resetting the 2-second timer so the suggestion only ever reflects a settled name, never an intermediate keystroke state.
- **Editing a reference, not a definition**: Editing an occurrence that is a reference (not the definition) does not trigger a rename suggestion.
- **Symbol used in verbatim/code blocks**: Occurrences inside literal/verbatim/code contexts are not treated as references to rewrite (consistent with how the project already distinguishes real references from literal text).
- **Concurrent collaborators**: The suggestion is a private, local hint for the editing author; another collaborator editing the same document does not see the suggestion, but does see the resulting change once applied.
- **Symbol name changed by a remote collaborator**: If a remote edit changes the same definition while a local suggestion is pending, the suggestion reflects the latest resolved name or is withdrawn if it no longer corresponds to a real rename.
- **Large project / many usages**: When the old name has a very large number of usages, the suggestion still summarizes the impact and the apply completes without requiring the author to open each file.
- **Partial permissions**: If the author lacks permission to edit some files that contain usages, the suggestion/apply reports which files could not be updated rather than failing silently.
- **Files not currently open**: Usages in files the author does not have open are still found and updated on apply.

## Requirements *(mandatory)*

### Functional Requirements

**Detection**

- **FR-001**: The system MUST detect when the author changes the name at the **definition site** of a supported symbol: an explicit anchor (`[[id]]`, `[#id]`, `anchor:id[]`), an attribute definition (`:name:` / `:name!:`), or a section heading whose ID is auto-generated from its text.
- **FR-002**: The system MUST capture the symbol's original ("old") name as of the moment the author began editing that definition, so the old name can be searched for even after the definition text has changed.
- **FR-003**: The system MUST treat a change as a rename candidate only when the old name has **at least one other occurrence anywhere in the project** — a reference, or another definition of the same-named symbol — outside the definition being edited. If there are no other occurrences of any kind, the system MUST NOT offer a suggestion.
- **FR-004**: The system MUST NOT trigger a rename suggestion from edits made at a reference/usage site (only definition-site edits qualify).
- **FR-005**: For section headings, the system MUST only offer an ID rename when the heading's auto-generated ID is the actual reference target (i.e. the heading has no explicit ID overriding it) and that derived ID is referenced elsewhere.

**Search scope**

- **FR-006**: The system MUST search for usages of the old name across **every document in the project**, not only the current document or its include tree.
- **FR-006a**: When determining usages, the system MUST use the **live collaborative (Hocuspocus) content** of any file that has an active shared editing session, and fall back to persisted server content for files without a live session — so usages added or removed in unsaved live edits are counted correctly.
- **FR-007**: The system MUST distinguish genuine references from incidental text (e.g. occurrences inside verbatim/code/literal contexts MUST NOT be counted or rewritten), consistent with the project's existing reference-resolution rules.
- **FR-008**: The system MUST match usages by symbol kind (attribute references for attributes; cross-references such as `<<id>>` and `xref:id[]` for anchors and heading IDs), not by naive text matching.

**Suggestion presentation & timing**

- **FR-009**: The system MUST present the suggestion inline within the editor, positioned in relation to the renamed symbol's location (not as a separate modal or external panel).
- **FR-010**: The system MUST show the suggestion only after the author has stopped changing the symbol name for **2 seconds**.
- **FR-011**: While the author continues changing the name, the system MUST keep the suggestion withheld/updated so that any shown suggestion always reflects the latest settled name (the 2-second timer resets on each change).
- **FR-012**: The suggestion MUST communicate the proposed rename (old name → new name), the symbol kind, and the impact (number of references and number of affected files).
- **FR-013**: When the author moves the cursor/edit location away from the renamed symbol, the system MUST hide the suggestion **5 seconds** after they leave.
- **FR-014**: If the author returns the cursor to the renamed symbol's location within the 5-second window, the system MUST cancel the pending disappearance and keep the suggestion visible.
- **FR-015**: The system MUST auto-dismiss the suggestion when it becomes moot — specifically when the name is reverted to the original, when the rename is applied, or when the old name no longer has any usages.
- **FR-016**: The suggestion MUST be dismissible by the author on demand, and a dismissed suggestion for a given settled name MUST NOT immediately reappear for that same name.

**Applying the refactor**

- **FR-017**: The system MUST let the author apply the refactor with a single action from the inline suggestion.
- **FR-018**: On apply, the system MUST rewrite all matched usages of the old name to the new name across all affected project files, including files the author does not currently have open.
- **FR-018a**: The apply MUST be performed by **reusing the existing symbol-refactor implementation** rather than a new/parallel apply path. That implementation MUST perform collaboration-aware updates: applying edits into the live collaborative (Hocuspocus) document for any affected file with an active session, and rewriting persisted content for files without one. If the existing implementation does not yet support collaborative-document updates, it MUST be extended/fixed and that same code reused.
- **FR-019**: On apply, the system MUST report the outcome (how many references in how many files were updated) and surface any files that could not be updated (e.g. due to permissions).
- **FR-020**: The apply operation MUST be undoable as a **single atomic step** that reverts every rewritten usage — across all affected files and collaborative (Hocuspocus) sessions — back to the old name in one action.
- **FR-021**: The system MUST NOT rewrite the definition itself as part of the apply (the author already changed it); the apply updates the *usages* to match the definition.
- **FR-022**: When the new name collides with an existing symbol of the same kind (within the project search scope), the system MUST warn the author and MUST **block** the apply while the collision exists; the author must choose a non-colliding name to proceed. The system MUST NOT produce ambiguous references by merging two distinct symbols.
- **FR-023**: The applied change MUST become visible to collaborators through the normal editing/sync mechanism, so all users converge on the renamed usages.

**Privacy / collaboration**

- **FR-024**: The suggestion itself MUST be a local, per-author hint that is not shown to other collaborators.
- **FR-025**: The system MUST remain responsive during detection and counting so that showing/counting usages does not block the author's typing.

### Key Entities *(include if feature involves data)*

- **Symbol**: A named entity in a document — an explicit anchor/ID, an attribute definition, or a section heading's auto-generated ID. Has a kind, a name, and a definition location.
- **Rename candidate**: The transient state describing a detected definition-site change — the captured old name, the current new name, the symbol kind, and the definition location — used to drive the suggestion.
- **Usage / reference**: An occurrence elsewhere that resolves to the symbol (an attribute reference `{name}`, or a cross-reference `<<id>>` / `xref:id[]`), identified by file and location, that would be rewritten on apply.
- **Rename suggestion**: The inline offer presented to the author, carrying old→new names, symbol kind, impact summary (reference count, file count), and the apply/dismiss actions, governed by the timing/location rules.
- **Refactor result**: The outcome of applying — counts of updated references and files, any skipped/failed files, and the information needed to undo the operation as one step.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: When an author renames a symbol definition that has usages elsewhere, the suggestion appears within roughly 2 seconds of them stopping, and applying it updates 100% of the genuine usages across the project with none missed and no false rewrites (e.g. verbatim occurrences left untouched).
- **SC-002**: Renaming a project-wide symbol with many usages takes the author a single confirm action instead of manually editing each file, reducing the interaction to one apply click regardless of how many files are affected.
- **SC-003**: The suggestion never appears while the author is still actively changing the name (no suggestion is shown until at least 2 seconds after the last change), and never appears at all when the old name has no other occurrences (references or definitions) anywhere in the project.
- **SC-004**: After the author leaves the renamed symbol's location, the suggestion disappears within about 5 seconds; if they return within that window, it stays — verified across the full timing sequence.
- **SC-005**: Applying a rename can be fully reversed with a single undo, restoring every rewritten usage to its prior name.
- **SC-006**: Broken references caused by manual renames (dangling xrefs / unresolved attributes) are eliminated for renames performed through the suggestion, measured by zero unresolved references introduced by the rename in the preview after apply.
- **SC-007**: The editor remains responsive (no perceptible typing lag introduced) while the system detects the rename and counts usages, even in large projects.

## Assumptions

- "is / anchor / attribute" in the request is interpreted as "id / anchor / attribute"; anchors and IDs refer to the same underlying explicit-anchor and heading-ID symbols.
- "All the documents" means all documents within the current project (the project is the boundary of the search), consistent with the clarified project-wide scope.
- The project already provides authoritative extraction of symbols and references and a mechanism to rewrite usages across multiple files; this feature builds the proactive in-editor suggestion and timing/location behavior on top of that existing capability rather than redefining reference resolution.
- "The location of the symbol" for the disappearance/return rule means the definition site the author was editing (and its immediate vicinity in the current document), used to decide whether the author is "at" the renamed symbol.
- The suggestion applies to one detected rename at a time (the symbol at the definition the author most recently edited); handling multiple simultaneous pending renames is out of scope for the initial version.
- Reference matching, verbatim exclusion, and attribute scoping follow the same rules the project already uses for its preview and existing symbol tooling, so the suggestion and the resulting render stay consistent.
- The 2-second and 5-second durations are fixed product requirements for this version (not user-configurable).

## Out of Scope

- Renaming symbol kinds other than explicit anchors/IDs, attribute definitions, and heading-derived IDs (e.g. bibliography IDs, footnote IDs, callout list numbers).
- Rewriting references found in non-AsciiDoc assets or external systems.
- Batch/multi-symbol renames, project-wide search-and-replace UI, or a rename history/report beyond single-step undo.
- Configurable timing thresholds or per-user preferences for the suggestion behavior.
- Detecting renames triggered by editing a reference rather than the definition.
