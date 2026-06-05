# Feature Specification: AsciiDoc Code Editor

**Feature Branch**: `014-codemirror-editor`

**Created**: 2026-06-04

**Status**: Draft

**Input**: User description: "Phase 6 - Code editor (CodeMirror 6, AsciiDoc Lezer grammar, editor chrome)"

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Edit an AsciiDoc File with Syntax Highlighting (Priority: P1)

A project member opens any AsciiDoc file and immediately sees a rich editing experience: the raw text is displayed in a code editor with AsciiDoc constructs visually distinguished by colour — headings, bold/italic text, delimited blocks, tables, attribute references, macros, footnotes, equations, and inline code all render with distinct visual styling. The editor replaces the previous read-only content view for editable files.

**Why this priority**: Syntax highlighting is the foundation of all editor value. It ships independently of language features, auto-save, or editor chrome, and immediately differentiates the editor from the prior plain-text viewer.

**Independent Test**: A user opens a `.adoc` file containing headings, a code block, a table, and bold text. The heading markers (`=`), block delimiters (`----`, `====`, `|===`), bold markers (`*`), and comment lines (`//`) are each styled distinctly from body text. The user can type freely and the highlighting updates live.

**Acceptance Scenarios**:

1. **Given** a `.adoc` file is selected in the tree, **When** it loads in the main panel, **Then** the content is displayed in a code editor (not a plain-text area) with AsciiDoc syntax highlighted.
2. **Given** the editor is active, **When** the user types a heading marker (`= `, `== `, etc.), **Then** the heading is highlighted with the appropriate style immediately, without any lag.
3. **Given** a delimited block (e.g., `----` code block, `====` example block), **When** it appears in the editor, **Then** the block delimiter lines and their content are styled differently from surrounding prose.
4. **Given** a table (`|===` delimiter with rows and cells), **When** present in the document, **Then** the table delimiters, column specs, and cell separators are highlighted as distinct tokens.
5. **Given** an attribute reference (e.g., `{doc-version}`), a footnote call, or a STEM block, **When** present in the document, **Then** each is highlighted as a distinct token type.
6. **Given** the user is on a non-AsciiDoc file (e.g., `.txt`, `.json`), **When** the file loads, **Then** the editor renders without AsciiDoc-specific highlighting (plain text or language-appropriate highlighting).

---

### User Story 2 — Edit and Auto-Save Changes (Priority: P1)

A project member edits a file and their changes are persisted automatically without any explicit save action. A visual indicator in the editor chrome shows whether the current state has been saved. The user never loses work due to accidental navigation away from the page.

**Why this priority**: Auto-save is table stakes for a browser-based editor. Users expect it to match tools like Google Docs. Without it, users are at risk of losing work, which would undermine trust in the product.

**Independent Test**: A user types several words into a file, waits a moment, then refreshes the page. The changes are visible after reload. The editor shows a "saved" state indicator after the 4-second debounce period elapses.

**Acceptance Scenarios**:

1. **Given** the user has edited a file, **When** they stop typing for the configured debounce period (default: 4 s), **Then** the changes are persisted to the backend and the save indicator shows "saved."
2. **Given** the user is actively typing, **When** changes are not yet persisted, **Then** the save indicator shows "unsaved changes."
3. **Given** a save is in progress, **When** the request is pending, **Then** the save indicator shows "saving…"
4. **Given** the user navigates away from the file while unsaved changes exist within the debounce window, **When** the browser would lose the changes, **Then** a confirmation prompt warns the user before they leave.
5. **Given** a save request fails (e.g., network error), **When** the error occurs, **Then** the editor shows a persistent error indicator and retains the unsaved content locally until a retry succeeds.
6. **Given** two members have the same file open, **When** one saves, **Then** the other's editor displays a non-blocking notice that the file was updated externally, and their in-progress edits are not silently overwritten.

---

### User Story 3 — Navigate the Document with Section Outline (Priority: P2)

An author working on a long AsciiDoc document uses the editor's section navigation feature to jump between headings without scrolling. A panel or command shows all headings in the current file with their hierarchy, and clicking any heading scrolls the editor to that line.

**Why this priority**: Long technical documents can span hundreds of pages. Section navigation is essential for productive editing of real-world documents and is a key differentiator over plain-text editors.

**Independent Test**: A user opens a file with five headings at different levels. The section navigation panel lists all five in order. Clicking the third heading scrolls the editor so that heading is at the top of the visible area.

**Acceptance Scenarios**:

1. **Given** an AsciiDoc file with multiple headings, **When** the user opens the section outline, **Then** all headings are listed with their hierarchy preserved (indented by level).
2. **Given** the outline is visible, **When** the user clicks a heading, **Then** the editor scrolls to that heading and the cursor moves to that line.
3. **Given** the user types a new heading or removes an existing one, **When** the change is made, **Then** the outline updates to reflect the current document structure without requiring a manual refresh.
4. **Given** a document with no headings, **When** the outline is opened, **Then** an empty-state message indicates there are no sections to navigate.

---

### User Story 4 — Find and Replace Text (Priority: P2)

An author uses a find-and-replace panel within the editor to locate occurrences of a word or pattern and optionally replace them. The panel supports plain text and regular expressions.

**Why this priority**: Find and replace is a fundamental editing operation. It is required by FR-FR-001–FR-FR-006 and essential for any editing task involving renaming attributes, fixing repeated errors, or refactoring document content.

**Independent Test**: A user opens the find bar (keyboard shortcut), types a search term, sees all matches highlighted in the document, navigates between matches, enters a replacement, and replaces all occurrences. The document reflects all changes.

**Acceptance Scenarios**:

1. **Given** the editor is focused, **When** the user triggers the find shortcut, **Then** a find panel appears at the top or bottom of the editor.
2. **Given** a search term is entered, **When** matches exist in the document, **Then** all matches are highlighted and a match count is shown (e.g., "3 of 7").
3. **Given** the find panel is open, **When** the user enables the regex toggle and enters a valid regex, **Then** matches are found and highlighted according to the regex.
4. **Given** a replacement string is entered, **When** the user clicks "Replace" or "Replace All," **Then** the current match or all matches are replaced and the document updates accordingly.
5. **Given** an invalid regex is entered, **When** the regex toggle is active, **Then** the field shows an error indicator without crashing the editor.

---

### User Story 5 — Insert AsciiDoc Constructs via Toolbar (Priority: P2)

An author uses the editor toolbar to insert common AsciiDoc constructs without memorising syntax. Clicking a toolbar button wraps selected text or inserts a ready-to-fill snippet at the cursor position. The toolbar is logically grouped so formatting, blocks, lists, and advanced constructs are easy to discover.

**Why this priority**: AsciiDoc syntax is not universally known. A toolbar lowers the barrier to entry for authors new to the format and speeds up common operations for experienced users. It is a primary differentiator from a raw text editor.

**Independent Test**: A user selects a word, clicks the "Bold" toolbar button, and the word is wrapped in `*asterisks*`. A user clicks "Code Block" with no selection and an empty listing block snippet is inserted at the cursor.

**Acceptance Scenarios**:

1. **Given** text is selected in the editor, **When** the user clicks a formatting button (bold, italic, monospace, highlight, subscript, superscript), **Then** the selected text is wrapped with the appropriate AsciiDoc delimiters.
2. **Given** no text is selected, **When** the user clicks a block button (code block, example block, sidebar, blockquote, admonition, STEM block, comment block), **Then** a ready-to-fill block snippet is inserted at the cursor position.
3. **Given** a list button is clicked, **When** the cursor is inside a paragraph, **Then** the current line is converted to the appropriate list item format (ordered, unordered, or checklist).
4. **Given** the user clicks the "Cross-reference" toolbar button, **When** a dialog prompts for the target ID, **Then** an `<<target-id>>` reference is inserted at the cursor.
5. **Given** the user clicks the "Footnote" button, **When** the footnote text is entered, **Then** the inline footnote macro is inserted and the cursor returns to the document.
6. **Given** the user clicks "Image," **When** a file picker or URL input is completed, **Then** the appropriate `image::` or `image:` macro is inserted.
7. **Given** any toolbar button, **When** the user hovers over it, **Then** a tooltip shows the button's name and keyboard shortcut (if one exists).

---

### User Story 6 — Use Productivity and Accessibility Features (Priority: P3)

An author benefits from productivity features built into the editor: multiple cursor positions for simultaneous edits, code folding to collapse lengthy blocks, a document minimap for spatial navigation, and keyboard-centric operation throughout. These features reduce friction for power users accustomed to professional editors.

**Why this priority**: These features (FR-ED-003, FR-ED-004, FR-EC-004, FR-AC-001–FR-AC-003) deliver value incrementally on top of the core editing experience. They can ship after the primary editing loop (stories 1–5) is solid.

**Independent Test**: A user creates two cursor positions using the editor's multi-cursor shortcut, types text that appears at both positions simultaneously. Separately, a user folds a delimited block so only its delimiter line is visible. The minimap shows a scaled representation of the document and clicking it scrolls the editor.

**Acceptance Scenarios**:

1. **Given** the editor is active, **When** the user adds a second cursor using the designated shortcut, **Then** both cursors accept simultaneous input and produce output at both positions.
2. **Given** a delimited block is visible in the editor, **When** the user triggers the fold action on that block, **Then** the block collapses to a single line with a fold indicator.
3. **Given** a folded block, **When** the user clicks the fold indicator or triggers unfold, **Then** the block expands and its full content is visible again.
4. **Given** the minimap is visible, **When** the user clicks a region of the minimap, **Then** the editor scrolls to the corresponding document position.
5. **Given** the user relies solely on the keyboard, **When** they navigate menus, panels, and editor controls, **Then** all interactive elements are reachable and operable without a pointer device.

---

### User Story 7 — Customise Editor Appearance (Priority: P3)

A user adjusts the editor's font size and selects a high-contrast theme to meet their visual preferences or accessibility needs. Their preferences are remembered across sessions.

**Why this priority**: Accessibility (FR-AC-001–FR-AC-003) is important for inclusivity. Font size and contrast are the two highest-impact options for users with visual needs (FR-EC-005, FR-EC-006); they are grouped as lower priority only because core editing must work first.

**Independent Test**: A user opens editor settings, increases the font size, and sees the editor text grow immediately. The user enables high-contrast mode and the editor colour scheme changes. A page reload confirms both preferences persist.

**Acceptance Scenarios**:

1. **Given** the editor settings panel, **When** the user adjusts the font size, **Then** the editor text size changes immediately without a reload.
2. **Given** the editor settings, **When** the user selects a high-contrast theme, **Then** the editor colours switch to the high-contrast palette and all text remains readable.
3. **Given** the user set preferences in a previous session, **When** they open the editor again, **Then** their font size and theme preferences are applied automatically.
4. **Given** the high-contrast theme is active, **When** syntax highlighting is visible, **Then** all token types remain distinguishable from each other and from the background.

---

### User Story 8 — Auto-Complete AsciiDoc Constructs (Priority: P3)

An author types partial attribute references, include paths, and cross-reference targets and receives contextual suggestions. Selecting a suggestion completes the construct without requiring the author to remember exact names or paths.

**Why this priority**: Completion reduces errors and speeds up authoring of structured documents. It depends on language-feature infrastructure built in earlier stories and is best delivered once core editing is stable.

**Independent Test**: A user types `{doc` in the editor and sees a dropdown listing `{doc-version}` and other matching attributes defined in the file header and built-in AsciiDoc attributes. Selecting one inserts the full attribute reference. A user types `include::docs/` and sees a dropdown of matching files from the project.

**Acceptance Scenarios**:

1. **Given** the user types `{` followed by partial text, **When** matching attribute names exist (document-defined or built-in AsciiDoc attributes), **Then** a completion dropdown appears listing the matches.
2. **Given** the user types `include::` followed by a partial path, **When** matching file paths exist in the project, **Then** a completion dropdown appears with relative paths to matching files.
3. **Given** the user types `<<` followed by partial text, **When** matching section IDs or explicit anchor IDs exist in the document, **Then** a completion dropdown lists matching cross-reference targets.
4. **Given** a completion dropdown is visible, **When** the user presses Tab or Enter, **Then** the selected item is inserted and the dropdown closes.
5. **Given** a completion dropdown is visible, **When** the user presses Escape, **Then** the dropdown closes without inserting anything.

---

### User Story 9 — Navigate to Referenced Files and Links (Priority: P2)

An author holds Ctrl and clicks on an `include::` path, a cross-reference, or a URL in the editor. Files within the current project open in the main editor panel (the file tree selection updates accordingly); external URLs open in a new browser tab.

**Why this priority**: Ctrl+click navigation (FR-LF-006, FR-LF-007) is a standard code-editor idiom. It lets authors trace document structure — jumping from a master file to a referenced chapter — without leaving the keyboard to click through the file tree.

**Independent Test**: Open a file containing `include::chapters/intro.adoc[]`. Hold Ctrl and click the path. The file tree selects `chapters/intro.adoc` and the editor loads its content, replacing the current view.

**Acceptance Scenarios**:

1. **Given** the cursor is over an `include::` path, **When** the user Ctrl+clicks it, **Then** the file tree navigates to that file and the editor loads it in the main panel.
2. **Given** the cursor is over a cross-reference (`<<target>>` or `xref:target[]`) that resolves to a file in the project, **When** the user Ctrl+clicks it, **Then** the editor navigates to that file.
3. **Given** the cursor is over a `link:` URL or bare HTTP/HTTPS URL, **When** the user Ctrl+clicks it, **Then** the URL opens in a new browser tab and the current editor state is unaffected.
4. **Given** an `include::` path that does not exist in the project, **When** the user Ctrl+clicks it, **Then** a non-blocking notice informs the user the file was not found; no navigation occurs.
5. **Given** a path that would escape the project (an absolute path or `../` traversal), **When** the user Ctrl+clicks it, **Then** navigation is silently suppressed, consistent with FR-LF-005.

---

### Edge Cases

- What happens when a very large file (> 1 MB) is opened? The editor must load without freezing the browser tab; rendering may be deferred or virtualised for off-screen content.
- What if the AsciiDoc grammar encounters an unterminated block (no closing delimiter)? The parser must recover gracefully and continue highlighting the rest of the document.
- What if two members save conflicting changes simultaneously? The system must not silently overwrite one user's work; the later save wins and the other user receives a non-blocking notice.
- What if the user pastes very large content in a single operation? Auto-save debouncing must handle this correctly without flooding the backend.
- What if the browser tab goes offline mid-edit? The editor should queue pending saves and retry when connectivity is restored, maintaining the unsaved-changes indicator.
- What happens when the user closes the browser tab with changes within the debounce window? A best-effort save should be attempted on the unload event.
- What if an include path in a completion suggestion refers to a file the user cannot access (wrong project)? The suggestion must not expose paths outside the current project sandbox (FR-LF-005).
- What if a STEM block contains LaTeX that is too complex to parse? The block should be highlighted as a STEM block boundary without attempting to render the equation in the editor.

---

## Requirements *(mandatory)*

### Functional Requirements

**Editing Core**

- **FR-ED-001**: The editor MUST replace the read-only file content panel for all text-based files when the user has editor or owner role on the project, or administrator role at the application level.
- **FR-ED-002**: The editor MUST render AsciiDoc syntax with visual token differentiation for all of the following constructs:
  - Document title and preamble
  - Section headings (levels 1–5)
  - Bold, italic, monospace, highlight, subscript, and superscript inline formatting
  - Delimited blocks: listing (code), example, sidebar, quote (blockquote), passthrough, open
  - STEM / equation blocks (`[stem]`, `[latexmath]`, `[asciimath]` with their delimiters)
  - Comment lines (`//`) and comment blocks (`////`)
  - Attribute references (`{attr-name}`) and attribute entries (`:attr-name: value`)
  - Block and inline macros (image, video, audio, btn, kbd, link, etc.)
  - Cross-references (`<<target>>` and `xref:target[]`)
  - Footnotes (`footnote:[text]` and `footnoteref:[id,text]`)
  - Ordered lists, unordered lists, checklist items (`* [ ]`, `* [x]`)
  - Description lists (standard, horizontal, Q&A)
  - Table syntax (`|===` delimiter, column spec rows, cell separators `|`)
  - Admonition paragraphs and blocks (NOTE, TIP, WARNING, IMPORTANT, CAUTION)
- **FR-ED-003**: The editor MUST support simultaneous multiple cursor positions.
- **FR-ED-004**: The editor MUST support code folding for delimited blocks and section content.
- **FR-ED-005**: Users with viewer role MUST see a read-only, syntax-highlighted version of the editor rather than a plain-text view.

**Auto-Save**

- **FR-AS-001**: The editor MUST automatically persist changes to the backend after a debounce period of inactivity. The debounce period MUST be configurable at the application level; the default value is 4 seconds.
- **FR-AS-002**: The editor chrome MUST display one of three save states at all times: "saved," "saving…," and "unsaved changes."
- **FR-AS-003**: The editor MUST warn the user before navigation that would discard unsaved changes within the debounce window.
- **FR-AS-004**: On save failure, the editor MUST retain the unsaved content and display a persistent error indicator with a retry mechanism.
- **FR-AS-005**: When a file is updated externally (another user saved), the editor MUST notify the current user with a non-blocking notice without discarding their in-progress edits.
- **FR-AS-006**: When the user closes or navigates away from the browser tab with unsaved changes, the editor MUST attempt a best-effort save using a `keepalive: true` fetch on the `beforeunload` event, in addition to displaying the navigation confirmation prompt (FR-AS-003).
- **FR-AS-007**: When the browser goes offline (detected via `navigator.onLine` and the `offline` event), the editor MUST write pending unsaved content to `localStorage` under a per-file key. When connectivity is restored (detected via the `online` event), the queued content MUST be flushed automatically via a PUT request. If the tab was closed while offline, the editor MUST detect the stored draft on next open and offer the user a recovery prompt to restore or discard it.

**Find and Replace**

- **FR-FR-001**: The editor MUST provide a find panel accessible via keyboard shortcut.
- **FR-FR-002**: The find panel MUST highlight all matches in the document and display a match count.
- **FR-FR-003**: The find panel MUST support navigation between individual matches (next/previous).
- **FR-FR-004**: The find panel MUST support a replace field for single and bulk replacements.
- **FR-FR-005**: The find panel MUST support regular expression search with a visible regex toggle.
- **FR-FR-006**: The find panel MUST display a validation error for invalid regular expressions without disrupting the editor.

**Language Features**

- **FR-LF-001**: The editor MUST provide a section outline showing all headings in the current document with their hierarchy level.
- **FR-LF-002**: Clicking a heading in the section outline MUST scroll the editor to the corresponding line.
- **FR-LF-003**: The section outline MUST update live as the user edits headings.
- **FR-LF-004**: The editor MUST provide auto-completion for:
  - Attribute references (`{...}`): document-defined attributes and standard built-in AsciiDoc attributes.
  - Include paths (`include::...`): files and folders within the current project, matched by partial path.
  - Cross-reference targets (`<<...>>`): section IDs and explicit anchor IDs defined within the current document.
- **FR-LF-005**: Include path completions MUST be scoped to the current project and MUST NOT expose paths from other projects or the host filesystem.
- **FR-LF-006**: Ctrl+clicking an `include::` path or a cross-reference (`<<>>`, `xref:`) that resolves to a file within the current project MUST navigate the file tree to that file and load it in the editor panel, replacing the current view. If the path is unresolvable within the project, a non-blocking notice is shown. Paths that would escape the project boundary (absolute paths, `../` traversal) are silently suppressed.
- **FR-LF-007**: Ctrl+clicking a `link:` URL, bare HTTP/HTTPS URL, or any external resource reference in the document MUST open it in a new browser tab without affecting the current editor state.

**Editor Chrome**

- **FR-EC-001**: The editor MUST display a toolbar organised into logical groups, containing at minimum the following actions:

  *Text Formatting*: Bold, Italic, Monospace, Highlight, Subscript, Superscript

  *Structure*: Heading level (1–5), Ordered list, Unordered list, Checklist, Description list (standard, horizontal, Q&A)

  *Blocks*: Code block (listing), Example block, Sidebar, Blockquote, Admonition (NOTE, TIP, WARNING, IMPORTANT, CAUTION), STEM / equation block, Comment block

  *Inline / References*: Link, Cross-reference, Footnote, Image

- **FR-EC-002**: Each toolbar button MUST display a tooltip showing its name and keyboard shortcut on hover.
- **FR-EC-003**: The editor MUST display a status bar showing the current cursor line number, column number, and total line count.
- **FR-EC-004**: The editor MUST include a minimap (scaled document overview) displayed alongside the scroll gutter; clicking or dragging the minimap MUST scroll the editor to the corresponding position.
- **FR-EC-005**: The editor MUST provide a settings panel for font size adjustment and theme selection.
- **FR-EC-006**: The editor MUST offer at minimum two themes: a default theme that follows the application's current light/dark colour scheme, and a high-contrast accessibility theme.
- **FR-EC-007**: Editor preferences (font size, theme) MUST persist across browser sessions for the authenticated user.

**Accessibility**

- **FR-AC-001**: All editor panels, controls, and the editing surface itself MUST be fully operable by keyboard alone.
- **FR-AC-002**: Focus order MUST follow a logical reading order throughout the editor chrome.
- **FR-AC-003**: All interactive controls in the editor chrome MUST have accessible labels.

### Key Entities

- **EditorSession**: A user's active editing context for a specific file, holding the current document content, cursor state, and save state.
- **SaveState**: An enumeration — `saved | saving | unsaved | error` — representing the current persistence state of the open file.
- **AsciiDocToken**: A parsed syntax unit produced by the Lezer grammar and consumed by the highlighter (heading, block, inline mark, macro, attribute reference, table cell, footnote, STEM block, etc.).
- **SectionOutlineEntry**: A heading extracted from the parsed document tree, carrying its level (1–5), display text, and editor line position.
- **CompletionCandidate**: An item offered by auto-completion, carrying a label, kind (attribute | file-path | cross-reference), and the text to insert on acceptance.
- **EditorPreferences**: Per-user settings including font size (px) and selected theme name, persisted server-side or in durable browser storage.
- **OfflineDraft**: Content written to `localStorage` when the browser goes offline with unsaved edits, keyed by `asciidocollab:editor-draft:<fileNodeId>`. Cleared on successful save; surfaced as a recovery prompt on next open if the tab closed while offline.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can open a 500-line AsciiDoc file and see syntax highlighting applied within 500 ms of the file loading.
- **SC-002**: Typing in the editor produces no perceptible lag; keystrokes appear within one animation frame (< 16 ms) even on documents up to 5 000 lines.
- **SC-003**: Changes made in the editor are persisted without any manual save action; users report zero instances of lost work due to missing a save gesture.
- **SC-004**: 100% of editor chrome controls are reachable and operable via keyboard alone, verified by keyboard-only walk-through.
- **SC-005**: The section outline for a 50-heading document renders and updates in under 200 ms after a heading edit.
- **SC-006**: Users can adjust font size and switch to high-contrast mode in under 30 seconds on first use without any guidance.
- **SC-007**: The grammar parser recovers from any single syntax error and continues highlighting the remainder of the document without a visible re-parse delay.
- **SC-008**: Auto-completion suggestions appear within 300 ms of triggering a completion context (typing `{`, `include::`, or `<<`).
- **SC-009**: The minimap renders for documents up to 5 000 lines without causing a perceptible drop in editor frame rate.

---

## Assumptions

- **A-001**: The existing three-panel layout (file tree / content area / preview) remains the shell; this feature replaces the content area's read-only `FileContentPanel` with the CodeMirror editor for editable files.
- **A-002**: Real-time collaborative editing (FR-005) is explicitly out of scope for this phase. The auto-save implementation uses a last-write-wins strategy with a conflict notice for simultaneous saves, and will be replaced in the collaboration phase.
- **A-003**: The AsciiDoc Lezer grammar is authored specifically for this project, covering all constructs listed in FR-ED-002. Grammar edge cases in the full AsciiDoc specification not listed there (e.g., complex table column spec DSL, nested include chains) are deferred to future iterations.
- **A-004**: Vim and Emacs keybinding modes are out of scope. The default keybindings follow modern editor conventions (consistent with VS Code / standard browser editor patterns).
- **A-005**: Conflict detection for simultaneous saves surfaces as a non-blocking toast notification; the later-saved version wins. No merge UI is provided in this phase.
- **A-006**: Include directive resolution (following `include::path[]` to inline referenced file content) is deferred. The editor highlights include macros as a distinct token type and provides path completion (FR-LF-004), but does not inline referenced content into the editor buffer.
- **A-007**: The toolbar in FR-EC-001 organises actions into grouped sections or dropdown menus as needed to avoid overflow on standard desktop viewports. A full command palette is a post-launch enhancement.
- **A-008**: Mobile and touch editing is not a target for this phase; the editor is optimised for desktop browsers only.
- **A-009**: The auto-save debounce default of 4 seconds (FR-AS-001) is set at the application level by an administrator or via environment configuration; individual users cannot change it in this phase.
- **A-010**: STEM block rendering (displaying rendered equations in the preview panel) is handled by the existing AsciiDoc preview feature. The editor highlights STEM block syntax only; it does not render equations inline in the editor.
- **A-011**: PDF generation (FR-007) and Git integration (FR-010) are separate phases and are not touched by this feature.
