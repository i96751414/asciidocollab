# Feature Specification: Cross-Document Attribute Resolution & Editor State Memory

**Feature Branch**: `027-cross-document-attributes`

**Created**: 2026-06-17

**Status**: Draft

**Input**: User description: "frontend improvements: attributes are not being replaced in the HTML preview for attributes from other parent files; leveloffset defined in parent files is not being considered (editor and HTML preview); Remember the line the editor had open for each file and each user (not just the last open file), when opening that file, go to that line; attributes in sub-documents (documents included in other documents) are not being highlighted in the editor and are not considered in the parent document after the include as attributes; idprefix and idseparator attributes are must be considered for the generation of automatic IDs after they have been defined (not only in the current document but also in included documents after the definition); xrefstyle must be considered in the HTML preview (currently has no impact) after after it has been defined (not only in the current document but also in included documents after the definition), it may redined in the document in different locations with values; table-caption and figure-caption attributes must also be handled appropriately (current document and included document); relation between all these attributes must be considered"

## Overview

AsciiDoc documents are commonly composed from a master file that pulls in other files with `include::` directives. In real AsciiDoc/Asciidoctor semantics, document attributes flow through the whole include tree in reading order: an attribute set in a parent before an include is visible inside the included file, and an attribute set inside an included file remains in effect in the parent for everything after the include. Today the editor and HTML preview treat each file largely in isolation, so attribute values, heading levels, automatic IDs, cross-reference text, and caption labels are wrong whenever they depend on definitions that live in another file. This feature makes attribute resolution honor the full include tree, and—separately—remembers each user's last-edited line for every file so reopening a file returns them to where they were.

The feature also closes a set of AsciiDoc fidelity gaps that share the same attribute-resolution engine and include-assembly path: evaluating conditional preprocessor directives (`ifdef`/`ifndef`/`ifeval`) against the resolved attribute state, honoring partial includes (`tags=`/`lines=`), keeping section numbering (`sectnums`) and the table of contents (`toc`) consistent across includes and level offsets, supporting inline attribute assignment (`{set:name:value}`) and wrapping (multi-line) attribute entry values, and raising editor-highlighting fidelity (constrained/unconstrained inline marks, cross-reference target vs. label, table column specifiers, and inactive conditional branches).

## Clarifications

### Session 2026-06-17

- Q: When an include directive is added/removed/moved or an attribute definition is edited, when does attribute resolution recompute? → A: Live & automatic — the affected include tree re-resolves immediately, updating preview and editor highlighting with no user action.
- Q: When a file is reachable from a designated master/root (possibly via multiple parents or included multiple times), which attribute context governs its own preview/highlighting? → A: Master/root context anchored to the attribute scope in effect at the file's FIRST inclusion point in reading order; attributes defined after that point, and the contexts of any later re-inclusions of the same file, are not considered for that file's own context.
- Q: How is the master/root document determined? → A: The root document is defined at the project level (a single designated root). When no root document is defined for the project, no parent/ancestor context is determined—each file resolves using only its own attributes.
- Q: What is the performance target for live re-resolution after an include/attribute change? → A: Best-effort with no fixed numeric SLA; resolution must update correctly (no stale results once changes settle), but no specific latency target is required.
- Q: Does inline-style "support" cover preview rendering, editor highlighting, or both? → A: Both — inline styles (built-in and role/custom) must render correctly in the HTML preview and be highlighted in the editor.
- Q: How should the editor handle custom/unknown inline styles (future-proofing)? → A: Hybrid — highlight any role-based inline span generically by syntax (so future custom styles work with no code change), and apply distinct emphasis to roles present in a known/configurable registry (built-in known set + configurable custom entries).
- Q: Which STEM (math) notations must the HTML preview render? → A: Both AsciiMath and LaTeX (latexmath), selected by the resolved `:stem:` attribute value (default AsciiMath when `:stem:` is set without a value); per-expression `asciimath:[]` / `latexmath:[]` macros override the active notation.
- Q: What is the scope of STEM rendering — inline, block, or both? → A: Both — inline expressions (`stem:[…]`, `asciimath:[…]`, `latexmath:[…]`) and STEM delimited/display blocks (`[stem]`, `[asciimath]`, `[latexmath]`).
- Q: Where is the project's master/root document configured, and does it already exist? → A: It already exists — it is the project's "main file" setting (Dashboard → projects/[project-id]/settings). This feature consumes that existing setting; it does not add a new root-document configuration.
- Q: How is STEM (math) rendered — self-hosted/bundled, external CDN/service, or other? → A: Rendered client-side in the frontend using a bundled (self-hosted) math rendering library; no external CDN/service and no server-side rendering.
- Q: For editor inline-mark highlighting, full AsciiDoc constrained/unconstrained correctness or a pragmatic heuristic? → A: Full correctness — implement AsciiDoc constrained/unconstrained boundary rules (accepting the inline-tokenizer rework); highlighting must match Asciidoctor behavior (FR-044, SC-016).
- Q: What is the scope of index-term support? → A: Full index — process index terms (no raw markup) and generate the index section/listing where an index macro is present, with links between citations/terms and entries.
- Q: When the open file is not the root, what does the preview render? → A: The open file only (with its own `include::` directives assembled), rendered using the attribute context inherited from its first-include point in the main file; it does not render the whole assembled root.
- Q: Beyond `table-caption`/`figure-caption`, which label/caption attributes are honored? → A: The full family of built-in caption/label/signifier attributes (e.g., `example-caption`, the admonition `*-caption` set, `appendix-caption`, `toc-title`, `chapter-signifier`, `section-refsig`, `version-label`, `last-update-label`, etc.), all resolved through the same cross-document model.
- Q: How should the editor visually treat inactive conditional branches? → A: Inline dimming (reduced opacity/contrast) of the inactive-branch content, recomputed live as the controlling attributes change; the markup stays visible and editable.
- Q: When the project's main file setting changes, when does inherited context re-resolve? → A: Live for all currently-open files immediately — changing the main file re-resolves inherited context and refreshes preview/highlighting for every open file at once.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Attributes resolve across the include tree (Priority: P1)

As an author working in a multi-file AsciiDoc project, when I open and preview a file, every attribute reference (`{name}`) resolves to the value that would apply at that point in the assembled document—whether the attribute was defined in the current file, in a parent/ancestor file before the include, or in an earlier-included sibling file.

**Why this priority**: This is the foundational behavior. Attribute values define what the reader actually sees, and every other improvement in this feature (IDs, xref text, captions, leveloffset) depends on the same cross-document resolution model. Without it the preview shows raw `{name}` placeholders or stale values.

**Independent Test**: Create a parent file that defines `:productName: Acme` then includes a child file that references `{productName}`. Preview the child (and the parent). The rendered output shows "Acme" in both, and editing the parent's value updates both previews.

**Acceptance Scenarios**:

1. **Given** a parent file defines `:productName: Acme` before `include::child.adoc[]`, **When** the child file (which references `{productName}`) is previewed, **Then** the preview renders "Acme" rather than the literal `{productName}`.
2. **Given** an included file defines `:version: 2.0` and the parent references `{version}` on a line after the include, **When** the parent is previewed, **Then** the parent renders "2.0" for that reference.
3. **Given** the same attribute is defined more than once at different points (parent header, then re-set inside an include, then re-set later in the parent), **When** any location is rendered, **Then** the value used is the most recent definition in document reading order up to that point, matching AsciiDoc precedence rules.
4. **Given** an attribute referenced before it is ever defined, **When** the content is previewed, **Then** the system handles the unresolved reference consistently with AsciiDoc default behavior (the reference is left visible/marked rather than silently blanked).
5. **Given** a parent value and a re-definition inside an include of the same attribute, **When** the parent content after the include is rendered, **Then** it reflects the included file's redefinition (attributes set in an include persist into the parent afterward).

---

### User Story 2 - Heading levels honor `leveloffset` across files (Priority: P1)

As an author assembling a book or manual from chapter files, when a parent applies a `leveloffset` to an include, the included file's headings are shifted by that offset in both the HTML preview and the editor's structural understanding, and the offset only applies to the intended scope.

**Why this priority**: Incorrect heading levels break the document outline, the table of contents, and section numbering—the core structure readers rely on. It is a frequent source of confusion in multi-file books.

**Note on current state**: The `leveloffset` *option on an include directive* (`include::child.adoc[leveloffset=+1]`) is already applied during include assembly in the preview. The remaining gaps this story closes are (a) `leveloffset` set as a **document attribute** (`:leveloffset:`) in a parent before/around includes, and (b) the **editor's** structural understanding of either form.

**Independent Test**: A parent includes a child with `include::child.adoc[leveloffset=+1]`, where the child's top heading is a level-1 title. Preview shows the child's title rendered one level deeper (as a level-2 section), and the parent's own headings are unaffected.

**Acceptance Scenarios**:

1. **Given** an include directive specifies `leveloffset=+1`, **When** the included file is rendered within the parent preview, **Then** each of its headings is shifted down one level.
2. **Given** a `leveloffset` attribute is set in the parent before an include (rather than on the include directive), **When** subsequent content/includes are rendered, **Then** the offset applies from that point until it is changed or reset, matching AsciiDoc semantics.
3. **Given** a `leveloffset` applied to an include, **When** that include ends, **Then** the offset no longer affects parent content that follows.
4. **Given** a file that is previewed on its own (not through a parent), **When** no offset applies, **Then** its headings render at their natural levels.

---

### User Story 3 - Automatic IDs honor `idprefix` / `idseparator` across files (Priority: P2)

As an author who links to sections, I rely on auto-generated section IDs being predictable. When `idprefix` and/or `idseparator` are defined, automatically generated IDs for headings after the definition use those settings—whether the definition is in the current file or in an included file before the heading.

**Why this priority**: Auto-generated IDs are the anchors that cross-references and external links target. If they don't honor the configured prefix/separator, links break and the preview's internal navigation is wrong. It depends on US1's resolution model.

**Independent Test**: Set `:idprefix: sect_` and `:idseparator: -` in a parent header, include a child with a heading "My Section". The generated ID for that heading is `sect_my-section` in the preview.

**Acceptance Scenarios**:

1. **Given** `:idprefix:` and `:idseparator:` are set before a heading, **When** that heading's automatic ID is generated, **Then** the ID uses the configured prefix and separator.
2. **Given** these attributes are defined in an included file, **When** headings that appear after the definition (in the same or parent file) are rendered, **Then** their auto IDs reflect the definition.
3. **Given** these attributes are changed partway through the document, **When** later headings are rendered, **Then** earlier headings keep IDs from the earlier setting and later headings use the new setting.
4. **Given** a heading with an explicit, author-supplied ID, **When** it is rendered, **Then** the explicit ID is preserved regardless of `idprefix`/`idseparator`.

---

### User Story 4 - Cross-references honor `xrefstyle` across files (Priority: P2)

As an author, when I set `xrefstyle`, the text shown for cross-references in the HTML preview reflects that style (e.g., full vs. short vs. basic), and the style honors redefinitions at different points in the document, including definitions made inside included files.

**Why this priority**: `xrefstyle` currently has no effect, so cross-reference link text is wrong or inconsistent with the author's intent. It depends on US1's resolution model and on US3's IDs being correct.

**Independent Test**: Set `:xrefstyle: full` in a parent, then reference a numbered section via `<<section-id>>`. The preview renders the cross-reference with the full style label rather than the default.

**Acceptance Scenarios**:

1. **Given** `:xrefstyle:` is set to a supported value before a cross-reference, **When** the preview renders that reference, **Then** the displayed text matches the configured style.
2. **Given** `xrefstyle` is redefined to different values at different points (including inside an included file), **When** references are rendered, **Then** each reference uses the value in effect at its own position in reading order.
3. **Given** no `xrefstyle` is defined, **When** references are rendered, **Then** the default cross-reference text is used.

---

### User Story 5 - Caption / label attributes honor their values across files (Priority: P2)

As an author, the labels on table and figure captions in the HTML preview reflect the `table-caption` and `figure-caption` attributes, resolved across the include tree the same way as other attributes—and the same applies to the full family of built-in label/caption/signifier attributes (example/admonition captions, `toc-title`, signifiers, version/update labels, etc.).

**Why this priority**: Caption labels are reader-facing and often localized or customized (e.g., "Tabela" instead of "Table"). They depend on the same resolution model as US1.

**Independent Test**: Set `:table-caption: Tabela` in a parent, include a child containing a titled table. The preview labels the table caption "Tabela N." instead of "Table N.".

**Acceptance Scenarios**:

1. **Given** `:table-caption:` is set, **When** a titled table is rendered, **Then** its caption label uses the configured value.
2. **Given** `:figure-caption:` is set, **When** a titled image/figure is rendered, **Then** its caption label uses the configured value.
3. **Given** these attributes are defined in an included file before the captioned block, **When** the block is rendered, **Then** the configured label is used.
4. **Given** a caption attribute is set to an empty value, **When** the captioned block is rendered, **Then** captions are suppressed/handled per AsciiDoc semantics.

---

### User Story 6 - Editor highlights attributes defined in included files (Priority: P2)

As an author editing a file, the editor's syntax highlighting recognizes attributes that are in scope from the assembled document—including attributes defined in included sub-documents and in parent files—so attribute references and definitions are visually consistent with how they will actually resolve.

**Why this priority**: Highlighting that ignores cross-document attributes misleads authors about what is and isn't a valid/defined attribute, undermining trust in the editor. It is an editor-side reflection of US1.

**Independent Test**: Open a file that references an attribute defined only in an included sub-document; the reference is highlighted as a known attribute rather than as unknown/plain text.

**Acceptance Scenarios**:

1. **Given** an attribute is defined inside an included file, **When** the parent file is edited, **Then** references to that attribute after the include point are highlighted as known attributes.
2. **Given** an attribute is defined in a parent before an include, **When** the included file is edited, **Then** its references are highlighted as known attributes.
3. **Given** an attribute definition line inside any file in the tree, **When** the file is edited, **Then** the definition is highlighted as an attribute entry.

---

### User Story 7 - Per-file, per-user cursor line is remembered (Priority: P3)

As a user who edits many files, when I reopen any file I previously had open, the editor returns me to the line I was last on in that file—remembered separately for each file and each user, not just for the most recently opened file.

**Why this priority**: A convenience/quality-of-life improvement independent of the attribute work. It reduces the friction of navigating large multi-file projects but does not affect document correctness.

**Independent Test**: User scrolls to line 120 in file A and to line 8 in file B, switches away, then reopens file A; the editor places the cursor/viewport at line 120, and reopening file B returns to line 8.

**Acceptance Scenarios**:

1. **Given** a user had file A open at line 120, **When** they later reopen file A, **Then** the editor positions the cursor at line 120 and scrolls it into view.
2. **Given** a user has remembered positions for several files, **When** they open any of those files, **Then** the position restored is the one for that specific file (positions are not shared across files).
3. **Given** two different users edited the same file at different lines, **When** each reopens the file, **Then** each is returned to their own remembered line, not the other user's.
4. **Given** a file with a remembered line that no longer exists (file became shorter), **When** the user reopens it, **Then** the editor positions at the nearest valid line without error.
5. **Given** a user has never opened a file, **When** they open it for the first time, **Then** it opens at the top (default position).

---

### User Story 8 - Conditional preprocessor directives are evaluated (Priority: P2)

As an author who maintains variant documentation (editions, platforms, draft vs. final) with `ifdef`/`ifndef`/`ifeval`, when I preview a document the conditional blocks are evaluated against the attribute state in effect at that point—including attributes defined in parent/included files—so only the active branches appear, and conditionals that wrap `include::` directives include or skip the target accordingly.

**Why this priority**: Conditional directives are evaluated against attributes—the exact state this feature resolves across the include tree—so they belong with the core. Today they are not reliably honored during include assembly, so readers see content that should have been hidden (or miss content that should appear).

**Independent Test**: A document sets `:draft:` and wraps a paragraph in `ifdef::draft[]…endif::draft[]`; the paragraph appears in the preview. Removing the `:draft:` definition makes it disappear live. An `ifdef::edition-pro[include::pro-only.adoc[]]` includes the file only when `edition-pro` is set.

**Acceptance Scenarios**:

1. **Given** an attribute is set and content is wrapped in `ifdef::name[]…endif::[]`, **When** previewed, **Then** the content appears; when the attribute is unset, the content is omitted.
2. **Given** `ifndef::name[]`, **When** the attribute is not set, **Then** the guarded content appears (and vice versa).
3. **Given** `ifeval::["{ver}" >= "2"]`, **When** the resolved attribute value satisfies the expression, **Then** the guarded content appears.
4. **Given** a conditional that wraps an `include::` directive, **When** the condition is false, **Then** the target is not included (and not assembled); when true, it is included with normal cross-document resolution.
5. **Given** a conditional whose controlling attribute is defined in a parent or included file, **When** the dependent content is previewed, **Then** the branch decision uses the cross-document resolved value.
6. **Given** an attribute that controls a conditional is edited, **When** the change settles, **Then** the preview re-evaluates the branch live (per FR-007a).

---

### User Story 9 - Partial includes by tag and line ranges (Priority: P3)

As an author reusing fragments of other files, when I include only a tagged region (`include::file.adoc[tags=intro]`) or a line range (`include::file.adoc[lines=5..10]`), the preview includes only the selected content, then applies the normal attribute resolution and level offset to it.

**Why this priority**: Partial includes are a common AsciiDoc reuse mechanism; without them the preview pulls in the entire file, producing visibly wrong output. It builds directly on the include-assembly path this feature already modifies.

**Independent Test**: A file marks a region with `// tag::intro[]` … `// end::intro[]`; a parent includes it with `tags=intro`. The preview shows only that region. A `lines=2..4` include shows only those lines.

**Acceptance Scenarios**:

1. **Given** an include with `tags=name`, **When** previewed, **Then** only the content between the matching `tag::name[]`/`end::name[]` markers is included.
2. **Given** an include with multiple/negated tag filters (e.g., `tags=a;!b`, `tags=**`, `tags=*`), **When** previewed, **Then** selection follows AsciiDoc tag-filtering semantics.
3. **Given** an include with `lines=` (single range, multiple ranges, or open-ended like `lines=10..`), **When** previewed, **Then** only those lines are included.
4. **Given** a partial include combined with `leveloffset` and surrounding attributes, **When** previewed, **Then** offset and attribute resolution apply to the selected content.
5. **Given** a tag or line range that does not exist, **When** previewed, **Then** the situation is surfaced gracefully without breaking the rest of the render.

---

### User Story 10 - Section numbering and TOC are consistent across includes (Priority: P3)

As an author of a multi-file book, when `sectnums` and/or `toc` are enabled, the section numbers and the table of contents in the preview reflect the fully assembled document structure—accounting for level offsets and the resolved values of `sectnums`, `sectnumlevels`, `toc`, and `toclevels`.

**Why this priority**: Numbering and TOC are reader-facing structure that depend on the same resolved attributes and the offset-adjusted heading levels from US2. Inconsistent numbering/TOC undermines navigation in long documents.

**Independent Test**: A master enables `:sectnums:` and includes two chapters with `leveloffset=+1`; the preview numbers their sections continuously and correctly, and the generated TOC lists them at the offset-adjusted levels.

**Acceptance Scenarios**:

1. **Given** `:sectnums:` is in effect (resolved across the tree), **When** the assembled document is previewed, **Then** sections are numbered following reading order and `sectnumlevels`.
2. **Given** `:toc:` and `:toclevels:` are in effect, **When** previewed, **Then** the TOC reflects the assembled structure, honoring level offsets.
3. **Given** `sectnums`/`toc` are toggled or changed at a point in the tree, **When** previewed, **Then** the in-effect values at the relevant positions are used.

---

### User Story 11 - Inline attribute assignment and wrapping attribute values (Priority: P2)

As an author, I can assign attributes inline within content using `{set:name:value}` (and unset with `{set:name!}`), and I can write long attribute entry values that wrap across multiple lines using line continuation. Both are resolved in the preview and highlighted in the editor, and both participate in cross-document, reading-order resolution.

**Why this priority**: These are core attribute-definition mechanisms. Inline `{set:}` changes attribute state mid-content (affecting everything that follows, like any definition), and wrapped values are how authors keep long values readable; both must feed the same resolution model this feature builds.

**Independent Test**: A document writes `{set:basedir:src/main/java}` then later references `{basedir}`, which renders `src/main/java`. A multi-line attribute entry `:longval: first line \` + `second line` resolves to the joined value, and the editor highlights all continued lines as one attribute entry.

**Acceptance Scenarios**:

1. **Given** `{set:name:value}` appears in content, **When** the preview renders subsequent references to `{name}`, **Then** they resolve to that value (in reading order, including across the include boundary).
2. **Given** `{set:name!}`, **When** subsequent content is rendered, **Then** the attribute is unset from that point.
3. **Given** an attribute entry whose value wraps across lines via line continuation (trailing `\`), **When** the value is resolved, **Then** the continued lines are joined per AsciiDoc value-continuation semantics.
4. **Given** an inline `{set:}` or a wrapped attribute entry, **When** the file is edited, **Then** the editor highlights the assignment/entry (including all continued lines) consistently with other attribute entries.
5. **Given** an inline `{set:}` definition, **When** an include or attribute elsewhere changes, **Then** re-resolution remains correct and live (per FR-007a).

---

### User Story 12 - Higher-fidelity editor highlighting (Priority: P3)

As an author, the editor highlights AsciiDoc markup with fewer false positives and finer distinctions: inline marks embedded in words are not falsely styled, cross-reference targets and labels are distinguished, table column specifiers are highlighted, and content in inactive conditional branches is visually de-emphasized.

**Why this priority**: These refinements increase trust in the editor's highlighting but do not affect rendered output correctness, so they sit below the rendering and core-attribute work.

**Independent Test**: Typing `a*b*c` in prose does not highlight `b` as bold; `<<sec-1,See section>>` highlights `sec-1` (target) distinctly from `See section` (label); `[cols="1,>2"]` highlights the column spec; content inside a false `ifdef` branch is dimmed.

**Acceptance Scenarios**:

1. **Given** an inline mark embedded within a word (e.g., `a*b*c`, `Vec<3>`), **When** the editor highlights the line, **Then** it is not treated as formatted markup (AsciiDoc constrained-boundary rules), while genuine constrained and unconstrained forms are still highlighted.
2. **Given** a cross-reference with a label (`<<id,label>>`), **When** highlighted, **Then** the target ID and the display label are visually distinguished.
3. **Given** a table block-attribute line with a column specifier (`cols="…"`), **When** highlighted, **Then** the specifier is distinctly tokenized.
4. **Given** a conditional branch that resolves to inactive for the current attribute state, **When** the file is edited, **Then** that branch's content is visually de-emphasized (e.g., dimmed) to reflect that it will not render.

---

### User Story 13 - Remaining AsciiDoc rendering completeness (Priority: P3)

As an author, the remaining AsciiDoc constructs that the preview does not yet handle are rendered correctly: bibliography entries and citations, index terms, counter attributes, and page breaks.

**Why this priority**: These complete AsciiDoc coverage in the preview but are used less frequently than the core attribute/structure features, so they rank lowest. They are still required for full fidelity.

**Independent Test**: A `[bibliography]` section with `[[[ref1]]]` entries and a `<<ref1>>` citation renders linked references; `indexterm:[Term]` / `((Term))` produce index entries; `{counter:fig}` increments on each use; `<<<` produces a page-break boundary in the preview.

**Acceptance Scenarios**:

1. **Given** a `[bibliography]` block with bibliography anchors (`[[[ref]]]`) and citations (`<<ref>>`), **When** previewed, **Then** entries render and citations link to them.
2. **Given** index terms (`indexterm:[…]`, `indexterm2:[…]`, `((…))`), **When** previewed, **Then** they are processed as index entries (and an index is produced where requested) without appearing as raw markup.
3. **Given** counter attributes (`{counter:name}` / `{counter2:name}`), **When** previewed, **Then** each use increments and renders the counter value per AsciiDoc semantics.
4. **Given** a page-break (`<<<`), **When** previewed, **Then** a visible page-break boundary is rendered in the preview.

---

### User Story 14 - Inline styles render and highlight (Priority: P2)

As an author, built-in inline formatting (bold, italic, monospace, highlight/mark, superscript, subscript) and role-based inline spans (`[.role]#text#`) render correctly in the HTML preview and are highlighted in the editor; any role name is highlighted generically, and roles present in a configurable registry receive distinct emphasis without code changes.

**Why this priority**: Inline styles are pervasive AsciiDoc markup; incorrect rendering or highlighting misleads authors about formatting. The generic-plus-registry approach future-proofs custom styles. It is rendering/editor work that sits alongside the other P2 fidelity stories.

**Independent Test**: `[.lead]#text#` renders styled in the preview; an unregistered custom role still highlights generically in the editor; registering a custom role adds its distinct emphasis with no change to highlighting logic.

**Acceptance Scenarios**:

1. **Given** built-in inline formatting and a role span, **When** previewed, **Then** both render with correct styling (FR-021a).
2. **Given** a role-based inline span, **When** edited, **Then** it is highlighted; a registered role receives distinct emphasis while an unknown role is still highlighted generically (FR-021b, FR-021c).
3. **Given** a new custom role added to the registry, **When** the editor highlights it, **Then** it receives distinct emphasis without modifying the highlighting logic (FR-021c).

---

### User Story 15 - STEM (math) rendering (Priority: P2)

As an author, STEM (mathematical) content renders as formatted mathematics in the HTML preview—client-side from a bundled (self-hosted) library—for both AsciiMath and LaTeX, gated by the resolved `:stem:` attribute across the include tree.

**Why this priority**: Math is reader-facing content that is currently unrendered; it shares the cross-document attribute model (`:stem:`) and the sanitization boundary, so it belongs with the rendering work at P2.

**Independent Test**: `:stem:` + `stem:[x^2]` and a `[stem]` block render as math; `latexmath:[…]` uses LaTeX regardless of the active notation; with `:stem:` absent, expressions are not math-rendered.

**Acceptance Scenarios**:

1. **Given** `:stem:` is in effect, **When** inline (`stem:[…]`) and block (`[stem]`) expressions are previewed, **Then** they render as formatted math (FR-021d, FR-021f).
2. **Given** the resolved notation, **When** `asciimath:[…]`/`latexmath:[…]` macros are used, **Then** each renders in its own notation regardless of the active setting (FR-021d).
3. **Given** `:stem:` is changed or disabled at a point across the tree, **When** subsequent expressions are previewed, **Then** they render only where STEM is in effect (FR-021e).
4. **Given** a malformed STEM expression, **When** previewed, **Then** it is surfaced gracefully without breaking the rest of the preview (edge case).

### Edge Cases

- **Circular / repeated includes**: A includes B includes A, or the same file included multiple times—attribute resolution must terminate and not loop indefinitely; repeated includes re-apply attributes at each inclusion point in reading order.
- **Missing / unresolvable include**: When an included file cannot be found, the parent still renders, the missing include is surfaced, and attribute resolution continues with what is available.
- **Attribute referenced before definition**: Handled per AsciiDoc default (reference left visible/marked), not silently removed.
- **Attribute unset / reset**: Explicitly unsetting an attribute (`:!name:`) removes it from scope for subsequent content, including across the include boundary.
- **Deeply nested includes**: Attribute order and offsets remain correct through multiple include levels.
- **Concurrent editing**: When a collaborator changes an attribute definition in one file, previews of dependent files reflect the change (consistent with the existing real-time collaboration model).
- **Locked/header attributes**: Attributes intended to be fixed (e.g., set with override semantics) are not overridden by later in-document definitions, per AsciiDoc precedence.
- **Cursor memory for deleted files**: A remembered position for a file that is later deleted does not cause errors and is cleaned up or ignored.
- **Invalid / unsupported STEM expression**: A malformed or unparseable math expression is surfaced gracefully (e.g., shown as raw text or an inline error indicator) without breaking the rest of the preview.
- **STEM used while `:stem:` not enabled**: Expressions written where STEM is not in effect are not math-rendered (left as written), consistent with AsciiDoc behavior.
- **Conditional referencing an undefined attribute**: `ifdef`/`ifndef` treat an undefined attribute as "not set"; `ifeval` with an unresolved attribute is handled per AsciiDoc semantics without breaking the render.
- **Nested / unbalanced conditionals**: Nested `ifdef`/`ifeval` evaluate correctly; an unclosed or mismatched `endif::[]` is surfaced gracefully and does not abort the render.
- **Conditional around an include of a missing/filtered target**: When the active branch includes a missing file or an empty tag/line selection, it is surfaced without breaking surrounding content.
- **Tag/line selection not found or overlapping**: A `tags=`/`lines=` selection that matches nothing (or overlaps/duplicates) is handled gracefully; the rest of the document still renders.
- **Inline `{set:}` of a locked/override attribute**: An inline assignment that conflicts with a locked/fixed attribute follows AsciiDoc precedence (it does not override a locked value).
- **Wrapped attribute value with blank or final continuation**: A line-continuation (`\`) at the end of the value, or a continued line that is blank, is handled per AsciiDoc value-continuation rules without corrupting the value.
- **Constrained-formatting boundary ambiguity**: Where AsciiDoc's constrained rules are genuinely ambiguous, the editor errs toward not introducing false highlights rather than over-highlighting.
- **Main file setting changed or cleared**: Changing the main file re-resolves inherited context for all open files; clearing it makes open files fall back to standalone resolution—both applied live without requiring a reopen.

## Requirements *(mandatory)*

### Functional Requirements

#### Cross-document attribute resolution (core)

- **FR-001**: The system MUST resolve document attribute references (`{name}`) using the value in effect at that position in the fully assembled include tree, following AsciiDoc/Asciidoctor reading-order semantics.
- **FR-002**: Attributes defined in a parent (or any ancestor) file before an `include::` directive MUST be visible to the included file when it is rendered as part of that parent and when its references are highlighted in the editor.
- **FR-002a**: When a file is reachable from the project's designated master/root document, the inherited (parent) attribute context used for that file's own preview and editor highlighting MUST be the resolved attribute scope in effect at the file's FIRST inclusion point in the master document's reading order. Attribute definitions that appear after that first-include point, and the differing contexts of any subsequent re-inclusions of the same file, MUST NOT alter that file's own inherited context. (The assembled parent document still applies each inclusion's own in-position context when rendering the parent itself, per FR-001.)
- **FR-002b**: The master/root document MUST be the project's existing "main file" setting (configured in project settings). When the project has no main file set, the system MUST NOT determine any parent/ancestor context—each file resolves and is highlighted using only its own attributes (standalone behavior). This feature consumes the existing setting and does not introduce a new root-document configuration.
- **FR-002c**: The HTML preview MUST render the currently open file (with its own `include::` directives assembled), not the whole assembled root document. When the open file is reachable from the main file, it MUST be rendered using the attribute context inherited from its first-include point (per FR-002a); when there is no main file or the file is unreachable, it renders standalone (per FR-002b). All cross-document features in this spec (conditionals, partial includes, numbering/TOC, captions, etc.) apply to the open file under this inherited context.
- **FR-003**: Attributes defined inside an included file MUST remain in effect for the parent document's content that follows the include, and for subsequent sibling includes, matching AsciiDoc scoping.
- **FR-004**: When an attribute is defined multiple times across the tree, the system MUST use the most recent definition in document reading order up to the reference point, honoring AsciiDoc attribute precedence (including overrides that are locked/fixed).
- **FR-005**: The system MUST support explicit unsetting (`:!name:`) so that an attribute is removed from scope for subsequent content across file boundaries.
- **FR-006**: The system MUST resolve attributes consistently between the HTML preview and the editor's attribute awareness, so highlighting and rendering agree on what is defined.
- **FR-007**: The system MUST terminate attribute resolution safely for repeated or circular includes without infinite loops, and surface unresolvable includes without aborting the rest of the render.
- **FR-007a**: The system MUST automatically re-resolve attributes throughout the affected include tree—immediately and without user action—whenever the include structure changes (an include directive is added, removed, or relocated) or an attribute definition is edited, updating both the HTML preview and editor highlighting.
- **FR-007b**: When the project's main file setting changes, the system MUST immediately re-resolve the inherited context and refresh the preview and editor highlighting for every currently-open file (not only on the next open/refresh).

#### `leveloffset`

- **FR-008**: The system MUST apply a `leveloffset` specified on an `include::` directive to the headings of the included file, shifting their levels in the HTML preview and in the editor's structural understanding.
- **FR-009**: The system MUST apply a `leveloffset` set as a document attribute from its definition point onward, and stop applying it when it is changed or reset, per AsciiDoc semantics.
- **FR-010**: The system MUST scope an include-directive `leveloffset` to that include only, restoring the prior offset for parent content that follows.

#### Automatic IDs (`idprefix` / `idseparator`)

- **FR-011**: When generating automatic IDs for headings, the system MUST apply the `idprefix` and `idseparator` values in effect at that heading's position, including values defined earlier in included files.
- **FR-012**: The system MUST preserve author-supplied explicit IDs, ignoring `idprefix`/`idseparator` for those headings.
- **FR-013**: Changes to `idprefix`/`idseparator` partway through the document MUST affect only headings that appear after the change.

#### Cross-references (`xrefstyle`)

- **FR-014**: The system MUST render cross-reference link text in the HTML preview according to the `xrefstyle` value in effect at each reference's position.
- **FR-015**: The system MUST honor `xrefstyle` redefinitions at different points in the document, including definitions inside included files, applying the value in effect at each reference.
- **FR-016**: When no `xrefstyle` is in effect, the system MUST use the default cross-reference text.

#### Captions (`table-caption` / `figure-caption`)

- **FR-017**: The system MUST render table caption labels using the `table-caption` value in effect at the block's position, resolved across the include tree.
- **FR-018**: The system MUST render figure/image caption labels using the `figure-caption` value in effect at the block's position, resolved across the include tree.
- **FR-019**: The system MUST handle empty/unset caption attributes per AsciiDoc semantics (suppressing the label where appropriate).
- **FR-019a**: Beyond `table-caption`/`figure-caption`, the system MUST resolve and apply the full family of built-in label/caption/signifier attributes through the same cross-document model, including (non-exhaustively) `example-caption`, the admonition caption set (`note-caption`, `tip-caption`, `important-caption`, `warning-caption`, `caution-caption`), `appendix-caption`, `toc-title`, `chapter-signifier`, `part-signifier`, `section-refsig`, `version-label`, and `last-update-label`.

#### Editor highlighting

- **FR-020**: The editor MUST highlight attribute references that resolve to definitions located in included sub-documents or in parent/ancestor files, not only definitions within the currently edited file.
- **FR-021**: The editor MUST highlight attribute definition entries within any file of the include tree.

#### Inline styles

- **FR-021a**: The HTML preview MUST correctly render AsciiDoc inline styles, including built-in inline formatting (e.g., bold, italic, monospace, highlight/mark, superscript, subscript) and role-based inline spans (e.g., `[.role]#text#`).
- **FR-021b**: The editor MUST highlight inline styles—both built-in inline formatting and role-based inline spans—so authors can visually distinguish styled text and its markup.
- **FR-021c**: The editor MUST highlight role-based inline spans generically by their syntax, so any role name—including custom styles added in the future—is highlighted without code changes. Additionally, roles present in a known/configurable registry (the built-in known set plus configurable custom entries) MUST receive distinct emphasis. The registry MUST be extensible so new custom styles can be registered without modifying the highlighting logic.

#### STEM (math) rendering

- **FR-021d**: The HTML preview MUST render STEM (mathematical) content client-side in the frontend using a bundled (self-hosted) math renderer—no external CDN/service or server-side rendering—supporting both AsciiMath and LaTeX (latexmath). The active notation MUST follow the `:stem:` attribute value resolved through the cross-document model (defaulting to AsciiMath when `:stem:` is set without an explicit value), while per-expression `asciimath:[…]` / `latexmath:[…]` macros use their own notation regardless of the active setting.
- **FR-021e**: STEM rendering MUST honor the `:stem:` attribute being enabled, disabled, or changed at different points across the include tree (per FR-001/FR-007a), so expressions render only where STEM is in effect.
- **FR-021f**: STEM rendering MUST cover both inline expressions (`stem:[…]`, `asciimath:[…]`, `latexmath:[…]`) and STEM delimited/display blocks (`[stem]`, `[asciimath]`, `[latexmath]`).

#### Per-file, per-user cursor memory

- **FR-022**: The system MUST remember, per user and per file, the last cursor line the user had in that file—maintaining a remembered position for every file the user has opened, not only the most recently opened file.
- **FR-023**: When a user opens a file with a remembered position, the system MUST place the cursor at that line and scroll it into view.
- **FR-024**: Remembered positions MUST be isolated per user (one user's position does not affect another's) and per file.
- **FR-025**: When a remembered line no longer exists in a file, the system MUST position at the nearest valid line without error.
- **FR-026**: When a user opens a file with no remembered position, the system MUST open it at the default (top) position.
- **FR-027**: Remembered positions MUST persist across editing sessions for the same user.

#### Conditional preprocessor directives (`ifdef` / `ifndef` / `ifeval`)

- **FR-029**: The HTML preview MUST evaluate `ifdef::[]`, `ifndef::[]`, and `ifeval::[]` directives against the attribute state resolved at that position across the include tree, rendering only the active branches and omitting inactive ones.
- **FR-030**: Conditional evaluation MUST be applied during include assembly so that a conditional wrapping an `include::` directive includes or skips (and does not assemble) the target according to the resolved condition.
- **FR-031**: Conditional evaluation MUST re-run live when a controlling attribute or the include structure changes (per FR-007a), and MUST handle undefined attributes, nested conditionals, and unbalanced/mismatched directives gracefully without aborting the render.
- **FR-032**: The editor MUST highlight conditional directives and visually de-emphasize inactive branches by **inline dimming** (reduced opacity/contrast) the content of branches that resolve to inactive for the current attribute state, while keeping that content visible and editable. The dimming MUST recompute live as the controlling attributes change.

#### Partial includes (`tags=` / `lines=`)

- **FR-033**: Include assembly MUST support tag-based partial includes (`include::file[tags=…]`), honoring AsciiDoc tag-filtering semantics including multiple tags, negation (`!tag`), and the `*`/`**` wildcards, selecting only the matching tagged regions.
- **FR-034**: Include assembly MUST support line-range partial includes (`include::file[lines=…]`), including single ranges, multiple ranges, and open-ended ranges, selecting only the specified lines.
- **FR-035**: Attribute resolution and `leveloffset` MUST apply to the content that remains after tag/line filtering, consistent with full-file includes.
- **FR-036**: A tag or line selection that matches nothing (or is otherwise invalid) MUST be surfaced gracefully without breaking the rest of the render.

#### Section numbering & table of contents (`sectnums` / `toc`)

- **FR-037**: The HTML preview MUST honor `sectnums` and `sectnumlevels` resolved across the include tree, numbering sections per reading order and the offset-adjusted heading levels (US2).
- **FR-038**: The HTML preview MUST honor `toc` and `toclevels` resolved across the include tree, generating a table of contents that reflects the assembled structure and level offsets.
- **FR-039**: Changes to `sectnums`/`sectnumlevels`/`toc`/`toclevels` at different points in the tree MUST use the value in effect at the relevant position.

#### Inline attribute assignment & wrapping attribute values

- **FR-040**: The HTML preview MUST process inline attribute assignment expressions (`{set:name:value}` to set, `{set:name!}` to unset) at their position in reading order, affecting subsequent references and participating in cross-document resolution and live re-resolution (FR-001/FR-007a).
- **FR-041**: The HTML preview MUST support wrapping (multi-line) attribute entry values via line continuation (a trailing `\` continues the value on the next line), joining the continued lines per AsciiDoc value-continuation semantics.
- **FR-042**: The editor MUST highlight inline attribute-assignment expressions (`{set:…}`) and MUST highlight wrapped attribute entry values across all continued lines as a single attribute entry.
- **FR-043**: Inline assignments and wrapped attribute values MUST honor AsciiDoc precedence, including not overriding locked/fixed attributes.

#### Higher-fidelity editor highlighting

- **FR-044**: The editor MUST apply AsciiDoc constrained/unconstrained boundary rules for inline marks so that marks embedded within a word (e.g., `a*b*c`, `Vec<3>`) are not falsely highlighted, while both genuine constrained and unconstrained forms are recognized.
- **FR-045**: The editor MUST distinguish a cross-reference's target ID from its optional display label in highlighting (e.g., `<<id,label>>`).
- **FR-046**: The editor MUST distinctly tokenize table column-format specifiers (e.g., `cols="1,>2"`) within block-attribute lines.

#### Remaining rendering completeness

- **FR-047**: The HTML preview MUST render bibliography sections and entries (`[bibliography]`, `[[[ref]]]`) and resolve citations (`<<ref>>`) as links to those entries.
- **FR-048**: The HTML preview MUST process index terms (`indexterm:[…]`, `indexterm2:[…]`, and the `((…))` / `(((…)))` flow forms) so they do not appear as raw markup, AND MUST generate the index section/listing wherever an index macro (e.g., `index::[]`) is present, with the listing reflecting the indexed terms.
- **FR-049**: The HTML preview MUST render counter attributes (`{counter:name}` / `{counter2:name}`), incrementing and substituting their values per AsciiDoc semantics.
- **FR-050**: The HTML preview MUST render a visible page-break boundary for the page-break syntax (`<<<`).

#### Attribute relationships

- **FR-028**: The system MUST treat `idprefix`, `idseparator`, `xrefstyle`, `table-caption`, `figure-caption`, `leveloffset`, `sectnums`, `sectnumlevels`, `toc`, `toclevels`, `stem`, attributes controlling conditionals, and attributes set via inline `{set:}` or wrapped entries as participants in the same cross-document, reading-order resolution model, so that their interactions (e.g., an ID generated with a given prefix being targeted by a cross-reference whose text depends on `xrefstyle`, or a conditional gated on an attribute set in an included file) are mutually consistent.

### Key Entities *(include if feature involves data)*

- **Attribute Definition**: A named attribute with a value (or unset marker), an originating file, and a position in the assembled reading order; carries precedence/lock information.
- **Resolved Attribute Scope**: The effective set of attribute values at a given position in the assembled document, derived by walking the include tree in reading order.
- **Include Edge**: A relationship from a parent file to an included file at a specific position, optionally carrying directive options such as `leveloffset`, `tags`, and `lines`.
- **Conditional Region**: A span of content guarded by `ifdef`/`ifndef`/`ifeval`, with a controlling condition evaluated against the resolved attribute state to decide whether the region (and any include it wraps) is active.
- **Inline Attribute Assignment**: An attribute set/unset (`{set:name:value}` / `{set:name!}`) occurring within content at a position in reading order, contributing to the resolved attribute scope from that point onward.
- **Editor Cursor Position Record**: A remembered line for a (user, file) pair, persisted so it can be restored when that user reopens that file.
- **Inline Style Registry**: An extensible set of known inline styles—built-in styles plus configurable custom entries (by role name)—used to give registered roles distinct emphasis in the editor; new custom styles can be registered without modifying highlighting logic.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For documents composed of multiple files, 100% of attribute references that have a definition somewhere in the include tree before the reference resolve to the correct value in the preview (no literal `{name}` placeholders shown when a definition exists).
- **SC-002**: Headings of included files render at the level dictated by the applicable `leveloffset` in 100% of tested parent/child combinations, and the document outline/TOC matches the assembled structure.
- **SC-003**: Automatic heading IDs match the configured `idprefix`/`idseparator` for 100% of headings that follow such a definition, while explicit IDs are preserved.
- **SC-004**: Cross-reference link text matches the `xrefstyle` in effect at each reference in 100% of tested cases, including after redefinition.
- **SC-005**: Table and figure caption labels—and the broader built-in label/caption/signifier family (example/admonition captions, `toc-title`, signifiers, version/update labels)—match their configured values in 100% of tested cases across the include tree.
- **SC-006**: Attribute references resolved from included or parent files are visually highlighted in the editor in 100% of tested cases.
- **SC-007**: After switching among at least three files and reopening each, the editor restores the correct remembered line for each file for the current user in 100% of cases, and restoration occurs within a typical file-open time (under ~1 second, no perceptible extra delay).
- **SC-008**: No infinite loops, crashes, or blank previews occur for repeated, circular, or missing includes; the rest of the document still renders.
- **SC-009**: After an include directive is added, removed, or relocated, or an attribute definition is edited, the preview and editor highlighting reflect the recomputed resolution once changes settle, with no stale `{name}` values, heading levels, IDs, xref text, or caption labels remaining. (Best-effort timing; no fixed latency SLA.)
- **SC-010**: Built-in inline formatting and role-based inline spans (including unregistered custom role names) are correctly rendered in the preview and highlighted in the editor in 100% of tested cases; registering a new custom style adds its distinct emphasis without changes to the highlighting logic.
- **SC-011**: When `:stem:` is in effect, inline and block STEM expressions render as formatted mathematics in the HTML preview in 100% of tested cases, for both AsciiMath and LaTeX per the resolved notation; where `:stem:` is not in effect, such expressions are not math-rendered.
- **SC-012**: Conditional directives (`ifdef`/`ifndef`/`ifeval`)—including those wrapping `include::` directives and those gated on attributes defined in parent/included files—render the correct active branches in 100% of tested cases, and re-evaluate live when controlling attributes change.
- **SC-013**: Partial includes by `tags=` and `lines=` include only the selected content in 100% of tested cases, with attribute resolution and `leveloffset` correctly applied to the selection.
- **SC-014**: With `sectnums`/`toc` enabled, section numbers and the table of contents match the assembled, offset-adjusted document structure in 100% of tested cases.
- **SC-015**: Inline `{set:…}` assignments and wrapped (multi-line) attribute entry values resolve to the correct values in the preview and are highlighted in the editor in 100% of tested cases.
- **SC-016**: For a representative prose corpus, the editor produces no false inline-formatting highlights for marks embedded within words (constrained-boundary rule), while genuine constrained and unconstrained marks remain correctly highlighted; cross-reference target/label and table column specifiers are distinctly highlighted in 100% of tested cases.
- **SC-017**: Bibliography entries/citations, index terms, counter attributes, and page breaks render correctly (no raw markup leaking into the output) in 100% of tested cases.

## Assumptions

- The expected attribute scoping, precedence, `leveloffset`, ID-generation, `xrefstyle`, and caption behaviors follow standard AsciiDoc/Asciidoctor semantics; where the description is silent, Asciidoctor's documented behavior is the source of truth.
- Include resolution builds on the project's existing centralized include/image path-resolution logic; this feature extends attribute/level handling on top of it rather than reinventing path resolution.
- Cross-document attribute resolution operates over the project's file set as edited in the collaborative editor (the same file tree used for includes), and updates as collaborators edit, consistent with the existing real-time preview/collaboration model.
- Per-file, per-user cursor positions are persisted per-user in the browser (`localStorage`), in line with the project's existing approach to persisting per-user editor state (e.g., file-selection persistence in `use-last-selection.ts`), and are therefore available across sessions for the same user on the same browser. Cross-device persistence is out of scope for this feature (see research R8); a server-backed `UserEditorState` model can be added later without changing the hook interface if cross-device is required.
- "Line" for cursor memory refers to the editor line; restoring a position means placing the cursor on that line and scrolling it into view. Restoring exact column/scroll offset is a nice-to-have, not required.
- Supported `xrefstyle` values are those defined by AsciiDoc (e.g., default, full, short, basic); unsupported values fall back to default behavior.
- The HTML preview continues to use the project's current AsciiDoc rendering pipeline; this feature corrects attribute/level/ID/xref/caption handling within that pipeline rather than replacing it.
- STEM support is scoped to HTML-preview rendering (both AsciiMath and LaTeX). Editor syntax highlighting of STEM markup is not a specific requirement of this clarification; STEM markup is treated like other AsciiDoc markup by the editor unless addressed separately.
- STEM is rendered client-side in the frontend using a bundled (self-hosted) math rendering library; there is no external CDN/service dependency and no server-side math rendering. The specific library is an implementation choice deferred to planning, provided it can render both AsciiMath and LaTeX in the browser and operate within the sandboxed preview.
- Conditional directives, partial includes (`tags`/`lines`), section numbering (`sectnums`/`sectnumlevels`), and TOC (`toc`/`toclevels`) follow standard AsciiDoc/Asciidoctor semantics; conditional and partial-include evaluation is performed within the existing include-assembly step rather than relying on a separate engine.
- Conditional evaluation is scoped to the documented directives (`ifdef`, `ifndef`, `ifeval`); arbitrary expression languages beyond AsciiDoc's `ifeval` grammar are out of scope.
- Inline attribute assignment is the AsciiDoc `{set:name:value}` / `{set:name!}` form; wrapping attribute values use AsciiDoc's value line-continuation. Both are preview-rendered and editor-highlighted.
- Achieving correct constrained/unconstrained inline highlighting is acknowledged to likely require reworking the editor's inline tokenizer (lookbehind/boundary awareness); the requirement is on the observable highlighting outcome, not the implementation approach.
- Bibliography, index terms, counter attributes, and page breaks (US13) follow standard AsciiDoc/Asciidoctor rendering semantics. User-defined Asciidoctor extensions / custom macros remain out of scope (they require registering executable extensions, which the safe-mode preview pipeline intentionally does not load).
