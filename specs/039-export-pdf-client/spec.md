# Feature Specification: In-Browser PDF Export

**Feature Branch**: `039-export-pdf-client`

**Created**: 2026-07-11

**Status**: Draft

**Input**: User description: "Let a user export the AsciiDoc project they are editing in asciidocollab to a print-ready PDF directly from the browser, without their source content being sent to a server for rendering, producing output that matches what the project's reference Asciidoctor PDF toolchain (its CLI / Maven build) produces for the same inputs. The reference build is the fidelity oracle."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - One-click faithful PDF export (Priority: P1)

An author editing a multi-file AsciiDoc specification clicks **Export to PDF** and receives a downloadable, print-ready PDF of the current document. The PDF reflects the project's own theme, fonts, images, and AsciiDoc configuration — not a generic default style — and its appearance matches what the project's reference Asciidoctor PDF toolchain (CLI / Maven build) produces for the same inputs. The document's source never leaves the browser during rendering.

**Why this priority**: This is the core value of the feature and the minimum viable product. Confidential documents (e.g. GB smart-metering specifications) must be renderable without uploading source to a server, and the output must be trustworthy enough to substitute for the server/Maven build. Without this, nothing else matters.

**Independent Test**: Open a representative multi-file project that has a custom theme and branded fonts, click Export to PDF, and confirm a PDF downloads whose theme, fonts, and layout match the reference build for the same project, with no source content transmitted to a server (verifiable via network inspection).

**Acceptance Scenarios**:

1. **Given** a project with a top-level document, **When** the user clicks Export to PDF, **Then** a PDF file is generated in the browser and offered as a download.
2. **Given** a project defining a custom PDF theme and branded fonts, **When** the user exports, **Then** the PDF uses those fonts and theme rather than built-in defaults.
3. **Given** the export is running, **When** network activity is inspected, **Then** no document source content (including referenced URLs) is transmitted to any server — v1 is fully offline; remote resources are unsupported and skipped-with-warning (see FR-013).
4. **Given** the same project rendered by the reference Asciidoctor PDF toolchain, **When** compared with the in-app export, **Then** the two outputs are equivalent per the agreed fidelity bar (see SC-001).

---

### User Story 2 - Multi-file includes resolve correctly (Priority: P1)

An author's top-level document pulls in other files via `include::` directives, some using include filters (tag selection, line-range selection, leveloffset). When exported, the included content appears in the PDF exactly where and how the reference toolchain would place it.

**Why this priority**: Real specifications are composed of many files; an export that only handles a single flat file is not usable for the target documents. Include resolution (with filters) is intrinsic to how these projects are authored, so it is part of the MVP alongside Story 1.

**Independent Test**: Export a document that includes several files, at least one via a tag filter and one via a line-range filter, and confirm the resulting PDF contains exactly the selected content in the correct order and nesting.

**Acceptance Scenarios**:

1. **Given** a document with nested `include::` directives, **When** exported, **Then** all included content appears in the correct order and section nesting.
2. **Given** an include using a tag filter (`tags=...`), **When** exported, **Then** only the tagged region of the target file appears.
3. **Given** an include using a line-range filter (`lines=...`), **When** exported, **Then** only the selected lines appear.
4. **Given** an include target that cannot be resolved, **When** exported, **Then** the export surfaces a clear warning identifying the unresolved include rather than silently omitting content or failing opaquely.

---

### User Story 3 - Live PDF preview while editing (Priority: P2)

A reviewer or author keeps a live PDF preview open beside the editor. As the document changes, the preview updates to reflect the current content without the user having to trigger a manual export, and without freezing or noticeably degrading the editing experience.

**Why this priority**: Instant, faithful feedback is a major part of the value proposition ("not a round-trip to a build server"), but the one-click export in Story 1 already delivers standalone value. Live preview is a strong enhancement layered on the same rendering path.

**Independent Test**: Open the live PDF preview, make a series of edits, and confirm the preview updates to match within a responsive time budget while the editor remains fully interactive throughout.

**Acceptance Scenarios**:

1. **Given** the live preview is open, **When** the user edits the document, **Then** the preview updates to reflect the change without a manual export step.
2. **Given** rapid consecutive edits, **When** the preview is updating, **Then** the editor remains responsive and typing is never blocked.
3. **Given** the live preview and a final export of the same document state, **When** compared, **Then** both represent the same content faithfully.

---

### User Story 4 - Diagrams, math, citations, and highlighted code render faithfully (Priority: P2)

A document contains text-described diagrams, mathematical notation, bibliographic citations backed by the project's bibliography source, and source-code blocks. When exported, each of these renders correctly and in the same visual style the reference toolchain produces, and code blocks are syntax-highlighted.

**Why this priority**: These are common and important in technical specifications, but a project can produce a valuable, faithful PDF of prose, structure, images, and includes without them. They extend fidelity coverage rather than gate the MVP.

**Independent Test**: Export a document containing at least one diagram, one math expression, one citation with a bibliography entry, and one source-code block, and confirm each renders in the PDF in a style matching the reference build.

**Acceptance Scenarios**:

1. **Given** a text-described diagram in the source, **When** exported, **Then** the rendered diagram appears in the PDF matching the reference toolchain's style.
2. **Given** mathematical notation in the source, **When** exported, **Then** it renders as typeset math matching the reference output.
3. **Given** citations and a bibliography source, **When** exported, **Then** in-text citations and the bibliography/reference list render in the reference style.
4. **Given** a source-code block, **When** exported, **Then** the code is syntax-highlighted.

---

### Edge Cases

- **Unsupported / exotic image format**: An image in an unsupported format is referenced. The export must not fail silently — it produces the PDF for the rest of the document and surfaces a clear per-resource warning about the image that could not be embedded.
- **Missing glyphs / unavailable fonts**: A document uses a script (e.g. CJK) whose glyphs are absent from the available fonts, or a declared font cannot be loaded. The export surfaces a warning identifying the affected text/font and falls back predictably rather than producing garbled or blank output.
- **Very large documents / rapid edits**: A large document under rapid live-preview edits must keep the editor responsive; preview updates may be coalesced/debounced but must not block typing or crash the tab.
- **Remote resource referenced**: A document references a remote include or image. In v1 remote resources are unsupported (export is fully offline — see FR-013): the export surfaces a clear warning naming the resource, skips it, and continues with the rest of the document. No attempt is made to fetch it (which would disclose the URL off-client).
- **Malformed diagram / math / citation source**: The offending block is reported with a clear, localized error (identifying the block) and the rest of the document still exports.
- **No content to export**: An empty or unparseable top-level document yields a clear message rather than an empty or corrupt file.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide a one-click "Export to PDF" action for the project the user is currently editing, producing a downloadable PDF of the selected/top-level document.
- **FR-002**: The system MUST render the PDF entirely on the client, without transmitting document source content to a server for rendering. (In v1 this is absolute — see FR-013: remote resources are unsupported and skipped, so no content, including referenced URLs, leaves the client.)
- **FR-003**: The exported PDF MUST honor the project's own PDF theme, fonts, images, and AsciiDoc attributes/extension behavior, rather than a fixed default style.
- **FR-004**: The system MUST resolve multi-file projects, including nested `include::` directives and include filters (tag selection, line-range selection, and leveloffset), so that included content appears correctly in the output.
- **FR-005**: The exported PDF MUST achieve element-level style parity with the reference Asciidoctor PDF toolchain (CLI / Maven build) output for the same project inputs: the fonts, spacing, colors, and layout of each rendered block MUST match the reference, verified per element (not necessarily pixel-identical whole pages).
- **FR-006**: The system MUST syntax-highlight source-code blocks in the exported PDF.
- **FR-007**: The system MUST render embedded diagrams described in text form for the diagram types the reference toolchain commonly produces, matching the reference toolchain's output style.
- **FR-008**: The system MUST render mathematical notation (in scope for v1), matching the reference toolchain's output style.
- **FR-009**: The system MUST render formatted in-text citations and a bibliography/reference list from the project's bibliography source, matching the reference toolchain's output style.
- **FR-010**: The system MUST provide a live PDF preview that updates to reflect the current document as it changes.
- **FR-011**: Export and live preview MUST remain responsive and MUST NOT freeze or block the editor; live-preview updates MAY be coalesced/debounced but MUST NOT block user input.
- **FR-012**: On any resource that cannot be embedded or rendered (unsupported image, missing font/glyph, unreachable remote resource, malformed diagram/math/citation), the system MUST surface a clear, localized warning identifying the resource/block and MUST still produce the PDF for the remainder of the document.
- **FR-013**: Export MUST operate fully offline with respect to document content: only locally-available resources are rendered, and NO document content (including referenced URLs) leaves the client. Remote includes/images the browser cannot resolve from local project resources are NOT supported in v1 — each such reference MUST raise a clear warning (per FR-012) and be skipped, with the rest of the document still exported. (No backend fetch proxy in v1.)
- **FR-014**: The exported PDF MUST be print-ready (correct page geometry, embedded fonts, selectable text where the reference build produces selectable text).

### Key Entities *(include if feature involves data)*

- **AsciiDoc Project**: The set of source files, attributes, and configuration the user is editing; the unit that is exported. Composed of a top-level document plus included files.
- **Project Theme / Font Set**: The project-specific PDF theme and font resources that govern appearance; must be applied instead of defaults.
- **Bibliography Source**: The project's citation data used to render in-text citations and the reference list.
- **Reference Output**: The PDF produced by the project's canonical Asciidoctor PDF toolchain (CLI / Maven) for the same inputs; the fidelity oracle the in-app export is measured against.
- **Export Artifact**: The downloadable PDF produced in-browser.
- **Rendering Warning**: A per-resource/per-block notice raised when something could not be embedded or rendered, without aborting the whole export.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A representative real project (custom theme + branded fonts + images + diagrams + citations + includes) exports in-browser to a PDF that achieves element-level style parity with the reference server/Maven build — the fonts, spacing, colors, and layout of each block match — and a reviewer accepts it as equivalent. Comparison is made against a reference-output fixtures corpus maintained by the project team.
- **SC-002**: For the representative project, 100% of `include::` directives (including tag, line-range, and leveloffset filters) resolve to the same content and placement as the reference build.
- **SC-003**: No document source content (including referenced URLs) is transmitted to a server during export or preview, verifiable by network inspection. (v1 is fully offline — FR-013.)
- **SC-004**: During live preview, the editor remains interactive at all times — user input is never blocked — and the preview reflects a given edit within a responsive time budget for a representative document. The deferred numeric target is now pinned from measurement: on the reference document a warm re-render (engine convert only, excluding debounce) completes in **under 1000 ms** (measured ~300 ms; see plan Performance Goals / quickstart "Measured performance").
- **SC-005**: Every unrenderable resource or block (unsupported image, missing glyph/font, unreachable remote resource, malformed diagram/math/citation) produces an identifiable warning and never causes the whole export to fail silently; the rest of the document still exports.
- **SC-006**: Source-code blocks in the exported PDF are syntax-highlighted, matching the reference build's highlighting style.

## Assumptions

- The project already carries (or references) the theme, fonts, and bibliography data needed for rendering; this feature consumes them and does not author or edit them.
- The "reference toolchain" is the project's existing Asciidoctor PDF CLI / Maven build; this feature does not modify that path (it remains the appearance source of truth).
- Fonts declared by the project are assumed licensed for embedding/delivery to the client; verifying font licensing is the project owner's responsibility, not enforced by this feature. [Documented as an assumption in lieu of a blocking clarification.]
- Output format is PDF only; HTML/EPUB and other formats are out of scope.
- "Responsive" for live preview means the editor thread is never blocked; the concrete latency target has been measured and pinned in SC-004 (warm re-render < 1000 ms on the reference document); size budgets are recorded in the quickstart "Measured performance" section.
- The export operates on the current project state as edited in the browser (the collaborative/editor document), not a separately-stored server copy.
- v1 is fully offline: remote includes/images are unsupported and skipped-with-warning; a backend fetch proxy may be reconsidered in a later increment.
- Diagram support in v1 targets the diagram types the reference toolchain commonly produces; the exact engine/type list is fixed during planning against representative projects. Mathematical notation is in scope for v1.
- The reference-output fixtures corpus used to judge parity is maintained by the project team.

## Out of Scope

- The existing server/Maven rendering path (remains the reference; not modified).
- Output formats other than PDF (HTML, EPUB, etc.).
- Authoring or editing themes, diagrams, or bibliography data — this feature is export only.
