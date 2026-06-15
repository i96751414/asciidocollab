# Feature Specification: AsciiDoc Editor Enhancements

**Feature Branch**: `026-asciidoc-editor-enhancements`

**Created**: 2026-06-13

**Status**: Draft

**Input**: User description: "Improve the asciidoc editor by add more features: properly highlithing headers (there is a maximum header level); adding code folding for sections, sources, tables; adding source code highlighting in the editor according to the specific language; when adding a source code block also add the source declaration part before the block; you will also compare existing features of asciidoc highlighters (e.g. in VS code asciidoc plugin) and detect missing features on the current editor; there is also an issue with the editor caused by collapsing or expanding the HTML preview that must be fixed, whenever the preview is collapsed or expanded the editor looses its content; also add the line wrap option to the option in the editor (next to font size and theme)"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Editor no longer loses content when toggling the preview (Priority: P1)

A user is writing an AsciiDoc document in the editor. They collapse the HTML preview panel to gain more horizontal space, type some more, then expand the preview again to check the rendered output. Throughout this, every character they have written remains intact in the editor and the preview reflects it.

**Why this priority**: This is a correctness/data-loss defect. Losing the document a user is actively editing is the most damaging possible behavior and undermines trust in the entire tool. Until this is fixed, the other enhancements are decorative. It must ship first and independently.

**Independent Test**: Type a known block of text, collapse the preview, confirm the text is still present and editable; expand the preview, confirm the text is still present and the preview renders it. Repeat several times in succession.

**Acceptance Scenarios**:

1. **Given** a document with unsaved edited content, **When** the user collapses the HTML preview, **Then** the editor retains the full content and the cursor/selection remains usable.
2. **Given** a document with unsaved edited content, **When** the user expands the HTML preview, **Then** the editor still shows the full content and the preview renders the current content.
3. **Given** the user has toggled the preview open/closed multiple times, **When** they inspect the editor, **Then** no characters have been lost, duplicated, or reverted to an earlier server/saved version.
4. **Given** the user is in a real-time collaborative session, **When** they toggle the preview, **Then** their local content and other collaborators' presence/content remain consistent and uncorrupted.

---

### User Story 2 - Line wrap can be toggled from the editor options (Priority: P1)

A user working with long lines (e.g. long paragraphs or URLs) opens the editor settings panel and finds a "Line Wrap" toggle alongside the existing Font Size and Theme options. Toggling it on wraps long lines to the editor width; toggling it off lets lines extend with horizontal scrolling. The choice persists across sessions.

**Why this priority**: This is a small, self-contained, high-value usability control that the user explicitly requested. The underlying capability already exists but is not exposed in the options UI, so it is low-risk and quick to deliver.

**Independent Test**: Open the settings panel, confirm a Line Wrap control appears next to Font Size and Theme, toggle it both directions, and confirm the editor wrapping behavior changes accordingly and the setting survives a page reload.

**Acceptance Scenarios**:

1. **Given** the editor settings panel is open, **When** the user looks at the options, **Then** a Line Wrap toggle is shown together with Font Size and Theme.
2. **Given** Line Wrap is enabled, **When** a line exceeds the editor width, **Then** the line wraps to the next visual row with no horizontal scrollbar.
3. **Given** Line Wrap is disabled, **When** a line exceeds the editor width, **Then** the line stays on one row and horizontal scrolling is available.
4. **Given** the user has set a Line Wrap preference, **When** they reload the page or reopen the editor later, **Then** the previously chosen Line Wrap state is restored.

---

### User Story 3 - Headers highlighted at their effective level (up to the maximum) (Priority: P2)

A user writes section titles using `=` markers. Headings are styled by their **effective level** — the raw marker count adjusted by any `:leveloffset:` in effect at that point (set earlier in the same file, or inherited from an ancestor file in the include path, accumulating along the path from the main file). Each effective level is visually distinguished from the others and from body text. A line whose effective level exceeds the maximum valid heading level is NOT styled as a heading, signalling it is not a real section title. **Discrete headings** (`[discrete]` / legacy `[float]`) are also recognized and styled as headings even though they sit outside the section hierarchy.

**Why this priority**: Accurate header highlighting is core to the editing experience and helps authors immediately see document structure and catch malformed headings. It is foundational but not data-destructive, so it ranks below the data-loss fix and the explicitly requested line-wrap control.

**Independent Test**: Enter heading lines at each valid level and confirm each is visually distinct; set `:leveloffset: +1` and confirm subsequent headings shift one level; include a file from a parent that applies a leveloffset and confirm the included file's headings reflect the inherited offset; mark a heading `[discrete]` and confirm it is styled as a heading; enter a line whose effective level exceeds the maximum and confirm it is not styled as a heading.

**Acceptance Scenarios**:

1. **Given** the author types a heading at each valid level, **When** the editor renders highlighting, **Then** each valid level is visually distinguishable (and consistent with how the preview/renderer treats that level).
2. **Given** a line whose **effective** level (after `:leveloffset:`) exceeds the maximum valid heading level, **When** the editor renders highlighting, **Then** that line is not styled as a heading.
3. **Given** a heading marker is not followed by the required space before the title text, **When** highlighting is applied, **Then** the line is not treated as a heading (matching AsciiDoc rules).
4. **Given** a `:leveloffset:` entry (`+N`, `-N`, an absolute value, or an unset) appears before a heading in the same file, **When** highlighting is applied, **Then** the heading is styled at its offset-adjusted effective level.
5. **Given** a file is included from an ancestor file that set a `:leveloffset:` (directly or via the include's `leveloffset=` attribute) before the include, **When** the included file is shown in the editor, **Then** its headings are styled at the inherited, accumulated effective level.
6. **Given** a heading marked `[discrete]` (or `[float]`), **When** highlighting is applied, **Then** it is styled as a heading at its (offset-adjusted) level and is treated as outside the section hierarchy (e.g. not a foldable section / not a section-outline node), and is not rejected for breaking section sequence.

---

### User Story 4 - Sections, source blocks, and tables can be folded (Priority: P2)

A user working on a long document wants to collapse parts of it to navigate more easily. They can fold and unfold whole sections (a heading and its body down to the next sibling/parent heading), source/listing blocks, and tables, using fold controls in the gutter. **Section folding does not exist today** and is the headline of this story. While a section is collapsed, the user can still select and copy (or cut) the entire section — heading plus all hidden body content — as a single operation, so they can move or duplicate a whole section without first expanding it. Folding never alters the underlying text.

**Why this priority**: Folding meaningfully improves navigation of large documents. Block folding already exists for delimited blocks, but section folding and table folding do not — extending folding to them closes obvious gaps and enables collapse-and-move workflows. It is valuable but not blocking, so P2.

**Independent Test**: Create a document containing nested sections, a source block, and a table; fold and unfold each; confirm the collapsed range hides the expected content and that unfolding restores it exactly with no text change; with a section collapsed, copy it and paste it elsewhere and confirm the full section (heading + hidden body) is pasted.

**Acceptance Scenarios**:

1. **Given** a section heading with body content beneath it, **When** the user folds it, **Then** the section body is collapsed down to (but not including) the next heading at the same or higher level, and a fold indicator is shown.
2. **Given** a source/listing block, **When** the user folds it, **Then** the block body collapses to its opening line and can be unfolded to reveal the original content unchanged.
3. **Given** a table, **When** the user folds it, **Then** the table rows collapse to the table's opening line and can be unfolded unchanged.
4. **Given** any folded region, **When** the user unfolds it, **Then** the text content is byte-for-byte identical to before folding.
5. **Given** a collapsed section, **When** the user selects and copies (or cuts) it, **Then** the full section — heading plus all hidden body lines — is placed on the clipboard (and, for cut, removed from the document), exactly as if it had been expanded first.
6. **Given** a section that contains nested deeper subsections, **When** the user folds the parent section, **Then** the nested subsections are collapsed together as part of the parent and copy/cut includes them.
7. **Given** a conditional preprocessor region (`ifdef::`/`ifndef::`/`ifeval::` … `endif::`), **When** the user folds it, **Then** the region between the opening directive and its matching `endif::` collapses and unfolds unchanged.
8. **Given** a run of consecutive line comments (`//`) or a block of consecutive attribute-entry header lines (`:name: value`), **When** the user folds it, **Then** the group collapses to its first line and unfolds unchanged.
9. **Given** an attribute reference (`{name}`) whose value is known, **When** the user opts to collapse it, **Then** it displays as its resolved value and can be expanded again, without altering the underlying text.

---

### User Story 5 - Source blocks are syntax-highlighted in the editor by language (Priority: P3)

A user writes a source block declared with a specific language (e.g. a source/listing block tagged with a language). Inside the editor (not only in the rendered preview), the code within that block is highlighted according to that language's syntax. If no language is specified, the code is shown as plain monospace text without errors.

**Why this priority**: In-editor language highlighting is a polish feature that improves readability of embedded code while authoring. It is valuable but the rendered preview already provides highlighted output, so it is the lowest priority of the new capabilities.

**Independent Test**: Insert source blocks declared with a few representative languages, confirm their contents are highlighted distinctly within the editor; insert a source block with no language and confirm it renders as plain text without breaking surrounding highlighting.

**Acceptance Scenarios**:

1. **Given** a source block declared with a supported language, **When** the user views it in the editor, **Then** the block contents are highlighted according to that language.
2. **Given** a source block declared with an unsupported or unknown language, **When** the user views it, **Then** the block contents are shown as plain text and no surrounding highlighting is broken.
3. **Given** a source block with no language declaration, **When** the user views it, **Then** the block contents are shown as plain monospace text.
4. **Given** the user edits inside a highlighted source block, **When** they type, **Then** highlighting updates without noticeable lag and AsciiDoc highlighting resumes correctly after the block ends.

---

### User Story 6 - Inserting a source block also inserts its source declaration (Priority: P3)

A user clicks the toolbar action to insert a code/source block. The editor inserts both the source declaration line and the block delimiters, with the cursor positioned to either choose the language or start typing code, so the inserted block is immediately a valid, language-ready source block.

**Why this priority**: A small authoring convenience that complements User Stories 5 and removes a manual step. Low risk, low priority.

**Independent Test**: Trigger the code-block toolbar action and confirm the inserted text includes the source declaration line above the block delimiters and that the cursor lands in a sensible position.

**Acceptance Scenarios**:

1. **Given** the user triggers the insert-code-block action, **When** the snippet is inserted, **Then** it includes the source declaration line immediately before the block delimiters.
2. **Given** the snippet is inserted, **When** the user starts typing, **Then** the cursor is positioned to fill in the language and/or the code body without manual repositioning of the declaration line.
3. **Given** the inserted block is left with its placeholder language, **When** the document is rendered, **Then** it is still valid AsciiDoc that renders as a source block.

---

### User Story 7 - Complete AsciiDoc syntax highlighting coverage (Priority: P2)

The editor highlights the AsciiDoc constructs that established highlighters cover but this editor currently leaves as plain text: block attribute lines (e.g. `[source,lang]`, `[cols=…]`, `[%header]`, `[.role]`, `[quote, author]`), links and URLs, inline passthrough/anchors/callouts, and thematic/page breaks. Authors can immediately see these constructs are recognized, which surfaces typos and improves scannability.

**Why this priority**: These are the most visible parity gaps versus tools like the VS Code AsciiDoc extension. Block attribute highlighting in particular reinforces the source-declaration work (US5/US6). It is foundational readability, ranked alongside the other highlighting work at P2.

**Independent Test**: Enter each listed construct and confirm it is visually distinguished from surrounding body text and consistent with how the renderer treats it.

**Acceptance Scenarios**:

1. **Given** a block attribute line such as `[source,ruby]`, `[cols="1,1"]`, `[%header]`, `[.lead]`, or `[quote, Author]`, **When** the editor highlights it, **Then** the attribute line is visually distinct from body text (with the construct and its values discernible).
2. **Given** a bare URL, a `link:…[]` macro, or a `mailto:` link, **When** highlighting is applied, **Then** it is shown as a distinct link.
3. **Given** an inline passthrough (`+text+` / `pass:[…]`), an inline anchor (`[[id]]` / `anchor:id[]`), a bibliography anchor (`[[[ref]]]`), or a code callout (`<1>`), **When** highlighting is applied, **Then** each is recognized and distinguished from plain text.
4. **Given** a thematic break (`'''`) or a page break (`<<<`) on its own line, **When** highlighting is applied, **Then** the line is recognized as that construct.
5. **Given** a conditional preprocessor directive (`ifdef::attr[]`, `ifndef::`, `ifeval::[…]`, `endif::[]`), **When** highlighting is applied, **Then** it is highlighted distinctly (not merely as a generic block macro).
6. **Given** an inline UI or math macro (`kbd:[Ctrl+S]`, `btn:[OK]`, `menu:File[Save]`, `stem:[…]` / `latexmath:[…]`), **When** highlighting is applied, **Then** each is recognized and distinguished from plain text.
7. **Given** a CSV table (`,===`) or a DSV table (`:===`), **When** highlighting is applied, **Then** it is recognized and highlighted as a table (not only the PSV `|===` form).
8. **Given** typographic quotes (`"\`…\`"`), character replacements (`(C)`, `(R)`, `(TM)`) or entities (`&…;`), or a hard line break (trailing ` +`), **When** highlighting is applied, **Then** each is recognized as its construct.

---

### User Story 8 - Smart authoring assistance: completion, validation, navigation (Priority: P3)

While authoring, the user gets context-aware autocomplete for cross-reference targets, attribute references, and source-block languages; sees inline diagnostics for common structural mistakes; and can hover or jump to the target of a cross-reference or include. **Cross-reference resolution is project-wide, not file-local**: the project has an explicitly configured main (master) AsciiDoc file, and IDs/anchors are resolved across the full document tree formed by that main file and its (transitively) included files. Activating a cross-reference whose target lives in another file switches the editor to that file at the definition. When no main file is configured (or the open file is not reachable from it), resolution falls back to the current file only.

**Why this priority**: These intelligence features bring the editor toward feature parity with mature tooling and reduce broken references, but they are enhancements on top of correct highlighting, so P3.

**Independent Test**: Configure a project main file that includes other files; in one file reference an anchor defined in another and confirm it is offered in completion, validates as resolved, and that activating it switches to the defining file; reference a non-existent anchor and confirm a diagnostic; with no main file configured, confirm resolution is limited to the current file.

**Acceptance Scenarios**:

1. **Given** the user types `<<` (or otherwise begins a cross-reference), **When** completion triggers, **Then** the section IDs / anchors available across the resolved document tree (main file plus its includes) are offered.
2. **Given** the user types `{` to start an attribute reference, **When** completion triggers, **Then** the attributes defined across the resolved document tree are offered.
3. **Given** the user types a source-block language position (e.g. `[source,`), **When** completion triggers, **Then** supported language names are offered.
4. **Given** a delimited block whose closing delimiter is missing, **When** diagnostics run, **Then** the unmatched/unterminated block is flagged.
5. **Given** a cross-reference whose target does not exist anywhere in the resolved document tree, or two anchors sharing the same ID within that tree, **When** diagnostics run, **Then** the unknown target / duplicate ID is flagged.
6. **Given** a valid cross-reference whose target is defined in a different file of the tree, **When** the user hovers it or invokes go-to-definition, **Then** a preview is shown and/or the editor switches to that file and reveals the definition location.
7. **Given** the project has no configured main file, or the open file is not reachable from the main file, **When** resolution runs, **Then** IDs are resolved against the current file only and no cross-file diagnostics or navigation are produced.
8. **Given** the main file references a missing or unresolvable include, **When** the tree is built, **Then** the missing include is reported as a diagnostic and resolution of the rest of the tree still succeeds (and circular includes do not hang the editor).
9. **Given** the user authors an `include::` or `image::` target path, **When** completion triggers, **Then** file/directory paths from the project tree are offered (resolving attribute-substituted path segments such as `{imagesdir}`).
10. **Given** the user begins a document attribute entry (e.g. types `:`), **When** completion triggers, **Then** built-in document attributes (`toc`, `icons`, `source-highlighter`, …) and, where known, their permitted values are offered.
11. **Given** an attribute reference (`{name}`) to an attribute not defined anywhere in the resolved document tree, **When** diagnostics run, **Then** the undefined attribute reference is flagged.
12. **Given** a project with multiple files, **When** the user invokes "Go to Symbol", **Then** they can search and jump to any section heading or anchor across the project's files.
13. **Given** a configured main file that includes other files, **When** the preview renders, **Then** it shows the assembled document with `include::` directives resolved — and every resolved file is confined to the project sandbox and passed through the existing content sanitizer (no external/remote includes, no path traversal).
14. **Given** the user changes or clears the project's main file, **When** the change takes effect, **Then** all data derived from the document tree — include graph, symbol index, diagnostics, completion targets, and heading-level highlighting (via leveloffset) — refreshes to reflect the new tree without requiring a reload.

---

### User Story 9 - Authoring conveniences: shortcuts, tab-stops, smart paste (Priority: P3)

Common authoring actions are faster: keyboard shortcuts for inline formatting actually apply the formatting; typing a formatting mark with text selected wraps the selection; inserting a block/table/link drops Tab-through placeholders; pasting a URL over a selection turns it into a link; and pasting or dropping an image inserts the corresponding image reference.

**Why this priority**: Quality-of-life accelerators that complement the toolbar. They are not required for correctness, so P3. Image insertion depends on existing file storage.

**Independent Test**: Use each advertised shortcut and confirm the formatting applies; select text and type a mark to confirm wrapping; insert a code block/table/link and Tab through placeholders; select text and paste a URL to confirm a link is created; paste/drop an image and confirm an image reference is inserted.

**Acceptance Scenarios**:

1. **Given** a selection, **When** the user presses the advertised shortcut for bold/italic/monospace (and the other inline marks shown in the toolbar), **Then** that formatting is applied to the selection.
2. **Given** a non-empty selection, **When** the user types a formatting mark (e.g. `*`), **Then** the selection is wrapped in that mark rather than being replaced.
3. **Given** the user inserts a code block, table, or link via the toolbar, **When** the snippet is inserted, **Then** the cursor lands on the first placeholder and Tab advances through the remaining placeholders.
4. **Given** a non-empty selection, **When** the user pastes a URL, **Then** a link is created using the selection as the link text.
5. **Given** an image on the clipboard or dragged into the editor, **When** it is pasted/dropped, **Then** an image reference to the stored image is inserted at the cursor.
6. **Given** rich HTML content on the clipboard (e.g. copied from a web page), **When** the user pastes it, **Then** it is converted to equivalent AsciiDoc markup (headings, lists, bold/italic, links, tables where feasible) rather than pasted as raw HTML.
7. **Given** the user is typing prose, **When** spell-check runs, **Then** misspelled words in body text are flagged while content inside code/verbatim blocks, macros, attribute names, and URLs is not flagged.

---

### User Story 10 - Whole-document folding controls and persistence (Priority: P3)

Beyond folding individual regions, the user can fold or unfold the entire document at once or to a chosen heading level, and the fold state they leave a document in is restored when they reopen it.

**Why this priority**: Extends the folding work (US4) with bulk controls and persistence. Convenient for large documents but not essential, so P3.

**Independent Test**: Use fold-all and unfold-all and confirm all foldable regions collapse/expand; fold to a chosen level and confirm only deeper content collapses; reload the document and confirm the prior fold state is restored.

**Acceptance Scenarios**:

1. **Given** a document with several foldable regions, **When** the user invokes fold-all, **Then** all foldable regions collapse; **When** they invoke unfold-all, **Then** all expand.
2. **Given** the user folds to a specific heading level, **When** the command runs, **Then** sections deeper than that level collapse while shallower ones stay open.
3. **Given** the user leaves a document with certain regions folded, **When** they reopen that document later, **Then** the previously folded regions are restored as folded.

---

### User Story 11 - Live document metrics (Priority: P3)

The status bar shows the document's word count and an estimated reading time, updating as the user types, so authors have at-a-glance feedback on document length.

**Why this priority**: A small, self-contained informational aid. Low risk, low priority, P3.

**Independent Test**: Open a document and confirm word count and reading time appear in the status bar; type and delete text and confirm both update.

**Acceptance Scenarios**:

1. **Given** an open document, **When** the user views the status bar, **Then** the current word count and estimated reading time are displayed.
2. **Given** the user adds or removes text, **When** the document changes, **Then** the word count and reading time update to reflect the new content.

---

### User Story 12 - Cross-file refactoring of IDs, anchors, and attributes (Priority: P3)

Building on the project-wide resolution from US8, the user can safely restructure references across files: rename a section ID, block anchor, or attribute and have every reference to it updated automatically; find all usages of an ID/anchor/attribute across the project; and move or rename a file and have the include/image/cross-reference paths that pointed to it rewritten.

**Why this priority**: These refactoring operations significantly reduce broken references when restructuring documentation, but they are advanced editing aids built on top of the cross-file resolution engine, so P3.

**Independent Test**: Define an anchor referenced from several files; rename it and confirm all references update; invoke find-usages on it and confirm every reference is listed; move/rename a referenced file and confirm the include/image/xref paths that pointed to it are rewritten.

**Acceptance Scenarios**:

1. **Given** a section ID, block anchor, or attribute referenced from multiple files in the document tree, **When** the user renames it, **Then** all references (`<<id>>` / `xref:` / `{attr}`) across the project are updated to the new name and no reference is left dangling.
2. **Given** an ID/anchor/attribute, **When** the user invokes find-usages, **Then** every reference to it across the project's files is listed and navigable.
3. **Given** a file (`.adoc` or image) referenced by `include::`, `image::`, or `xref:` from other files, **When** the file is moved or renamed, **Then** the referencing paths are rewritten so they continue to resolve.
4. **Given** a rename or move would introduce a duplicate or unresolved reference, **When** the operation is attempted, **Then** the user is warned rather than silently producing a broken document.
5. **Given** the file currently configured as the project's main file, **When** it is moved or renamed, **Then** the project's main-file configuration continues to identify that same file (the configuration is not broken by the move/rename).
6. **Given** the configured main file is renamed so it is no longer a valid AsciiDoc main file (e.g. its extension changes to a non-AsciiDoc type) or is deleted, **When** the operation completes, **Then** the project's main-file configuration is cleared and the user is informed (cross-file resolution falls back to current-file-only) rather than left pointing at an invalid main file.

---

### Edge Cases

- **Preview toggle during active save/sync**: What happens if the user toggles the preview while an autosave or a collaborative sync is mid-flight? Content must not regress to the in-flight or last-saved server version.
- **Preview toggle right after switching files**: Toggling the preview immediately after opening a different file must show the correct file's content, not a stale or empty buffer.
- **Headings**: A heading marker with no following space, a heading inside a code/listing block (should not be treated as a heading), and the maximum-level boundary (max valid vs. one-over-max on the *effective* level).
- **Leveloffset**: A `:leveloffset:` that drives an effective level below 0 or above the maximum; an unset (`:leveloffset!:` / empty) that resets it; a file included from **multiple** places with **different** inherited offsets (so its headings have no single effective level — use the offset from the first include reached in document-order depth-first traversal from the main file, and show a non-blocking multiple-context indicator, rather than guessing silently); and a leveloffset set in an ancestor file but after the include point (must NOT apply).
- **Discrete heading**: `[discrete]`/`[float]` on a line that is not a heading; a discrete heading at a level deeper than the surrounding section (allowed); a discrete heading inside a verbatim block (not a heading).
- **Main-file change**: Switching the main file while edits/diagnostics are in flight must refresh derived data without losing unsaved edits; clearing the main file must drop cross-file data back to current-file scope cleanly.
- **Folding boundaries**: Folding the last section in a document (no following heading), a section that contains nested deeper sections, an unterminated block/table, and folding interacting with the existing block fold so a region is not double-counted.
- **Source highlighting**: A language alias or unusual capitalization, an extremely long source block, and a source block whose closing delimiter is missing.
- **Insert source block**: Triggering the insert action when there is a non-empty selection (selected text should be wrapped or preserved sensibly, not silently destroyed).
- **Line wrap**: Toggling line wrap while the cursor is on a very long line should keep the cursor visible and not scroll-jump unexpectedly.
- **Attribute lines vs. anchors**: A block attribute line `[id]` versus a bibliography anchor `[[[id]]]` versus an inline anchor `[[id]]` must be disambiguated, and an attribute-looking line inside a verbatim block must not be highlighted as an attribute line.
- **Completion noise**: Cross-reference/attribute completion must not pop up inside verbatim/source blocks where those constructs are not interpreted.
- **Cross-file resolution edge cases**: A main file pointing to a non-existent file; an include cycle (A includes B includes A); the same anchor ID defined in two different included files; an ID defined only in an unsaved-but-not-open file; and navigating to a definition in a file the user lacks permission to open — each must be handled without data loss or hangs.
- **File switch during collaboration**: Activating a cross-reference that switches files while in a real-time collaborative session must open the target file's collaborative session correctly and not lose the originating file's unsaved edits.
- **Refactoring across unopened/dirty files**: Rename, find-usages, and move-file must account for references in files that are not currently open and in files with unsaved edits, and must behave safely in a collaborative session (not clobber concurrent edits in other files).
- **Main-file move/rename/delete**: Moving or renaming the configured main file must keep the main-file configuration valid; renaming it to a non-AsciiDoc type or deleting it must clear the configuration (not leave a dangling reference); a concurrent collaborator changing the main file must see the configuration update consistently.
- **Conditional & table edge cases**: Nested conditional regions, an `ifdef::` without a matching `endif::`, and a malformed CSV/DSV table must fold/highlight gracefully without breaking surrounding content.
- **Paste-HTML fidelity**: Pasting HTML with constructs that have no clean AsciiDoc equivalent must degrade gracefully (best-effort conversion or fenced fallback) rather than corrupting the document.
- **Spell-check noise**: Technical terms, identifiers, and inline code must not generate excessive spell-check warnings; a user-extensible dictionary or per-document ignore is expected.
- **Diagnostics false positives**: A block intentionally left open mid-edit should not produce alarming errors on every keystroke (diagnostics should be debounced/tolerant of in-progress typing).
- **Image paste without storage**: Pasting/dropping an image when upload is unavailable (e.g. read-only access or offline) must fail gracefully with a clear message and must not corrupt the document.
- **Fold persistence after edits**: Restoring persisted fold state after the document changed externally (e.g. via collaboration) must not collapse the wrong ranges or hide unexpected content.
- **Shortcut conflicts**: Newly bound formatting shortcuts must not override critical existing editor/browser shortcuts (save, find, undo).

## Clarifications

### Session 2026-06-13

- Q: How is the project's main (master) AsciiDoc file configured? → A: Explicit per-project setting (the user designates the main `.adoc` file in project settings).
- Q: When no main file is configured (or the open file is not reachable from it), how should ID validation/navigation behave? → A: Current-file-only resolution (no cross-file diagnostics/navigation until a main file is set).
- Q: Which content should cross-file ID resolution read from? → A: Saved/persisted project content, with the currently open file's unsaved edits applied on top.

### Session 2026-06-13 (heading levels & main-file refinements)

- Changing (or clearing) the project main file MUST trigger a refresh of all data derived from the document tree — include graph, symbol index, diagnostics, completion targets, and **heading-level highlighting** (which depends on `:leveloffset:` propagated through the tree).
- Heading **level is the *effective* level**, not the raw count of `=`: it MUST account for `:leveloffset:` (`+N`, `-N`, absolute, or unset), which may be set earlier in the same file **or in an ancestor file in the include path** before this file is included, and which accumulates along the include path from the main file.
- **Discrete headings** (`[discrete]`, legacy `[float]`) are recognized; they are styled as headings but sit outside the section hierarchy, so they may appear at heading levels that the surrounding section nesting would not otherwise allow (they relax the section-sequence constraint), and they too are subject to `:leveloffset:`.
- The main-file setting MUST reject selecting a file that does not exist, but MAY be left undefined (unset ⇒ current-file-only resolution).

## Current Implementation Status

*Source audit performed 2026-06-13 against the codebase. Legend: ✅ Implemented · 🟡 Partial · ❌ Missing. Paths are under `apps/web/src/` unless noted. This section is informational for planning — it does not change the requirements above, but several requirements are already partly satisfied and should be treated as "extend/expose", not "build from scratch".*

**US1 — Preview toggle content loss — 🟡 defect confirmed, root cause pinned.** Toggling the preview renders the editor inside two structurally different subtrees (`PanelGroup/Panel` when open vs a bare `div` when closed) in `app/(dashboard)/dashboard/projects/[id]/project-editor-layout.tsx:435-508`. React cannot reconcile `AsciiDocEditor` across them, so it unmounts/remounts, destroying the CodeMirror view and re-seeding `EditorState` from `doc: collabActive ? '' : content` (`hooks/use-editor-mount.ts:208-210`) — blank-then-resync on the Yjs path, reset-to-stale on the REST path. **Fix target:** mount the editor in one stable position (e.g. always render the `PanelGroup`, just collapse/hide the preview `Panel`). The Yjs doc itself survives (`hooks/use-collab-document.ts:118-178`).

**US2 — Line wrap — 🟡 ~90% done, exposure only.** `EditorView.lineWrapping` is wired (`hooks/use-editor-mount.ts:256`); the `softWrap` preference + persistence exist (`hooks/use-editor-preferences.ts:36,139`); the panel even renders a Soft Wrap checkbox — but only when `setSoftWrap` is passed (`components/editor/editor-settings-panel.tsx:93`), and `components/editor/editor-toolbar.tsx:201-206` does **not** pass `softWrap`/`setSoftWrap`. The only remaining work is threading those props through. (FR-006/007/008)

**US3 — Header max level — 🟡.** Six `=` counts are tokenized → DocumentTitle + Heading1–5 (`lib/codemirror/asciidoc-block-tokens.ts:114-131`), but `>=6 =` clamps to Heading5 and is still highlighted; nothing renders an over-max heading as plain text. Remaining work is the max-level cutoff behavior. (FR-009/010/011)

**US4 — Folding sections/sources/tables — 🟡 delimited blocks only.** `FOLDABLE_BLOCK_TYPES` folds 8 delimited block types (`lib/codemirror/asciidoc-fold.ts:5-8`) but **omits `LiteralBlock` and `AdmonitionBlock`**. ❌ Sections (no `Section` grammar node — headings are flat), ❌ tables, ❌ conditionals, ❌ comment/attr runs, ❌ `{attr}` collapse. Copy/cut of a collapsed section works for free once section folding exists (CM keeps folded text in the doc model). (FR-012–016b)

**US5 — In-editor source highlighting — ❌.** Block bodies are opaque `rawBodyLine` tokens; no `parseMixed`/language injection, no `@codemirror/lang-*` packages (`lib/codemirror/asciidoc.grammar:97-98,138`). (FR-017–019)

**US6 — Insert block with source declaration — ❌.** The Code Block action inserts exactly `----\n\n----\n` with no `[source,lang]` line (`components/editor/editor-toolbar.tsx:109`). (FR-020–022)

**US7 — Highlighting coverage — 🟡/❌.** Block-attribute lines 🟡 (only `[stem]` + 5 admonitions special-cased; no `[source]`/`[cols]`/`[%…]`/`[.role]`/`[quote]` — `lib/codemirror/asciidoc-block-tokens.ts:252-258`); links 🟡 (generic inline-macro → `t.link`; **no bare-URL token**); ❌ passthrough/inline-anchor/bibliography/callout; ❌ thematic `'''`/page `<<<`; conditionals 🟡 (generic block-macro, not distinct); ❌ `kbd:`/`btn:`/`menu:`/inline `stem:`; ❌ CSV `,===`/DSV `:===` (only PSV); ❌ smart quotes/replacements/entities/hard break. (FR-025–028, 051–054)

**US8 — Smart assistance — 🟡 MORE built than the requirements imply; mostly a single-file→cross-file extension.** `lib/codemirror/asciidoc-completions.ts` already provides (all current-file): ✅ attribute-reference completion incl. a 24-item built-in list (`:7-14,57` — satisfies the *completion* part of FR-030 **and FR-059**), ✅ xref-target completion (`:76` — FR-029 current-file), ✅ `include::` path completion (`:101` — FR-058), ✅ `image::`/`image:` path completion (`:358` — FR-058). ❌ source-language completion for `[source,…]` (FR-031). ❌ **All diagnostics** — no `@codemirror/lint` dependency at all (FR-032/033/060). Hover/nav 🟡 — include/image Ctrl+click navigation works (`lib/codemirror/asciidoc-link-handler.ts:78-110`) but the hover only advertises the affordance, and **xref `<<id>>` has no navigation/validation**, only completion (FR-034). ❌ project main-file setting — the `Project` entity has only `rootFolderId`, no main/master file (`packages/domain/src/entities/project.ts:18,78` — FR-045). ❌ include resolution — the preview worker runs `safe: 'safe'`, so `include::` is emitted as literal text, never expanded (`workers/asciidoc-render.worker.ts:90` — FR-046). ❌ project-wide Go to Symbol (single-file `outlineField` only — FR-061). **Net new work: cross-file/tree scope, the main-file + include-resolution infrastructure, diagnostics, xref navigation, source-language completion, go-to-symbol.**

**US9 — Conveniences — 🟡/❌.** ❌ Inline-format shortcuts are not bound — `Ctrl+B/I/\`` are tooltip strings only; the keymap (`hooks/use-editor-mount.ts:220`) has no `Mod-b/i` (FR-036). ❌ auto-wrap on typing a mark (FR-037). ❌ snippet tab-stops — inserts use single-cursor `insertSnippet` (FR-038). ❌ paste-URL→link / ❌ paste-HTML — no paste handler exists at all (FR-039/062). Image paste/drop 🟡 — the **upload primitive is ✅** (`packages/domain/src/use-cases/content/upload-asset.ts:28,118` returns a referenceable `storagePath`; API `lib/api/assets.ts:18-25`), but the editor only handles file-tree drags, not binary image paste/drop with auto-insert (`hooks/use-editor-mount.ts:167-184` — FR-040). ❌ spell-check (FR-063). Comment-toggle: line token `//` is configured (`lib/codemirror/asciidoc-language.ts:9`) but no keymap binds CM's `toggleComment`.

**US10 — Fold-all / persistence — ❌.** No `foldAll`/`unfoldAll`/`foldKeymap` and no fold-state serialization anywhere; only per-block gutter folding (`hooks/use-editor-mount.ts:232`). (FR-042/043)

**US11 — Metrics — ❌.** Status bar shows only line/col, total lines, and save state (`components/editor/editor-status-bar.tsx:29-35`); no word count/reading time. (FR-044)

**US12 — Cross-file refactoring — ❌, with a latent bug.** `move-file.ts:88` / `rename-file.ts:100` only cascade DB path bookkeeping; they do **not** rewrite `include::`/`image::`/`xref` references, so moving/renaming a referenced file currently leaves stale references — FR-066 both adds the feature and fixes existing breakage. No rename-symbol/find-usages exist. (FR-064–067)

**Planning implications:** (1) FR-045 needs a new `Project` field for the main file; (2) FR-046 cross-file/tree resolution depends on include resolution that does not exist even in the preview (`safe: 'safe'`), so an include-graph builder is foundational for US8/US12; (3) US8 should be scoped as *extending* the existing single-file completion to cross-file + adding diagnostics, not building completion from scratch; (4) US2 is a trivial prop-wiring change and a good early win alongside the US1 fix; (5) diagnostics require adding `@codemirror/lint`.

## Requirements *(mandatory)*

### Functional Requirements

**Preview toggle content integrity (US1)**

- **FR-001**: The editor MUST preserve the full current editor content when the HTML preview is collapsed.
- **FR-002**: The editor MUST preserve the full current editor content when the HTML preview is expanded.
- **FR-003**: Toggling the preview MUST NOT cause the editor content to revert to a previously saved or server-provided version, nor lose unsaved local edits.
- **FR-004**: After any sequence of preview collapse/expand actions, the editor content MUST equal the content prior to the toggles (no loss, duplication, or reordering).
- **FR-005**: In a real-time collaborative session, toggling the preview MUST NOT disconnect, reset, or corrupt the shared document or the local participant's edits.

**Line wrap option (US2)**

- **FR-006**: The editor settings/options panel MUST present a Line Wrap toggle alongside the existing Font Size and Theme controls.
- **FR-007**: Enabling Line Wrap MUST wrap long lines to the editor width; disabling it MUST allow long lines to extend with horizontal scrolling.
- **FR-008**: The Line Wrap preference MUST persist across page reloads and future editor sessions for the user, consistent with how Font Size and Theme persist.

**Header highlighting (US3)**

- **FR-009**: The editor MUST visually distinguish each valid AsciiDoc heading level from the others and from body text, by the heading's **effective level** (see FR-071).
- **FR-010**: The editor MUST define and enforce a maximum valid heading level; a line whose **effective level** exceeds the maximum MUST NOT be styled as a heading.
- **FR-011**: The editor MUST only treat a line as a heading when it conforms to AsciiDoc heading rules (e.g. required space after the markers, not inside a verbatim block).
- **FR-071**: Heading level MUST be computed as the **effective level** = raw marker count adjusted by the `:leveloffset:` in effect at that line. The `:leveloffset:` state MUST account for entries in the current file (`+N`, `-N`, absolute, unset) and for offsets inherited from ancestor files in the include path (including a `leveloffset=` attribute on the `include::` directive), accumulated along the path from the main file. When no main file / include context is available, the offset state is computed from the current file alone.
- **FR-072**: The editor MUST recognize discrete headings (`[discrete]`, legacy `[float]`), style them as headings at their (offset-adjusted) level, treat them as outside the section hierarchy (not foldable as sections, not section-outline nodes), and not flag them for breaking section-level sequence.

**Folding (US4)**

- **FR-012**: The editor MUST allow folding and unfolding of sections, where a section spans from its heading to the start of the next heading of the same or higher level (or end of document).
- **FR-013**: The editor MUST allow folding and unfolding of source/listing blocks.
- **FR-014**: The editor MUST allow folding and unfolding of tables.
- **FR-015**: Folding or unfolding any region MUST NOT modify the underlying document text in any way.
- **FR-016**: Fold controls MUST be discoverable (e.g. in the editor gutter) and indicate which regions are foldable and which are currently folded.
- **FR-016a**: A collapsed section MUST be selectable, copyable, and cuttable as a whole — the clipboard operation MUST include the heading and all hidden body lines (including nested subsections) exactly as if the section were expanded.
- **FR-016b**: When a parent section is folded, any nested deeper subsections MUST collapse together as part of the parent fold.

**In-editor source highlighting (US5)**

- **FR-017**: The editor MUST highlight the contents of a source block according to its declared language for a defined set of supported languages.
- **FR-018**: For a source block with no language or an unsupported language, the editor MUST render the contents as plain text without breaking highlighting of the surrounding AsciiDoc.
- **FR-019**: AsciiDoc highlighting MUST resume correctly for content following the end of a source block.

**Insert source block with declaration (US6)**

- **FR-020**: The insert-code/source-block toolbar action MUST insert the source declaration line together with the block delimiters as a single action.
- **FR-021**: After insertion, the cursor MUST be positioned so the user can specify the language and/or type the code body without manually relocating the declaration.
- **FR-022**: The inserted block (including with an unfilled placeholder language) MUST remain valid AsciiDoc that renders as a source block.

**Complete highlighting coverage (US7)**

- **FR-025**: The editor MUST highlight block attribute lines — including `[source,<lang>]`, column/format specs (`[cols=…]`), options/flags (`[%header]`), roles (`[.role]`), and styled/attributed lists (`[quote, author]`) — as distinct from body text.
- **FR-026**: The editor MUST highlight links as distinct tokens, covering bare URLs, the `link:` macro, and `mailto:` links.
- **FR-027**: The editor MUST highlight inline passthrough (`+…+`, `pass:[…]`), inline anchors (`[[id]]`, `anchor:id[]`), bibliography anchors (`[[[ref]]]`), and code callouts (`<n>`).
- **FR-028**: The editor MUST recognize and highlight thematic breaks (`'''`) and page breaks (`<<<`).

**Authoring assistance (US8)**

- **FR-029**: The editor MUST offer autocomplete of cross-reference targets (section IDs and anchors) when authoring a cross-reference, drawn from the resolved document tree (per FR-046) rather than the open file alone.
- **FR-030**: The editor MUST offer autocomplete of attribute references drawn from the attributes defined across the resolved document tree.
- **FR-031**: The editor MUST offer autocomplete of supported source-block language names when authoring a source declaration.
- **FR-032**: The editor MUST surface diagnostics for unmatched/unterminated delimited blocks.
- **FR-033**: The editor MUST surface diagnostics for cross-references to non-existent targets and for duplicate anchor IDs, evaluated against the resolved document tree (per FR-046).
- **FR-034**: The editor MUST let the user preview (hover) and/or navigate (go-to-definition) to the target of a cross-reference or include, switching the active file when the target is defined in another file of the tree (per FR-049).
- **FR-035**: Completion and diagnostics MUST NOT trigger inside verbatim/source blocks where those constructs are not interpreted, and diagnostics MUST tolerate in-progress edits without alarming on every keystroke.

**Authoring conveniences (US9)**

- **FR-036**: The editor MUST bind keyboard shortcuts that apply the inline formatting actions advertised in the toolbar (at minimum bold, italic, monospace).
- **FR-037**: Typing a formatting mark while text is selected MUST wrap the selection in that mark rather than replace it.
- **FR-038**: Toolbar inserts for code block, table, and link MUST place the cursor on the first editable placeholder and allow advancing through remaining placeholders with Tab.
- **FR-039**: Pasting a URL while a non-empty selection exists MUST create a link using the selection as the link text.
- **FR-040**: Pasting or dropping an image into the editor MUST insert an image reference to the stored image; if image storage is unavailable, the action MUST fail gracefully without corrupting the document.
- **FR-041**: Newly bound shortcuts MUST NOT override critical existing editor/browser shortcuts (e.g. save, find, undo).

**Folding controls and persistence (US10)**

- **FR-042**: The editor MUST provide fold-all and unfold-all commands and a fold-to-level command.
- **FR-043**: The editor MUST persist a document's fold state and restore it when the document is reopened, reconciling safely if the document changed in the meantime.

**Document metrics (US11)**

- **FR-044**: The status bar MUST display the document's word count and an estimated reading time, updating live as the document changes.

**Cross-file reference resolution (US8, clarified 2026-06-13)**

- **FR-045**: The project MUST support configuring an explicit main (master) AsciiDoc file as a per-project setting. The setting MUST reject a file that does not exist (or is not an AsciiDoc file in the project) and MAY be left undefined (unset ⇒ current-file-only resolution per FR-047).
- **FR-045a**: Changing or clearing the project main file MUST trigger a refresh of all data derived from the document tree — the include graph, project symbol index, diagnostics, completion targets, and effective-level heading highlighting — so dependent features reflect the new tree without a reload.
- **FR-046**: Cross-reference completion, validation, and navigation MUST resolve IDs/anchors and attributes across the full document tree formed by the configured main file and its transitively included files.
- **FR-047**: When no main file is configured, or the currently open file is not reachable from the main file's include tree, the editor MUST fall back to current-file-only resolution and MUST NOT emit cross-file diagnostics or navigation.
- **FR-048**: Cross-file resolution MUST read from the saved/persisted project file content, with the currently open file's unsaved edits applied on top of its persisted version.
- **FR-049**: Activating (go-to-definition) a cross-reference whose target is defined in a different file of the tree MUST switch the editor's active file to that file and reveal the definition location.
- **FR-050**: Missing or unresolvable includes MUST be reported as diagnostics without preventing resolution of the rest of the tree, and circular includes MUST NOT cause the editor to hang or loop indefinitely.

**Extended highlighting & folding (US4 / US7, gap analysis 2026-06-13)**

- **FR-051**: The editor MUST highlight conditional preprocessor directives (`ifdef::`, `ifndef::`, `ifeval::`, `endif::`) as a distinct construct rather than as a generic block macro.
- **FR-052**: The editor MUST highlight inline UI and math macros (`kbd:`, `btn:`, `menu:`, inline `stem:`/`latexmath:`/`asciimath:`) as distinct constructs.
- **FR-053**: The editor MUST recognize and highlight CSV (`,===`) and DSV (`:===`) tables in addition to PSV (`|===`) tables, and these table forms MUST be foldable (per FR-014).
- **FR-054**: The editor MUST highlight typographic quotes, character replacements (`(C)`, `(R)`, `(TM)`) and entities (`&…;`), and hard line breaks (trailing ` +`).
- **FR-055**: The editor MUST allow folding of conditional preprocessor regions (`ifdef`/`ifndef`/`ifeval` … `endif`).
- **FR-056**: The editor MUST allow folding of consecutive line-comment runs (`//`) and consecutive attribute-entry header lines (`:name: value`).
- **FR-057**: The editor MUST allow collapsing an attribute reference (`{name}`) to its resolved value as a display-only fold, expandable on demand, without altering the underlying text.

**Extended assistance: paths, attributes, symbols (US8, gap analysis 2026-06-13)**

- **FR-058**: The editor MUST offer path autocomplete for `include::` and `image::` targets, drawn from the project file tree, resolving attribute-substituted path segments (e.g. `{imagesdir}`).
- **FR-059**: The editor MUST offer completion of built-in document attribute names (e.g. `toc`, `icons`, `source-highlighter`) when authoring an attribute entry, and known permitted values where applicable.
- **FR-060**: The editor MUST surface a diagnostic for attribute references (`{name}`) that are not defined anywhere in the resolved document tree (excluding built-in/system attributes).
- **FR-061**: The editor MUST provide a project-wide "Go to Symbol" search that lets the user jump to any section heading or anchor across the project's files.
- **FR-068**: When a main file is configured, the preview MUST be able to render the assembled document with `include::` directives resolved. All resolved content MUST be confined to the project's storage sandbox (rejecting path traversal and remote/external includes) and MUST pass through the existing content sanitizer unchanged; this MUST NOT regress scroll-synchronization. *(Unblocked by constitution v2.2.0 — expanded Principle VIII + new Principle IX; previously scoped out.)*

**Security boundary for externally-sourced content (Constitution IX)**

- **FR-069**: All externally-sourced content entering the editor or render pipeline — pasted/dropped clipboard data (HTML/images/files, FR-040/062), `include::`/`image::` resolution and attribute-substituted paths (FR-046/048/058/068) — MUST be validated, confined to the project storage sandbox (no path traversal, no remote/SSRF fetches), and sanitized before insertion or rendering, with no parallel or relaxed sanitization path. Embedded source-language content highlighted in the editor (FR-017) MUST be treated as inert data and never executed.
- **FR-073**: The new project main-file endpoint (FR-045) MUST be rate-limited, and the per-file content reads that build the cross-file symbol index (FR-046/048) MUST NOT let a single open/refresh amplify into unbounded backend requests (fetches are cached, the include walk is cycle-guarded, and concurrent fetches are bounded). Any rate limit applied MUST be configurable via environment-bound options rather than hardcoded (per the security constitution's API & Integration Security rule).

**Authoring power features (US9, gap analysis 2026-06-13)**

- **FR-062**: Pasting rich HTML content MUST convert it to equivalent AsciiDoc markup (at least headings, lists, bold/italic, links, and tables where feasible) rather than inserting raw HTML.
- **FR-063**: The editor MUST spell-check body prose while excluding code/verbatim blocks, macros, attribute names, and URLs from spell-checking.

**Cross-file refactoring (US12, gap analysis 2026-06-13)**

- **FR-064**: The editor MUST support renaming a section ID, block anchor, or attribute and updating all references to it (`<<id>>` / `xref:` / `{attr}`) across the project's document tree.
- **FR-065**: The editor MUST provide find-usages for a section ID, block anchor, or attribute, listing every reference to it across the project's files.
- **FR-066**: When a referenced file (`.adoc` or image) is moved or renamed, the editor MUST rewrite the `include::`/`image::`/`xref:` paths that referenced it so they continue to resolve.
- **FR-067**: A rename or move operation that would create a duplicate ID or leave a reference unresolved MUST warn the user instead of silently producing a broken document.
- **FR-070**: Moving or renaming the project's configured main file MUST keep the project's main-file configuration consistent: the configuration MUST continue to identify the same file after a move/rename. If a rename makes the file no longer a valid AsciiDoc main file, or the file is deleted, the configuration MUST be cleared (resolution falls back to current-file-only per FR-047) and the user informed — the configuration MUST NEVER be left pointing at a moved-away path or an invalid/deleted file.

### Key Entities *(include if feature involves data)*

- **Editor Preference**: A user-scoped setting controlling editor appearance/behavior. Existing members include font size and theme; this feature adds (exposes) a line-wrap flag. Persisted and restored across sessions.
- **Heading**: A document structure element identified by leading markers and an **effective level** (raw marker count adjusted by the active `:leveloffset:`), bounded by a maximum valid level, used for highlighting and section folding. A **discrete heading** is a heading outside the section hierarchy.
- **Level-Offset Context**: The cumulative `:leveloffset:` in effect at a given line, derived from offset entries earlier in the file and inherited from ancestor files (and `include::` `leveloffset=` attributes) along the path from the main file. Determines each heading's effective level; recomputed when the document tree or main file changes.
- **Foldable Region**: A contiguous range of the document (section, source/listing block, or table) that can be collapsed/expanded without changing text.
- **Source Block**: A verbatim block optionally annotated with a language, used to drive both in-editor language highlighting and rendered output.
- **Block Attribute Line**: A bracketed line preceding a block (`[source,lang]`, `[cols=…]`, `[%header]`, `[.role]`, `[quote,…]`) that configures the block; a highlighting and completion target.
- **Reference Target**: A named, navigable location (section ID or anchor) anywhere in the resolved document tree that cross-references point to; the basis for cross-reference completion, validation, and go-to-definition. Carries which file and location it is defined in so navigation can switch files.
- **Project Main File**: A per-project setting naming the root AsciiDoc file from which the include tree is resolved. May be unset, in which case resolution is current-file-only.
- **Document Tree (Include Graph)**: The set of AsciiDoc files reachable from the main file via transitive includes, forming the scope for cross-reference completion, validation, and navigation; built from persisted content with the open file's unsaved edits applied. Guards against missing/circular includes.
- **Diagnostic**: A non-destructive marker flagging a likely structural problem (unterminated block, unknown reference target, duplicate anchor ID) without modifying the document.
- **Fold State**: The set of currently-collapsed regions for a document, persisted per user/document and restored on reopen.
- **Project Symbol**: A navigable named element (section heading or anchor) indexed across the project's files to power "Go to Symbol", find-usages, and rename.
- **Refactoring Operation**: A reference-preserving transformation (rename ID/anchor/attribute, or move/rename a referenced file) that updates all affected references across the project's document tree and warns before producing a broken reference.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In 100% of preview collapse/expand actions, the editor content is identical before and after the toggle (zero content-loss incidents across repeated toggling).
- **SC-002**: A user can locate and toggle the Line Wrap option from the editor options in under 10 seconds, and the chosen state is correctly restored on the next session 100% of the time.
- **SC-003**: For every valid heading level, authors can visually tell the level apart from adjacent levels and from body text; lines exceeding the maximum valid level are never shown as headings.
- **SC-004**: Sections, source/listing blocks, and tables can each be folded and unfolded, and in 100% of cases unfolding restores text identical to the pre-fold content.
- **SC-005**: For each supported language, the contents of a declared source block are visibly highlighted within the editor, and unsupported/blank languages degrade to plain text without breaking surrounding highlighting in 100% of cases.
- **SC-006**: Triggering the insert-code-block action produces a block that already contains the source declaration line in 100% of insertions, with no manual edit needed to make it a valid source block.
  *(SC-007 is intentionally unused — a criterion removed during refinement; identifiers are not renumbered so existing references stay stable.)*
- **SC-008**: Every construct listed in US7 (block attribute lines, links/URLs, inline passthrough/anchors/callouts, thematic/page breaks) is visually distinguished from body text where previously it was not.
- **SC-009**: Cross-reference, attribute, and source-language completion each return relevant suggestions in their context and stay suppressed inside verbatim blocks, in 100% of tested cases.
- **SC-010**: Diagnostics correctly flag unterminated blocks, unknown cross-reference targets, and duplicate anchor IDs, and clear once the problem is corrected.
- **SC-011**: A collapsed section can be copied/cut and pasted as a whole, with the pasted text identical to the expanded section in 100% of cases.
- **SC-012**: Advertised inline-formatting shortcuts apply their formatting, and typing a mark over a selection wraps it, without overriding save/find/undo.
- **SC-013**: Fold-all/unfold-all and fold-to-level behave as described, and a document's fold state is restored on reopen.
- **SC-014**: Word count and reading time are visible in the status bar and update as the document changes.
- **SC-015**: With a project main file configured, a cross-reference to an anchor defined in an included file validates as resolved, is offered in completion, and activating it switches to the defining file at the definition location — in 100% of tested cases; with no main file configured, resolution is correctly limited to the current file and produces no cross-file false positives.
- **SC-016**: Conditional directives, inline UI/math macros, and CSV/DSV tables are highlighted distinctly, and conditional regions / comment runs / attribute-header blocks are foldable, where previously they were not.
- **SC-017**: Authoring an `include::`/`image::` path offers project-tree path completions, and authoring an attribute entry offers built-in attribute completions, in their respective contexts.
- **SC-018**: A reference to an undefined attribute is flagged, and "Go to Symbol" can locate any section/anchor across project files.
- **SC-019**: Pasting rich HTML yields AsciiDoc markup (not raw HTML), and spell-check flags prose errors without flagging code/verbatim/macros.
- **SC-020**: Renaming an ID/anchor/attribute updates 100% of its references across the project with none left dangling; find-usages lists every reference; moving a referenced file rewrites the paths that pointed to it; and any operation that would break a reference warns first.
- **SC-021**: With a main file configured, the preview renders the assembled document with includes resolved; and in 100% of cases an include pointing outside the project sandbox or to a remote target is rejected (not rendered), with all resolved content passing through the existing sanitizer.
- **SC-022**: After moving or renaming the configured main file, the project's main-file configuration still resolves to that file in 100% of cases; renaming it to a non-AsciiDoc type or deleting it clears the configuration (no dangling reference).
- **SC-023**: Heading highlighting reflects the effective level after `:leveloffset:` (set in-file or inherited from ancestor files), including not styling a line whose effective level exceeds the maximum; discrete headings are styled as headings and excluded from section folding/outline.
- **SC-024**: Changing or clearing the project main file refreshes the include graph, symbol index, diagnostics, completion, and effective-level heading highlighting within the editor session without a reload, in 100% of cases; selecting a non-existent file as the main file is rejected.
- **SC-025**: The main-file endpoint enforces a configurable rate limit (responding `429` once exceeded) whose `max`/`window` are settable via environment variables; and building the symbol index for a main file with N transitively-included files issues at most N file-content fetches per refresh (no duplicate fetch per cached file, bounded concurrency), in 100% of tested cases.

## Assumptions

- **Maximum heading level follows the AsciiDoc standard, applied to the effective level**: The maximum valid heading level is taken from the AsciiDoc specification (document title plus standard section levels). The cutoff is applied to the **effective** level after `:leveloffset:`, not the raw marker count; lines whose effective level exceeds the maximum are intentionally not highlighted as headings. The exact ceiling aligns to what the rendering pipeline accepts.
- **Effective heading level depends on the document tree**: Computing effective levels (and thus heading highlighting) requires the `:leveloffset:` state, which can be inherited across the include path; it therefore depends on the configured main file and include graph (US8 infrastructure). When a file is included from multiple places with conflicting inherited offsets, the editor uses the offset from the first include reached in document-order depth-first traversal from the main file (deterministic) and surfaces a non-blocking multiple-context indicator. With no main-file/include context, the offset is computed from the current file alone.
- **Line-wrap capability already exists internally**: The underlying soft-wrap behavior, the persisted preference, and the settings-panel control already exist in the codebase; the primary gap is that the option is not passed through to the options UI. This story is therefore exposure/wiring plus persistence verification rather than new capability.
- **Supported languages for in-editor highlighting are a curated common set**: In-editor source highlighting targets a curated set of commonly used languages rather than every language the renderer supports; additional languages degrade gracefully to plain text. The renderer/preview continues to handle the full language set.
- **Inserted source declaration uses a placeholder language**: The insert-code-block action inserts a declaration with a clearly editable placeholder language so the result is valid and immediately ready for the author to specify the real language.
- **Folding builds on the existing fold mechanism**: Section and table folding extend the editor's existing folding system; existing block folding behavior is preserved and not regressed.
- **Scope is the editing experience, plus security-gated preview assembly**: Changes are primarily scoped to the in-app editor and its options. The rendered HTML pipeline is additionally extended to resolve `include::` so the preview shows the assembled main document (FR-068) — unblocked by constitution v2.2.0 (expanded Principle VIII) and governed by the Untrusted Input Boundary (Principle IX): sandbox-confined resolution and the existing sanitizer applied unchanged. This replaces the earlier assumption that the preview render path would be left untouched.
- **Collaboration model is unchanged**: The real-time collaboration mechanism is reused as-is; the preview-toggle fix must remain compatible with it rather than redesign it.
- **Image insertion reuses existing file storage**: Pasting/dropping images stores them via the project's existing file-storage capability; no new storage system is introduced, and behavior degrades gracefully when storage is unavailable or the user lacks write access.
- **Completion/diagnostics scope is the resolved document tree**: Cross-reference and attribute completion, reference validation, and go-to-definition operate over the document tree formed by the project's configured main file and its transitive includes (see Clarifications 2026-06-13). They read persisted file content with the open file's unsaved edits applied on top. With no main file configured, scope narrows to the current file only.
- **Included files live within the project**: Includes are resolved to other AsciiDoc files within the same project's file tree; resolving includes that point outside the project (e.g. remote URLs or external paths) is out of scope for this iteration and surfaced as a diagnostic.
- **Highlighting completeness is best-effort, renderer-aligned**: New highlighting aims to match how the existing renderer interprets each construct; the set of constructs to support was derived by comparing this editor against established AsciiDoc highlighters (e.g. the VS Code AsciiDoc extension) during specification, and exotic or rarely used syntax beyond the listed constructs is out of scope for this iteration.
- **Fold persistence is per user and document**: Fold state is remembered for the user on the same document and is not shared between users or treated as document content.
- **Refactoring scope = project document tree**: Rename, find-usages, and move-file operate over the project's files (the same resolution scope as US8: persisted content with the open file's unsaved edits applied), not across separate projects.
- **Paste-HTML and spell-check are best-effort**: HTML→AsciiDoc conversion targets common constructs and degrades gracefully for the rest; spell-checking uses a standard dictionary with a user-extensible ignore list and is scoped to prose.
- **Explicitly out of scope this iteration** (identified during the code comparison but deselected): obsolete/deprecated-syntax inspections, table reformatting/column alignment, and document export to HTML/PDF/DocBook. These remain candidates for a later iteration.
