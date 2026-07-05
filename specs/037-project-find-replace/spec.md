# Feature Specification: Project-Wide Find and Replace Panel

**Feature Branch**: `037-project-find-replace`

**Created**: 2026-07-05

**Status**: Draft

**Input**: User description: "Add a find and replace panel for the entire project. It must be located in a panel to the left of the editor the same way the file tree and outline behave and look (it will be another tab for the left panel). Also make the find and replace panel within the editor look consistent with the rest of the page and this new left panel."

## Clarifications

### Session 2026-07-05

- Q: What is the true scope of "entire project" for search and replace? → A: All text files in the project (not just include-reachable files).
- Q: How much review/control should a replace give the user before changes are committed? → A: Per-match selective — each match shows before/after context and can be individually included/excluded, in addition to replace-this / replace-file / replace-all, with scope confirmation for project-wide replaces.
- Q: Which matching modes must the v1 search support? → A: Plain literal matching with case-sensitivity and whole-word toggles, plus a regular-expression mode. (Superseded below.)
- Q: Should the left-panel search let the user narrow its scope, or always search the whole project? → A: Always whole-project; single-file find stays in the in-editor panel.
- Decision (post-clarify): Regular-expression matching is **in scope** and MUST be implemented under an explicit safety bar — a linear-time evaluation with no catastrophic backtracking (ReDoS), pre-execution pattern validation, per-file/total budgets, cancellability, and an explicit capture-group replacement syntax. See FR-006, FR-006a–FR-006d. This supersedes the earlier "regex out of scope for v1" answer.
- Q: How should a completed project-wide replace be reversible? → A: Per-file editor undo — each affected file's change is undoable through its normal (collaborative) editor undo history; there is no dedicated atomic bulk-undo. Preview + scope confirmation remain the primary safeguard.
- Q: Which files make up the searchable/replaceable set for "all text files"? → A: Any file whose content decodes as text, detected by content sniffing regardless of file extension; binary/attachment files are excluded.
- Q: How should very large result sets be capped for display? → A: Show up to ~1,000 matches, always display the true total match count, and prompt the user to refine the query to see the rest.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Search across every file in the project (Priority: P1)

A user working on a multi-file document set wants to find everywhere a word, phrase, or attribute appears — not just in the file they currently have open. They open a new "Search" tab in the left panel (alongside Files and Outline), type a query, and see a list of every matching occurrence across all files in the project, grouped by file, with enough surrounding context to recognize each match. Clicking a result opens that file and moves the cursor to the exact match.

**Why this priority**: Project-wide search is the foundational capability and delivers value on its own even without replace. Authors of large, cross-referenced AsciiDoc projects frequently need to locate content that lives in files they don't currently have open. This is the minimum viable slice.

**Independent Test**: Can be fully tested by entering a query that appears in several files, confirming the results list shows all occurrences grouped by file with a total count, and confirming that activating a result navigates to and highlights the correct location. Delivers value with no replace capability present.

**Acceptance Scenarios**:

1. **Given** a project with the term "changelog" in three different files, **When** the user opens the Search tab and enters "changelog", **Then** the panel lists every occurrence grouped under its file with a total match count and a per-file count.
2. **Given** a results list, **When** the user clicks a specific result, **Then** the corresponding file opens in the editor and the cursor/selection is placed on that match, scrolled into view.
3. **Given** an active query, **When** the user toggles case-sensitive matching, **Then** the results update to reflect only matches respecting the chosen casing.
4. **Given** a query that matches nothing, **When** the search completes, **Then** the panel shows a clear "no results" state rather than an empty ambiguous area.
5. **Given** the currently open file has unsaved in-editor changes, **When** the user searches, **Then** results for that file reflect its current on-screen content, consistent with what the user sees.
6. **Given** regex mode is enabled, **When** the user enters a valid pattern, **Then** matches across the project reflect the pattern; **and When** the user enters an invalid pattern or a known catastrophic-backtracking pattern, **Then** the panel shows an inline error (invalid) or returns bounded results without hanging (expensive), never blocking the interface or other users.

---

### User Story 2 - Replace matches across the project (Priority: P2)

After finding matches, the user wants to replace some or all of them with new text in a single controlled operation, including in files they do not currently have open. They enter replacement text, review what will change (each match shows its before/after context), choose to replace an individual match, all matches in one file, or all matches everywhere, and the changes are applied and persisted to every affected file.

**Why this priority**: Replace is the higher-value action but depends on search existing first. Bulk edits across many files (renaming a product, updating a URL, fixing a recurring typo) are error-prone by hand; a reviewed, controlled replace saves significant time. It is P2 because search alone is already shippable.

**Independent Test**: Can be tested by searching for a term present in multiple files, entering replacement text, applying "replace all," and verifying every occurrence in every file was updated and persisted, while non-matching content is untouched. Also tested by replacing a single selected match and confirming only that one occurrence changed.

**Acceptance Scenarios**:

1. **Given** a search with matches in several files, **When** the user enters replacement text and chooses "replace all," **Then** every match across all files is replaced, the changes are persisted, and the results list updates to reflect that those matches are resolved.
2. **Given** a results list, **When** the user chooses to replace a single match, **Then** only that occurrence changes and all other matches remain.
3. **Given** the user is about to replace many matches across many files, **When** they trigger "replace all," **Then** the system presents the scope of the change (how many matches in how many files) before committing.
4. **Given** a replace operation on a file another collaborator is editing at the same time, **When** the replacement is applied, **Then** the change merges into that file's live content without discarding the collaborator's concurrent edits.
5. **Given** a replacement has been applied, **When** the user reviews the affected files, **Then** the change is recorded in the project's activity/audit history the same way other content changes are.
6. **Given** a replacement was applied to a file, **When** the user opens that file and invokes undo, **Then** the replacement is reverted through the file's normal editor undo history (there is no single atomic bulk-undo across all affected files).

---

### User Story 3 - Consistent, integrated find/replace styling (Priority: P3)

A user invokes find/replace inside the editor itself (for quick single-file work) and expects it to look and feel like the rest of the application — the same colors, controls, spacing, icons, and dark/light theming as the new Search tab and the existing Files and Outline panels — rather than an unstyled, out-of-place widget. The new left-panel Search tab likewise adopts the exact visual and interaction patterns already established by the Files and Outline tabs.

**Why this priority**: This is a polish and cohesion story. The functional value is delivered by Stories 1 and 2; this ensures the feature does not feel bolted on. It is independently valuable because it improves the existing in-editor search experience even before project-wide search is used.

**Independent Test**: Can be tested by opening the in-editor find/replace and visually confirming it matches the application's theme tokens, control styling, and dark/light behavior, and by confirming the Search tab is visually indistinguishable in framing (rail icon, active-tab indicator, header, spacing) from the Files and Outline tabs.

**Acceptance Scenarios**:

1. **Given** the editor is open, **When** the user opens the in-editor find/replace, **Then** its inputs, buttons, icons, and colors match the application's design system in both light and dark themes.
2. **Given** the left panel, **When** the user switches between Files, Outline, and Search tabs, **Then** the Search tab uses the same rail icon treatment, active-tab indicator, header, and spacing conventions as the other tabs.
3. **Given** the user collapses or re-selects the left panel, **When** the Search tab is active, **Then** it collapses, restores, and remembers its selected state exactly as the Files and Outline tabs do.

---

### Edge Cases

- **No query / empty query**: The panel shows an idle prompt state and performs no search.
- **Very large result sets**: When a query matches an extremely large number of occurrences, results remain navigable (e.g., grouped, counted, and progressively presented) without freezing the interface, and the user is informed if results were capped.
- **Literal vs regex mode**: In literal mode, characters like `.`, `*`, `[`, or `\` are matched verbatim; in regex mode they are pattern syntax. Toggling the mode re-evaluates the current query under the new semantics.
- **Invalid regex pattern**: In regex mode, an invalid pattern shows a clear inline error and executes nothing.
- **Runaway / expensive pattern**: A pattern that would otherwise be expensive across the whole project stays bounded by the linear-time evaluation and the configured budgets; it never hangs the interface or a shared server process, and the user is told when results were bounded by a limit.
- **Overlapping / shifting matches during replace**: Applying a replacement that changes text length must not corrupt or skip adjacent matches in the same file.
- **Replacement text equals search text**: A no-op replacement is handled gracefully (no spurious change records).
- **Insufficient permission**: Access is project-scoped, not per-file. A non-member is denied the whole search/replace operation (errored and logged); a view-only member may search but has replace denied as a single whole-operation denial. There is no silent per-file permission exclusion.
- **Non-text or unsupported files**: Files that are not text content are excluded from search and replace.
- **Concurrent structural changes**: If a file is renamed, moved, or deleted between search and replace, that stale match is skipped and the user is informed rather than the operation failing wholesale.
- **Search while a file is open and dirty**: The open file's live, on-screen content (including unsaved edits) is what is searched and replaced for that file, so results never contradict what the user sees.
- **Concurrent collaborative edits**: Replaces on files being edited by others merge rather than overwrite.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The left panel MUST offer a third tab, "Search", presented alongside the existing Files and Outline tabs using the same rail, tab-selection, header, and collapse behavior.
- **FR-002**: The Search tab's selected/active state MUST be remembered across sessions in the same manner as the existing left-panel tab preference.
- **FR-003**: Users MUST be able to enter a search query and see every matching occurrence across all text files in the project, not only the currently open file and not limited to files reachable through the include graph. (Which files count as "text" is defined by FR-003b.)
- **FR-003a**: The Search tab MUST always operate at project-wide scope; it does not offer a scope selector. Single-file find/replace remains the responsibility of the in-editor panel.
- **FR-003b**: The searchable/replaceable set MUST include every project file whose content decodes as text, determined by content detection rather than file extension; files that do not decode as text (binaries, images, attachments) MUST be excluded from both search and replace.
- **FR-004**: Search results MUST be grouped by file and MUST show, for each match, enough surrounding context (e.g., the line/snippet) to identify it, plus a total match count and per-file counts.
- **FR-005**: Users MUST be able to activate any result to open its file and place the cursor/selection on the exact match, scrolled into view.
- **FR-006**: The search MUST support plain literal matching with a case-sensitivity toggle and a whole-word toggle, and MUST additionally support a user-toggleable regular-expression matching mode. The whole-word toggle applies to literal mode; in regex mode word boundaries are expressed in the pattern (`\b`).
- **FR-006a**: User-supplied regular expressions MUST be evaluated with a linear-time strategy that is not subject to catastrophic backtracking (ReDoS). The project-wide search path MUST NOT run user-supplied patterns through a backtracking evaluation, so no pattern can cause exponential/runaway matching regardless of input.
- **FR-006b**: The system MUST validate and compile a user-supplied pattern before executing any search with it, and MUST show a clear inline error for an invalid pattern instead of running, retrying, or hanging.
- **FR-006c**: Regex evaluation MUST be bounded and cancellable: explicit limits on pattern length, per-file evaluation time/size, and total matches, and the ability to abort an in-progress sweep. When a limit or cap is reached, the search MUST stop safely and inform the user rather than degrading responsiveness for that user or for other collaborators sharing the service.
- **FR-006d**: Regex replacement MUST use an explicit, documented substitution syntax (numbered and/or named capture-group references, with a literal escape for the reference character). References to capture groups that do not exist MUST be rejected with a clear message, and all non-reference characters MUST be treated literally.
- **FR-007**: When the currently open file has unsaved in-editor changes, search and replace for that file MUST operate on its live on-screen content so results are consistent with what the user sees.
- **FR-008**: Users MUST be able to enter replacement text and replace an individual match, all matches within a single file, or all matches across the entire project.
- **FR-008a**: Each match MUST display its before/after context for the entered replacement text, and the user MUST be able to individually include or exclude any match from a bulk replace, so a "replace all" acts on the user's current selection rather than blindly on every occurrence.
- **FR-009**: Before committing a project-wide replace, the system MUST communicate the scope of the change (number of matches and number of affected files, reflecting any per-match exclusions) so the user can confirm.
- **FR-010**: Replacements MUST be applied and persisted to every affected file, including files the user does not currently have open.
- **FR-011**: Replacements applied to a file that is being collaboratively edited MUST merge into that file's live content without discarding other users' concurrent edits.
- **FR-012**: Replacements MUST be recorded in the project's existing activity/audit history the same way other content changes are.
- **FR-013**: Access is **project-scoped, not per-file**. Any project member MAY search across all of the project's files; a member with edit rights (editor/owner) MAY replace across them. A non-member is denied the whole search/replace operation, and a view-only member is denied replace as a whole operation — there is no silent per-file permission filtering. Authorization denials MUST be logged.
- **FR-014**: The in-editor (single-file) find/replace UI MUST be restyled to match the application's design system — same theme tokens, control styling, iconography, spacing, and dark/light behavior as the rest of the page and the new left-panel Search tab.
- **FR-015**: The panel MUST present clear idle, in-progress, no-results, and error states so the user always understands the current status of a search or replace.
- **FR-016**: The system MUST cap the displayed results at approximately 1,000 matches while always showing the true total match count, and MUST prompt the user to refine the query to reach matches beyond the cap, keeping the interface responsive for large result sets.
- **FR-017**: If a match becomes stale (its file was moved, renamed, deleted, or its content changed) before a replace is applied, the system MUST skip that match safely and inform the user rather than failing the whole operation.
- **FR-018**: Each affected file's replacement MUST be undoable through that file's normal (collaborative) editor undo history. The system does not provide a dedicated atomic bulk-undo across files; the per-match preview and project-wide scope confirmation are the primary safeguards against unwanted changes.

### Key Entities *(include if data involved)*

- **Search Query**: The user's search text plus its matching mode and options — literal-or-regex mode, case sensitivity, and whole word. Drives which occurrences are considered matches; in regex mode it also carries the compiled/validated pattern and, for replacement, the capture-group substitution template.
- **Match / Result**: A single occurrence of the query within a file, identified by its file, its location within that file, and a surrounding context snippet used for display and navigation.
- **File Group**: The collection of matches within one file, carrying the file's identity/path and its match count, used to organize the results list.
- **Replacement Operation**: The action of substituting matched text with the user-provided replacement across a chosen scope (one match, one file, or the whole project), producing persisted content changes and an audit record.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can locate all occurrences of a term spread across multiple files in the project without opening those files individually, from a single Search tab.
- **SC-002**: For a typical project, a search feels interactive — results begin appearing promptly after the query is entered (target on the order of ~1 second), verified qualitatively rather than as a hard latency SLA.
- **SC-003**: Activating a result places the cursor on the correct match in the correct file at least 99% of the time (no off-by-location navigation).
- **SC-004**: A project-wide "replace all" updates 100% of the shown, in-scope matches and leaves all non-matching content unchanged, verifiable by re-running the same search and finding zero remaining matches.
- **SC-005**: No replacement operation discards a concurrent collaborator's unsaved edits to an affected file.
- **SC-006**: In a blind visual comparison, users cannot distinguish the Search tab's framing from the Files and Outline tabs, and the in-editor find/replace is judged visually consistent with the rest of the application in both light and dark themes.
- **SC-007**: The left panel remembers the Search tab as the active tab across a page reload with 100% reliability, matching the existing tabs' behavior.
- **SC-008**: No user-supplied query — including any regular expression — can hang the interface or measurably degrade responsiveness for other collaborators; worst-case evaluation stays within the configured time/size budgets, verifiable by submitting known ReDoS-style patterns and observing bounded, non-blocking behavior.

## Assumptions

- **"Entire project" means every text-decodable file in the project**, not only files reachable through the include graph from a root document. Membership is decided by content detection (does it decode as text), not by file extension; binary/attachment files are excluded from both search and replace.
- **Replace is a reviewed, user-controlled action**, not silent auto-replace: the user always initiates individual, per-file, or project-wide replacement explicitly, and project-wide replacement surfaces its scope for confirmation before committing.
- **Existing permission, collaboration, persistence, and audit mechanisms are reused** for reading and writing file content; this feature does not introduce a new permission model or bypass collaborative editing.
- **The in-editor find/replace keeps its existing behavior and keyboard shortcuts**; only its appearance is changed to match the design system. Making it project-aware is out of scope for the in-editor widget — project-wide operations live in the left-panel Search tab.
- **The new Search tab reuses the established left-panel patterns** (rail icon, active indicator, collapse/restore, remembered selection) so it behaves and looks like Files and Outline by construction.
- **Displayed results are capped at ~1,000 matches** to keep very large result sets responsive; the true total is always shown and the user is prompted to refine the query to reach the rest.
- **Reversibility is per-file, not atomic across files**: an applied replace is undone through each affected document's own editor undo history; there is no single-action rollback of a multi-file replace. This is an accepted tradeoff to avoid racy cross-file rollback in a live collaborative environment, with preview + confirmation as the pre-commit safeguard.
- **Regular-expression search is in scope**, subject to the safety bar in FR-006a–FR-006d. The safety-critical assumption is that project-wide regex is evaluated with a linear-time engine (i.e., one without catastrophic backtracking, and therefore without backreferences/lookaround); dropping those rarely-needed constructs is an accepted tradeoff for guaranteed non-runaway evaluation.
- **The in-editor single-file find/replace may keep its existing regex behavior**, since it is bounded to one open document and one user's session; the linear-time and budget requirements above are specifically about the shared, project-wide path.
