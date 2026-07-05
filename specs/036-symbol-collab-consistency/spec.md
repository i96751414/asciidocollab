# Feature Specification: Collaborative Consistency of Attribute/Symbol-Derived State

**Feature Branch**: `036-symbol-collab-consistency`

**Created**: 2026-07-05

**Status**: Draft

**Input**: User description: "Fix the attribute/symbol collaborative editing issues — when another user changes an AsciiDoc file that affects the defined attributes/symbols that affect the currently open document, the open document should stay consistent (highlighting, inherited attributes, heading IDs, outline, preview, and rename suggestions), not silently go stale."

## Overview

AsciiDoc projects are assembled from many files: a master/root file pulls in others with `include::`, and document attributes, anchors, and heading IDs flow through that tree in reading order. What an author sees for the file they have open — its resolved attribute values, its automatic heading IDs, its outline, its rendered preview, the way its text is highlighted, and the rename suggestions offered while they type — is therefore derived not only from the open file but from *other* files in the project.

The project supports real-time collaboration, so those other files can be changed by a different person at any moment, including changes that are not yet saved to the server. Today, several of these derived views are computed from the persisted (last-saved) copy of the related files, or are not recomputed at all when a related file changes. The result is that an author's open document can silently disagree with the project's true current state: an attribute shows a stale value, a heading ID or cross-reference resolves to the wrong target, the outline lists sections that no longer exist, the preview renders old content, inherited attributes highlight as unknown, or a rename suggestion reports the wrong number of affected references.

This feature makes every attribute/symbol-derived view of the open document stay consistent with collaborators' live edits to the files that affect it. When another user changes a file that contributes attributes or symbols to the open document's context, the open document's highlighting, inherited attributes, heading IDs, outline, preview, and rename suggestions update to reflect that change — automatically and without requiring either user to save or reload.

## Clarifications

### Session 2026-07-05

- Q: What propagation-latency target should cross-file consistency meet after a related file changes? → A: No fixed numeric target — best-effort/eventual; correctness is guaranteed once changes settle (no lasting staleness), measured by convergence after quiescence rather than a deadline.
- Q: How many related files should an open document keep live-observed at once, and what happens beyond that? → A: Up to ~25 concurrently observed related files; beyond that, the excess falls back to last-saved (persisted) content refreshed by bounded polling.
- Q: When the outline panel is closed, what does the always-on (panel-independent) guarantee keep fresh? → A: Attribute/ID/preview correctness — always observe files that can change the open document's inherited attributes, heading IDs, or references (ancestors, earlier-included siblings, and the open document's own includes); live updates to an unrelated sibling's headings refresh the full assembled outline only while the outline is shown.
- Q: When a related file can't be observed live (cap exceeded, observation dropped, or no session), how is that surfaced? → A: A subtle, non-intrusive on-demand indicator that some inputs come from last-saved content — no disruptive warnings.
- Q: When the ~25 live-observation cap binds, how are the watched files selected? → A: By certainty of impact. Tier 1 (files that already affect the open file), in this order: (1) ancestors along the include path up to the root, then (2) earlier-in-reading-order files that currently define attributes in effect for the open file, then (3) the open file's own includes. Tier 2 (files that could affect it): files positioned before the open file's first inclusion point that could newly define affecting attributes. Fill Tier 1 before Tier 2; overflow falls back to persisted content refreshed by bounded polling.
- Q: If the Tier-1 "already affects" set alone exceeds the cap, which files keep the live slots? → A: The nearest in include/reading order (closest ancestors and nearest earlier-defining files); the most distant Tier-1 files fall back to persisted+poll, still surfaced as non-live.
- Q: Should consistency be driven by the client observing many related files, or by the backend tracking dependencies/sessions and pushing relevant-change notifications? → A: Backend-authoritative (the chosen design). The server maintains the project include/dependency graph, per-file symbol/attribute definitions, and the set of files with live sessions, and delivers a targeted relevant-change signal (or resolved delta) to exactly the open documents a change affects; a client holds essentially one connection plus a notification channel. Client-side fan-out (many observer sessions with the ~25 cap and per-slot priority) is the REJECTED alternative, retained only as a documented fallback — so the cap/slot mechanics (FR-014/FR-022) are implementation details of that fallback, not spec guarantees. The spec commits to the outcomes (bounded collaboration-backend load, reliable relevant-change delivery) and keeps the impact priority as the order in which changes are evaluated and notified.
- Q: How is multi-user session churn (peers rapidly opening/closing sessions on relevant files) handled? → A: Because the backend tracks live sessions and each file's converged content, a peer joining or leaving does not reshuffle any client's dependency set; relevant-change notifications are debounced/coalesced and delivered without observe↔persisted thrashing or teardown races, and concurrent multi-user edits converge to a single coherent state that the open document consumes.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Inherited attribute values stay live in the preview (Priority: P1)

An author has a file open and is viewing its HTML preview. A collaborator, editing a parent/ancestor file (or an earlier-included sibling) in the same project, changes the value of an attribute that the open file relies on (for example `:productName:` used as `{productName}`, or a `:sectnums:`/caption attribute). The open author's preview re-renders with the new value shortly after the collaborator's keystrokes, with neither person saving the file.

**Why this priority**: The preview is the author's primary "is this correct?" signal, and attribute values change what the reader actually sees. A stale preview is the most visible and most damaging inconsistency. This is the foundational slice — the same live cross-file resolution underlies every other story.

**Independent Test**: In a two-client setup, open a child file's preview in client A; in client B edit the parent's `:productName:` value without saving; confirm client A's preview converges to the new value shortly after the edit settles (no fixed deadline).

**Acceptance Scenarios**:

1. **Given** the open file references `{productName}` inherited from a parent that defines `:productName: Acme`, **When** a collaborator changes the parent definition to `:productName: Beta` in a live session (unsaved), **Then** the open file's preview re-renders showing "Beta" without the open author refreshing or the collaborator saving.
2. **Given** an attribute is defined in an earlier-included sibling and persists into the shared context, **When** the collaborator changes that sibling's definition live, **Then** the open file's preview reflects the new value.
3. **Given** a collaborator removes an attribute definition the open file depended on, **When** the change propagates, **Then** the open file's preview reflects the now-unresolved reference consistently with the product's standard handling of undefined attributes (not a stale cached value).
4. **Given** the collaborator later stops editing and their session ends, **When** the open author continues, **Then** the preview remains consistent with the last live state (and with the persisted state once the collaborator's edits are saved).

---

### User Story 2 - Inherited attributes and highlighting stay live in the editor (Priority: P1)

An author is editing a file (not previewing). A collaborator changes an attribute definition in a file that contributes to the open file's inherited context. The open file's editor updates its treatment of inherited attributes: references to a now-defined attribute stop being flagged as unknown (and vice-versa), inline attribute display/folding reflects the new value, and any behavior keyed on inherited attributes (such as conditional-branch dimming or path resolution for includes/images) recomputes.

**Why this priority**: Authors spend most of their time in the editor, not the preview. If the editor's understanding of which attributes are defined lags the true project state, highlighting and authoring aids mislead the author (e.g., a valid reference looks broken, or a broken one looks valid). Equal in importance to the preview.

**Independent Test**: Open a child file in the editor in client A; in client B add a new `:flag:` definition to the parent live; confirm that in client A a `{flag}` reference in the open file stops being highlighted as an unknown/undefined attribute.

**Acceptance Scenarios**:

1. **Given** the open file references an attribute not yet defined anywhere, **When** a collaborator adds that attribute's definition to an ancestor file live, **Then** the open file's editor stops highlighting the reference as undefined and shows the inherited value where inline values are displayed.
2. **Given** an inherited attribute currently controls an `ifdef`/`ifndef`/`ifeval` region's active/inactive state in the open file, **When** a collaborator flips that attribute's value live, **Then** the open file's active/inactive region treatment recomputes to match.
3. **Given** an inherited `:imagesdir:` or a path attribute used in an `include::`/`image::` target, **When** a collaborator changes it live, **Then** the open file's resolution/authoring aids for those targets reflect the new value.

---

### User Story 3 - Heading IDs, outline, and cross-references stay consistent (Priority: P1)

An author has a file open (viewing its outline and/or previewing). A collaborator changes something that affects automatic ID generation or document structure in a related file — for example an inherited `:idprefix:`/`:idseparator:`/`:sectids:` attribute, a `leveloffset`, or the headings of an included file. The open document's automatically generated heading IDs, its outline entries, and any cross-references that target those IDs update to stay consistent.

**Why this priority**: Heading IDs are the anchor targets for cross-references across the whole project; if the open document computes them from stale inherited attributes, its outline and its links silently diverge from what the assembled document will actually produce. This is a correctness guarantee equal to attribute values.

**Independent Test**: Open a file whose headings inherit `:idprefix:` from a parent; in another client change the parent's `:idprefix:` live; confirm the open file's outline entries and generated heading IDs adopt the new prefix.

**Acceptance Scenarios**:

1. **Given** the open file's headings derive their IDs from an inherited `:idprefix:`/`:idseparator:`, **When** a collaborator changes those attributes in an ancestor file live, **Then** the open file's generated heading IDs and outline update to the new scheme.
2. **Given** the outline is shown in full-document (assembled) scope and includes headings from a related file, **When** a collaborator edits that related file's headings live, **Then** the assembled outline updates to reflect the added/removed/renamed sections.
3. **Given** a cross-reference in the open file targets a heading whose auto-ID depends on inherited attributes, **When** the inherited attributes change live, **Then** the cross-reference's resolution/label stays consistent with the new ID.

---

### User Story 4 - Rename suggestions and reference counts reflect collaborators' live edits (Priority: P2)

An author renames a symbol (attribute definition, explicit anchor, or heading auto-ID) in the open file and is shown a rename-refactor suggestion. Concurrently, collaborators are adding, removing, or renaming references to that symbol — or same-named definitions — in other files. The suggestion (whether to offer it at all, the count of affected references/files it reports, and its collision check against existing symbols) reflects the project's live state, not a stale snapshot.

**Why this priority**: The rename suggestion drives a one-click multi-file rewrite; if its reference counts or collision detection are computed from stale content, it either misses live references or falsely reports/omits a collision, producing an incorrect refactor. Important, but it builds on the same live-content foundation as the P1 stories and affects a narrower moment (an in-progress rename).

**Independent Test**: Begin renaming an attribute definition in client A so the suggestion appears with a reference count; in client B add a new reference to the old name in another file live; confirm client A's suggestion count increases to include it.

**Acceptance Scenarios**:

1. **Given** a rename suggestion is showing for a symbol with N references across the project, **When** a collaborator adds or removes a reference to that symbol in another file live, **Then** the suggestion's reported reference/file count updates to match before the author applies it.
2. **Given** the author types a new name that does not currently collide, **When** a collaborator introduces a same-kind definition of that new name elsewhere live, **Then** the suggestion detects the collision and blocks the apply while it persists (consistent with the existing rename collision rule).
3. **Given** the old name's only remaining occurrence is removed by a collaborator live, **When** the suggestion recomputes, **Then** it stops offering the rename (nothing left to refactor), consistent with the existing suppression rule.
4. **Given** the author applies an accepted rename, **When** the rewrite runs, **Then** it targets the live current content of every affected file (applying into a collaborator's active session where one exists, and the persisted copy otherwise) so no live reference is missed.

---

### User Story 5 - Consistency does not depend on which editor panel is open (Priority: P1)

The open document's cross-file consistency guarantee holds regardless of which side panels or tabs the author has open (for example, whether the outline is shown, hidden, or in "current file" vs "full document" mode). Turning a panel on or off must not change whether the open document reflects collaborators' edits to related files. Specifically, the views that depend on inherited attributes, IDs, and references — preview, highlighting, inherited attribute values, heading IDs, and cross-references — stay fresh whenever the document is open (by always observing the files that can change them: ancestors, earlier-included siblings, and the open document's own includes). The full assembled outline's live updates for an unrelated sibling's headings are the one exception: they apply only while the outline is shown.

**Why this priority**: Correctness that silently switches off based on an unrelated UI toggle is a trap — an author cannot reason about when the editor is trustworthy. Today, cross-file live updates are effectively active only while the full-document outline is visible; in every other layout the open document can silently diverge. Making the guarantee uniform is as important as the guarantee itself.

**Independent Test**: Reproduce a dependency-file change (e.g. a collaborator changes an inherited attribute) across each combination of {outline open/closed, outline scope current/full, main file set/unset} and confirm the open document updates identically in every combination.

**Acceptance Scenarios**:

1. **Given** the open file inherits an attribute and the outline panel is **closed**, **When** a collaborator changes that attribute in a related file live, **Then** the open document's preview, highlighting, and heading IDs update exactly as they would with the outline open.
2. **Given** any left-panel tab (or none) is active, **When** a related file changes, **Then** the open document updates per the same freshness guarantee, independent of panel state or mode.

---

### User Story 6 - A collaborator's saved edit to a related file refreshes the open document (Priority: P1)

When a collaborator **saves** (not merely live-edits) a change to a file the open document depends on, the open document refreshes on a best-effort/eventual basis (no fixed deadline). It does not stay stale until an unrelated trigger such as a reconnect, a structural file-tree change, or an unrelated refresh.

**Why this priority**: A plain content save currently propagates nothing to other users' open documents that depend on it, producing an unbounded staleness window — the most common everyday collaboration action (edit and save) is exactly the one that silently leaves peers stale. This is a core correctness gap, distinct from unsaved-live-edit propagation.

**Independent Test**: From a second client, edit and save a change to an included file (with no structural change and no live session left open on that file); confirm the first client's open document refreshes to the new content once the save settles, without reconnecting.

**Acceptance Scenarios**:

1. **Given** the open document depends on a related file's content, **When** a collaborator saves a change to that file, **Then** the open document's derived views refresh to the saved content once the change settles (best-effort; not indefinitely stale), with no reconnect, structural event, or manual refresh required.
2. **Given** a collaborator edited and saved a related file and then disconnected (no live session remains), **When** the open document next resolves, **Then** it reflects the saved change (not a pre-save stale value).
3. **Given** such a refresh occurs, **When** it completes, **Then** all derived views refresh coherently from the same recomputed state — no partial refresh where, e.g., the outline updates but highlighting lags.

---

### User Story 7 - Graceful behavior at the edges of a live session (Priority: P3)

The consistency guarantee degrades gracefully when related files have no active collaborator: their contribution is taken from the last saved (persisted) content, and it switches to live content automatically when a collaborator opens/edits them, and back to persisted content when their session ends.

**Why this priority**: Correctness at session boundaries prevents flip-flopping or stale reads, but it is a refinement of the core stories rather than independently valuable on its own.

**Independent Test**: With no collaborator in a related file, confirm the open document resolves that file's contribution from saved content; have a collaborator start editing it live and confirm the open document switches to the live value; end the session and confirm it reverts to the (now saved or last-known) value without a stale intermediate.

**Acceptance Scenarios**:

1. **Given** a related file has no live session, **When** the open document resolves its inherited context, **Then** it uses that file's persisted content.
2. **Given** a collaborator opens a related file and edits it live, **When** the change occurs, **Then** the open document switches to the live content as its source for that file.
3. **Given** a collaborator's session on a related file ends, **When** the open document next resolves, **Then** it uses the persisted content without briefly showing a stale value.

---

### Edge Cases

- **Unsaved live edits**: a collaborator's change exists only in the live session and has not been saved to the server; derived views must reflect it anyway (this is the central case, not an exception).
- **Volume / server load**: an open document may reach many related files. In the backend-authoritative design the client's connection count stays bounded/near-constant regardless of how many files affect it (the server does the tracking), so this is handled by design; only the client-observation fallback needs the ~25 cap with persisted+poll beyond it, surfaced as non-live (see FR-014/FR-023).
- **Reachability changes**: a collaborator adds or removes an `include::` so a file enters or leaves the open document's context; the derived views must add/drop that file's contribution accordingly.
- **Main/root file change**: the project's designated main file (which anchors inherited context) is changed while documents are open; inherited context must re-resolve for all open documents.
- **Circular or self-referential includes**: a collaborator introduces an include cycle; resolution must remain bounded and not hang or crash.
- **Concurrent edits to the open document itself**: the open document is being co-edited at the same time its inherited context changes; both must be reflected without one clobbering the other's derived state.
- **Rapid successive changes**: a collaborator types quickly; derived views must converge on the final state without getting stuck on an intermediate value.
- **Open document not reachable from the main file**: no inherited context applies; the document resolves using only its own attributes/symbols (and rename remains project-wide).
- **Consistency gated on an unrelated UI state**: a collaborator's edit to a related file must reach the open document whether or not the outline (or any other panel) happens to be open — the guarantee cannot depend on UI layout.
- **Saved-but-not-live edit**: a collaborator edits and saves a related file and then leaves (no active session on it); the open document must reflect the saved change even though no live session is present to observe.
- **Change-delivery failure / dropped connection**: a relevant-change notification (or, in the fallback, an observation) is lost or a connection drops; the open document must fall back to that file's last known content, recover on the next successful sync/redelivery, and surface the non-live state, without corrupting or freezing the derived views.
- **Session churn**: peers repeatedly open and close sessions on related files; this must not reshuffle the open document's dependency set, thrash its live/persisted source, or cause teardown races (FR-024).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: When a file that contributes attributes or symbols to the currently open document changes in a live collaborative session, the system MUST recompute the open document's affected derived views automatically, with no save or reload required by either user.
- **FR-002**: The set of derived views kept consistent MUST include, at minimum: (a) the HTML preview, (b) editor highlighting of inherited attributes and symbols, (c) resolved inherited attribute values (and behaviors keyed on them, such as conditional regions and include/image path resolution), (d) automatically generated heading IDs, (e) the document outline, and (f) in-editor symbol rename suggestions and their reported reference/file counts and collision checks.
- **FR-003**: The system MUST resolve each related file's contribution from its current authoritative content — the live collaborative content when a session for that file is active, the persisted (last-saved) content otherwise — switching automatically as sessions begin and end. A client MUST NOT need to be an editor of a related file to receive that file's current content; in the backend-authoritative design (FR-023) the resolution is performed server-side against the content the server already holds.
- **FR-004**: The scope of "files that affect the open document" MUST match each view's established resolution model: inherited attributes, heading IDs, preview, highlighting, and outline resolve through the include tree anchored at the project's designated main file (using the attribute context in effect at the open file's first inclusion point in reading order); rename suggestions consider every file in the project.
- **FR-005**: Derived views MUST reflect a collaborator's change even when that change is unsaved (present only in the live session).
- **FR-006**: When a live change alters the open document's inherited attribute values, the preview and the editor MUST both converge to the new values; neither may retain a stale cached value after changes settle.
- **FR-007**: When a live change alters attributes affecting automatic ID generation (e.g. `idprefix`, `idseparator`, `sectids`) or alters the structure/headings of a related file, the open document's generated heading IDs, outline entries, and cross-reference resolution MUST update to stay consistent with the assembled document.
- **FR-008**: When a live change adds or removes an `include::` such that a file enters or leaves the open document's context, the system MUST add or drop that file's contribution to the derived views accordingly.
- **FR-009**: When the project's designated main file is changed, the system MUST re-resolve inherited context and refresh the derived views for every currently open document.
- **FR-010**: A rename suggestion for a symbol MUST base its decision to appear, its reference/file counts, and its collision check on the project's live current state, updating while the suggestion is visible as collaborators change references or definitions elsewhere.
- **FR-011**: Applying an accepted rename MUST rewrite the live current content of every affected file — applying into a collaborator's active session where one exists and the persisted copy otherwise — so that no live occurrence is missed, and the operation MUST remain undoable as a single step (consistent with the existing rename-refactor behavior).
- **FR-012**: The system MUST converge on the collaborator's final state after rapid successive changes, without leaving a derived view stuck on an intermediate value.
- **FR-013**: Resolution MUST remain bounded and safe when a collaborator introduces a circular or self-referential include (no hang, crash, or runaway work).
- **FR-014**: The system MUST keep every open document consistent without unbounded or wasteful fan-out of live connections, and MUST bound the load it places on the collaboration backend. In the backend-authoritative design (FR-023) a client holds a bounded, near-constant number of connections regardless of how many files affect it. If the client-side observation fallback is used instead, it MUST cap concurrent live observations per open document (≈25) and, beyond the cap, fall back to persisted content refreshed by bounded polling (files selected per FR-022) — never silently dropping consistency; non-live inputs MUST be surfaced per FR-021.
- **FR-015**: Consistency MUST hold while the open document is simultaneously being co-edited; changes to inherited context and changes to the open document itself must both be reflected without one discarding the other's derived state.
- **FR-016**: The consistency guarantee for attribute/ID/reference-derived views (preview, highlighting, inherited attribute values, heading IDs, cross-references) MUST NOT depend on which editor panel or tab is visible, or its mode (e.g., outline shown/hidden, "current file" vs "full document" scope); the system MUST keep those views fresh whenever the document is open by tracking the files that can change them (ancestors, earlier-included siblings, and the open document's own includes) — server-side in the backend-authoritative design (FR-023). Live updates to the full assembled outline for an unrelated sibling's headings are the sole permitted exception — they need only apply while the outline is shown.
- **FR-017**: A collaborator's saved (persisted) change to a related file MUST propagate to the open document's derived views on a best-effort/eventual basis (no fixed latency target), without requiring a reconnect, an unrelated structural change, or a manual refresh — including when no live session remains on that file. Staleness MUST NOT persist indefinitely awaiting an unrelated trigger.
- **FR-018**: After a related-file change, all affected derived views MUST refresh coherently from the same recomputed state; the system MUST NOT leave views mutually inconsistent (e.g., an updated outline alongside stale highlighting).
- **FR-019**: Keeping cross-file views fresh MUST run off the open document's interactive editing path, so that tracking related files and recomputing derived views does not degrade local typing/editing responsiveness.
- **FR-020**: Bursts of rapid related-file changes MUST be coalesced so the open document performs a bounded amount of recomputation (not one per keystroke) while still converging on the collaborator's final state (refines FR-012).
- **FR-021**: A failed or dropped relevant-change delivery, or a dropped observation of a related file (or a file beyond any observation bound), MUST NOT corrupt the derived state; the affected file MUST fall back to its last known content and recover on the next successful sync or redelivery. That a derived view is drawing on last-saved (non-live) content MUST be surfaced through a subtle, non-intrusive on-demand indicator (visible when the author looks, e.g. a preview/status marker) rather than a disruptive warning or being silently swallowed.
- **FR-022**: The system MUST prioritize by impact when deciding which related-file changes to evaluate and deliver first — and, in the client-observation fallback, which files occupy the bounded live slots (FR-014). **Tier 1 — files that already affect the open file**, in order: (a) ancestors along the include path up to the root, then (b) earlier-in-reading-order files that currently define attributes in effect for the open file, then (c) the open file's own includes. **Tier 2 — files that could affect the open file**: files positioned before the open file's first inclusion point that could newly introduce an affecting attribute definition. Tier 1 MUST outrank Tier 2; within an over-capacity Tier 1, the files nearest in include/reading order win (closest ancestors and nearest earlier-defining files first), and the remainder fall back to persisted content with bounded polling (FR-014), surfaced as non-live (FR-021). Under the backend-authoritative design this ordering governs evaluation/notification priority rather than a socket budget.
- **FR-023**: The system MUST detect, at the source of a change, whether it is relevant to each open document (i.e. it touches an attribute, anchor, include, or heading in that document's dependency set) and deliver a relevant-change signal to exactly the affected open documents — so that consistency does not require a client to independently observe every file that could affect it. The chosen design is backend-authoritative: the server maintains, per project, the include/dependency graph, the per-file symbol/attribute definitions, and the set of files with live sessions, and performs the detection and notification (or resolved-delta delivery). Client-side fan-out is a documented fallback only.
- **FR-024**: Peers rapidly opening and closing sessions on related files MUST NOT cause live↔persisted source thrashing, teardown races, or reconnect storms; an open document's dependency set MUST NOT be reshuffled merely because a peer's session begins or ends. Source/session transitions MUST be debounced/hysteretic and torn down gracefully, with no intermediate stale flash (SC-008) and no destabilization of the collaboration backend (SC-007).

### Key Entities *(include if feature involves data)*

- **Open Document**: the file the author currently has open in the editor/preview; the subject whose derived views must stay consistent.
- **Related (Reachable) File**: any file that contributes attributes or symbols to the open document — an ancestor/earlier-included file in the include tree anchored at the project main file, or (for rename) any project file that references or defines the symbol. For change tracking/notification these are ranked by impact (FR-022): files that already affect the open file (ancestors → earlier files currently defining in-effect attributes → the open file's own includes) rank above files that merely could affect it (positioned before the open file's first inclusion point).
- **Dependency Graph & Relevant-Change Notification**: the server-maintained mapping from each file to the open documents whose derived views depend on it (through the include/attribute/symbol relationships), together with the channel that signals an affected open document when a relevant change occurs (or delivers the resolved delta). Kept current as includes, definitions, and live sessions change; the backbone of the backend-authoritative design (FR-023).
- **Inherited Attribute Context**: the resolved set of attribute values in effect for the open document at its first inclusion point in reading order; drives preview values, highlighting, conditional regions, path resolution, and ID generation.
- **Project Symbol Index**: the project-wide view of defined symbols (attributes, anchors, heading auto-IDs) and their references, used by the outline, cross-reference resolution, and rename suggestions. In the backend-authoritative design this index is maintained server-side over live content, which is what makes project-wide rename freshness (FR-010) achievable without unbounded client fan-out.
- **Live Collaborative Session**: a real-time editing session for a file whose in-progress (possibly unsaved) content is the authoritative source for that file while the session is active.
- **Derived View**: any output computed from the open document plus its related files — preview, editor highlighting, inherited attribute values, heading IDs, outline, and rename suggestions — that must stay consistent with live changes.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: When a collaborator changes an inherited attribute value in a live session, the open document's preview reflects the new value without any manual refresh or save. Measured by convergence after the change settles (no fixed latency deadline): once edits quiesce, the preview matches the new value in 100% of trials.
- **SC-002**: When a collaborator adds or removes an inherited attribute definition, the open document's editor highlighting of the corresponding reference changes from/to "undefined" accordingly, with no stale state remaining after changes settle.
- **SC-003**: When a collaborator changes an attribute affecting automatic ID generation, or edits a related file's headings, the open document's generated heading IDs and outline entries match what the fully assembled document would produce, in 100% of trials once changes settle.
- **SC-004**: While a rename suggestion is visible, its reported reference/file count and its collision determination match the project's live state after a collaborator changes a reference or same-named definition elsewhere, before the author applies the rename.
- **SC-005**: An applied rename rewrites every live occurrence of the symbol across the project (live sessions and persisted files) with zero missed references, and can be undone in a single step.
- **SC-006**: No derived view of the open document retains a stale value after a related file's live change has settled (measured across preview, highlighting, inherited values, heading IDs, outline, and rename counts) — i.e., zero silent-staleness defects in the covered scenarios.
- **SC-007**: The consistency guarantee holds without destabilizing the collaboration backend: the live connections/observations attributable to cross-file consistency are bounded per open document (near-constant under the backend-authoritative design; ≤~25 under the client-observation fallback), files beyond any such bound resolve from persisted content, and there are no session-teardown failures or degradation attributable to fan-out or session churn.
- **SC-008**: When a related file's live session ends, the open document reverts to that file's persisted content without displaying an intermediate stale value.
- **SC-009**: With the outline panel closed — and across current/full scope and main-file present/absent — a collaborator's change to an inherited-attribute/ID-affecting related file updates the open document's highlighting and heading IDs identically to when the outline is open, verified in an automated two-client test.
- **SC-010**: A collaborator's saved edit to a related file refreshes the open document with no reconnect, structural event, or manual refresh — measured by convergence after the save settles (no fixed latency deadline); staleness does not persist indefinitely. In 100% of trials the open document reflects the saved change once it has settled.
- **SC-011**: Local typing/editing latency in the open document shows no measurable regression while cross-file observation and recomputation are active, compared with the same edits when no related file is changing.
- **SC-012**: Impact priority (FR-022) is honored: every relevant Tier-1 change is evaluated and delivered before any Tier-2 change. In the client-observation fallback specifically, when the affecting-file count is within the cap all such files are observed live (none silently falls back), and when it exceeds the cap the live subset is exactly the highest-priority files — every Tier-1 file before any Tier-2 file, nearest-in-include/reading-order first within an over-cap Tier-1 — verified against a constructed include graph.

## Assumptions

- **Real-time collaboration already exists**: the product already provides live co-editing of files and an existing cross-document attribute/symbol resolution model (include tree anchored at the project main file) and outline; this feature extends their consistency to live cross-file edits rather than introducing collaboration or resolution from scratch.
- **Main/root document is the existing project "main file" setting**: inherited context is anchored to the project's already-existing main file configuration; no new root-document configuration is introduced.
- **Reading-order precedence is unchanged**: attribute precedence follows AsciiDoc reading order through the include tree (most recent definition up to a point wins); this feature does not change those semantics, only the freshness of the inputs.
- **Live content is authoritative when present**: for any related file with an active collaborative session, its live (possibly unsaved) content is the source of truth; persisted content is the fallback only when no session is active — consistent with the existing rename-refactor content-source rule.
- **Best-effort latency, correctness required** (confirmed 2026-07-05): there is no fixed numeric latency target; updates must be correct once changes settle (no lasting staleness) and should feel live, but no specific deadline is required. Success criteria therefore assert convergence after quiescence, not a time bound.
- **Rename apply reuses the single existing refactor implementation**: the collaboration-aware apply/undo path from the existing symbol-rename feature is reused (and, if it lacks any needed collaboration awareness, fixed in place) rather than duplicated.
- **Scope is the derived/consistency layer**: this feature is about keeping the open document's derived views consistent with collaborators' edits; it does not add new authoring capabilities, new attribute semantics, or new symbol kinds beyond those already supported.
- **Replaces today's visibility-gated behavior**: cross-file live awareness currently activates only while the full-document outline is visible, and a peer's saved change to a related file propagates nothing until an unrelated trigger. This feature supersedes that behavior with a uniform, always-on-while-open consistency guarantee (subject to the FR-014 observation bound).
- **Server-side apply backstop exists**: the existing rename apply is guarded server-side against contradicting concurrent state, so live collision detection (FR-010) is a correctness-and-UX improvement layered on that backstop, not the sole line of defense.
- **Backend-authoritative model is the chosen design** (decided 2026-07-05): the server already resolves the include graph and inherited attributes (used today for rename/find-references) and already holds every live room's content with an internal read path, so the incremental work is a change-detection + dependency-subscription + notification layer, not new parsing or a new source of truth. The client-side fan-out approach (many observer sessions, ~25 cap, per-slot priority) is recorded as the rejected alternative and permitted only as a fallback; the plan owns the observe-vs-push decision and the notification-payload shape (bare "refetch" signal vs. resolved delta vs. assembled context).
- **Collaboration layer converges concurrent edits**: multiple simultaneous edits to a related file converge to a single coherent state at the collaboration layer; the open document consumes that converged state and performs no separate read-side conflict resolution.
- **Project-membership access; no per-file authorization needed** (verified 2026-07-05): access is authorized at the project level (collab rooms are authorized by `projectId`/`yjsStateId` via project membership; there is no per-file ACL), and the dependency graph is project-scoped. A user with any document open in a project may already read every file in that project, so the backend relevant-change notifications (signals, deltas, or resolved context about related files) require no additional per-file authorization filtering and introduce no cross-project disclosure path. If per-file access control is ever introduced, the notification layer must re-gate on it.
</content>
