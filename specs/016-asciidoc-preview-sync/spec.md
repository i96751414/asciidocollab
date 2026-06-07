# Feature Specification: AsciiDoc Live Preview with Source Sync

**Feature Branch**: `016-asciidoc-preview-sync`

**Created**: 2026-06-05

**Status**: Draft

**Input**: User description: "start phase 7 - HTML preview + auto-save (Asciidoctor.js Web Worker, sync state indicator), ask me relevant questions, the preview must be styled, there should be tracking between the HTML preview and the asciidoc source (clicking somewhere in the asciidoc file will bring to view the associated place in the HTML)"

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Styled live HTML preview (Priority: P1)

An author writes AsciiDoc content in the editor and sees a rendered, professionally styled HTML preview in the right panel. The preview updates automatically as the author writes — without requiring a manual refresh. The rendered output looks like a real published document: headings have visual hierarchy, code blocks are formatted, tables are readable, images display inline, and admonitions (NOTE, WARNING, TIP) are visually distinct.

**Why this priority**: The unstyled or manually refreshed preview in Phase 5 was a placeholder. Authors need to see what their document will look like as they write — this is the core value proposition of a browser-based editor. Styling is not cosmetic; it determines whether the preview is usable for judging layout and content quality.

**Independent Test**: An author opens an AsciiDoc file containing a level-2 heading, a code block, a table, a NOTE admonition, and an image reference. The preview panel shows each element styled distinctly — the heading is larger than body text, the code block is monospaced with a background, the table has borders and alternating row shading, the admonition has an icon and coloured sidebar, and the image renders inline. The author types a new paragraph; the preview updates within a few seconds without any manual action.

**Acceptance Scenarios**:

1. **Given** an AsciiDoc file is open in the editor, **When** the preview panel is visible, **Then** it renders the document as styled HTML — not raw markup and not unstyled plain text.
2. **Given** the author stops typing for the configured debounce period, **When** the preview re-renders, **Then** the update occurs without a full-page reload and the panel maintains its current scroll position — it does not jump to the last clicked position or reset to the top.
3. **Given** the document contains a code block with a language attribute (e.g., `[source,ruby]`), **When** rendered in the preview, **Then** the block is displayed in a monospaced font with syntax-appropriate background styling.
4. **Given** the document contains a NOTE, WARNING, TIP, or CAUTION admonition, **When** rendered, **Then** each type is visually distinguishable from the others and from body text.
5. **Given** the author is actively typing, **When** the preview is re-rendering, **Then** a visible loading indicator distinguishes "rendering" from "up to date" so the author knows the preview may be stale.
6. **Given** the AsciiDoc source contains a syntax error or unrecognised construct, **When** the preview renders, **Then** the output degrades gracefully — correctly formed sections still render; the panel does not show a blank white screen or an unhandled error.

---

### User Story 2 — Click-to-scroll source-to-preview tracking (Priority: P1)

An author working in a long document clicks on a line in the AsciiDoc editor and the preview panel scrolls to display the corresponding section of the rendered HTML. This removes the need to manually scroll both panels to find the same position in the document.

**Why this priority**: Without tracking, authors working on long documents must manually synchronise two scroll positions — the editor and the preview — every time they want to see the rendered output of a specific section. This friction grows linearly with document length and is particularly painful during review and editing cycles. Source-to-preview tracking is the primary differentiator of an integrated editor over a separate preview tool.

**Independent Test**: An author has a 200-line AsciiDoc document open. They click on a line inside Section 5 of the document. The preview panel scrolls so that the heading of Section 5 is visible near the top of the preview. They then click on a line in Section 2; the preview scrolls up to Section 2. Both jumps work independently and reliably.

**Acceptance Scenarios**:

1. **Given** the author clicks on any line in the editor, **When** the click is detected, **Then** the preview panel scrolls so the rendered content corresponding to that line is visible.
2. **Given** the author clicks on a heading line (`= Title`, `== Section`), **When** tracked, **Then** the preview scrolls to that heading.
3. **Given** the author clicks inside a delimited block (code block, example block, table), **When** tracked, **Then** the preview scrolls to the start of that block.
4. **Given** the author clicks on a body paragraph line, **When** tracked, **Then** the preview scrolls to the nearest containing block (paragraph, list, section heading).
5. **Given** the document is short enough that all content is visible in the preview without scrolling, **When** the author clicks anywhere in the editor, **Then** no jarring scroll occurs (the preview stays put or scrolls minimally).
6. **Given** the preview has not yet rendered (e.g., the file was just opened), **When** the author clicks in the editor, **Then** tracking is deferred until the first render completes — no errors are thrown.

---

### User Story 3 — Sync state indicator (Priority: P2)

An author always knows whether the preview reflects the current state of the document. A visible indicator in or near the preview panel shows one of three states: "up to date", "rendering", or "preview unavailable". The indicator updates in real time as the author types and as the preview finishes rendering.

**Why this priority**: Without a sync indicator, the author cannot tell whether a discrepancy between the editor and the preview is because the preview is still catching up or because of a rendering error. This ambiguity undermines trust in the preview. The indicator is the smallest piece of UI that restores that trust.

**Independent Test**: An author opens a file. The indicator shows "up to date." The author types several lines. The indicator immediately changes to "rendering." After the debounce period elapses and the preview updates, the indicator returns to "up to date." The author introduces a malformed block attribute; the indicator shows "preview unavailable" (or equivalent). All three states are observable independently without instrumentation.

**Acceptance Scenarios**:

1. **Given** the preview is current with the editor content, **When** displayed, **Then** the sync indicator shows an "up to date" state.
2. **Given** the author has typed new content that has not yet been rendered, **When** the debounce window is open, **Then** the indicator shows a "rendering" or "pending" state.
3. **Given** the Asciidoctor rendering process has failed (e.g., a fatal parse error), **When** the failure occurs, **Then** the indicator shows an error state with a short human-readable message; the previous rendered output remains visible rather than disappearing.
4. **Given** the author is viewing a non-AsciiDoc file (e.g., a `.txt` or `.json` file), **When** the preview panel is open, **Then** the indicator shows idle state (a "–" symbol) and the preview area shows a "preview not available" message.

---

### Edge Cases

- What happens when the AsciiDoc document includes `include::` directives referencing files not in the project? The preview should render the directive line as literal text or show a partial-render warning — it must not crash.
- What happens when the document is very large (10,000+ lines)? The rendering debounce may need to be extended; the preview should not block the editor.
- What happens when the author rapidly types many characters in quick succession? Each keystroke should reset the debounce timer; only one render should occur per debounce window, not one per keystroke.
- What happens when the preview panel is collapsed? Rendering should be suspended while collapsed and resume (with a fresh render) when the panel is expanded.
- What happens when the author navigates to a different file while a render is in progress? The in-flight render should be cancelled and a new one started for the newly selected file.
- What happens when the author drags the resize divider while a render is in progress? The render should complete normally; the new panel dimensions should be adopted when the render result is displayed.
- What happens when the author drags the preview panel to its minimum width? The panel stays at minimum width; it cannot be dragged further. Releasing and re-dragging outward works normally.

## Clarifications

### Session 2026-06-06

- Q: What visual style should the HTML preview target? → A: The preview should closely approximate the Asciidoctor-PDF output style — typography, spacing, admonition styling, and table appearance should feel consistent with what the author would see in the generated PDF.
- Q: Which PDF theme is the reference for the preview stylesheet? → A: The default Asciidoctor-PDF theme. When a custom PDF theme is introduced in Phase 12, the preview stylesheet can be updated to match.

### Session 2026-06-05

- Q: Must the preview panel be resizable? → A: Yes — the divider between the editor and preview panels must be draggable; resizing the preview widens/narrows the editor correspondingly.
- Q: What is the preview debounce duration? → A: Shorter than the auto-save debounce (default ~1–2 seconds), configurable at the application level; not a per-user preference.
- Q: What triggers source-to-preview tracking? → A: Mouse click only — keyboard cursor movement does not trigger preview scroll.
- Q: Should the panel split ratio persist across sessions? → A: Session only — resets to default on each page load.
- Q: How do panels respond to browser window resize? → A: Proportional — both panels scale with the window, maintaining their width ratio.
- Q: What happens to the preview scroll position when a re-render fires? → A: Maintain current scroll position — the preview stays exactly where it is; the user may have manually scrolled since the last click.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The preview panel MUST render AsciiDoc content as styled HTML whose visual appearance closely approximates the default Asciidoctor-PDF theme — typography, heading hierarchy, spacing, admonition styling (icons, coloured sidebars), table borders, and code block formatting MUST feel consistent with what the author would see in the generated PDF. When a custom PDF theme is introduced in a later phase, the preview stylesheet MAY be updated to match.
- **FR-002**: The preview MUST update automatically after the author stops editing for a configurable debounce period (default: 1–2 seconds, shorter than the auto-save debounce). The debounce duration MUST be configurable at the application level; it is not a per-user preference.
- **FR-003**: The preview panel MUST display a sync state indicator with at least three states: up to date, rendering/pending, and error.
- **FR-004**: When the author clicks on a line in the AsciiDoc editor, the preview panel MUST scroll to display the rendered content corresponding to that editor line. Keyboard cursor movement (arrow keys, Page Up/Down, jump-to-line) does NOT trigger preview scroll.
- **FR-005**: Source-to-preview tracking MUST work for all block nodes returned by the Asciidoctor.js `doc.findBy({})` traversal — including section headings, delimited blocks (code, example, quote, table), body paragraphs, ordered and unordered lists, admonition blocks (NOTE, WARNING, TIP, CAUTION, IMPORTANT), and image macros. The TreeProcessor injects `data-source-line` on every block that has a resolvable source location.
- **FR-006**: The preview MUST NOT block or delay editor input at any point — rendering must occur off the main thread.
- **FR-007**: When a render fails, the preview MUST retain the last successfully rendered output and show an error indicator; it MUST NOT display a blank panel.
- **FR-008**: Rendering MUST be suspended when the preview panel is collapsed and resume on expansion.
- **FR-009**: The preview stylesheet MUST be applied consistently and MUST approximate the Asciidoctor-PDF output style — the rendered output looks the same regardless of which editor theme is selected. The preview always renders in a fixed light theme matching the PDF aesthetic; it does not adapt to the user's OS dark/light mode preference or the active editor theme. This requirement extends FR-001: FR-001 defines which elements to style; FR-009 mandates that those styles are immutable with respect to editor theme and OS colour scheme.
- **FR-010**: When a non-AsciiDoc file is selected, the preview panel MUST enter its idle state and display a "preview not available" message rather than attempting to render.
- **FR-011**: The preview MUST handle `include::` directives gracefully — the directive line is displayed as literal text in the preview output. Server-side resolution of included files is out of scope for this phase.
- **FR-012**: The divider between the editor panel and the preview panel MUST be draggable — dragging it resizes both panels simultaneously (widening one narrows the other). Each panel MUST enforce a minimum width so neither can be fully collapsed via the drag handle. The split ratio resets to the application default on each page load; it is not persisted across sessions. When the browser window is resized, both panels scale proportionally to maintain their width ratio.

### Key Entities

- **PreviewState**: The current rendering state of the preview panel — one of `idle`, `pending`, `rendering`, `up-to-date`, `error`.
- **data-source-line convention**: The source-to-HTML mapping is encoded as a `data-source-line` HTML attribute on each block-level element produced by Asciidoctor. The attribute value is the 1-based AsciiDoc line number of the corresponding block, injected by the TreeProcessor extension. No separate SourceMap data structure exists; scroll logic queries the DOM directly.
- **RenderResult**: The output of a single render pass — the sanitized HTML string and any error from the renderer.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The preview updates within the configured debounce period (default 1–2 seconds) of the author stopping typing for a normally-sized document (under 1,000 lines), without any manual action.
- **SC-002**: Clicking a line in the editor causes the preview to scroll to the correct section within 300 milliseconds. This target is an architectural guarantee of the synchronous click-dispatch path (`mousedown` handler → `scrollIntoView`) — no separate performance test is required; the implementation satisfies it structurally.
- **SC-003**: Editor input latency is unaffected by preview rendering — keystrokes register immediately with no visible lag.
- **SC-004**: The sync indicator accurately reflects the actual preview state at all times — it never shows "up to date" when the preview is stale.
- **SC-005**: The preview is visually styled to closely approximate the Asciidoctor-PDF output — an author can use it to judge the final published appearance of their document, including heading hierarchy, code block formatting, table layout, and admonition styling, with confidence that the PDF will look similar.

## Assumptions

- The editor (CodeMirror 6) is already in place from Phase 6 — this feature builds on top of it without replacing it.
- The preview panel is the right-hand collapsible panel from the Phase 5 three-panel layout; this feature replaces its current "manual refresh" behaviour with live rendering.
- Auto-save (editor content persisted to the backend on a debounce) was implemented in Phase 6 and is not re-implemented here — but preview rendering is triggered by editor content changes, not by save events.
- The preview renders in the browser using Asciidoctor.js; no server-side rendering call is required for the preview itself.
- Source-to-preview tracking is one-directional in this phase: editor cursor/click → preview scroll. The reverse direction (clicking in the preview to move the editor cursor) is out of scope for this phase.
- `include::` directives that reference external URLs or files outside the project are out of scope for resolution in this phase.
- PDF export remains out of scope; the preview is HTML-only.
