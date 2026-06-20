# Feature Specification: AsciiDoc Editor Syntax Highlighting Rework

**Feature Branch**: `030-syntax-highlighting-rework`

**Created**: 2026-06-20

**Status**: Draft

**Input**: User description: "Rework the editor's AsciiDoc syntax highlighting so document STRUCTURE recedes and the writer's CONTENT leads, and so every common AsciiDoc construct is distinguishable at a glance."

## Clarifications

### Session 2026-06-20

- Q: How should the document title (heading level 0, single `=`) be treated relative to levels 1–3? → A: Level 0 gets its own deepest/strongest color; h1/h2/h3 ramp lighter from there; levels deeper than 3 reuse the level-3 treatment (four distinct heading colors, 0–3).
- Q: How distinct must the warm admonition severities (warning/important/caution) be from each other? → A: All five severities are mutually distinct — note = info blue/teal, tip = green, warning = amber, important = red, caution = orange.
- Q: What contrast standard makes the "adequate contrast" success criterion testable? → A: WCAG 2.1 AA — 4.5:1 for normal-size token text and 3:1 for large/bold text, against the editor background, in both light and dark modes.
- Q: How strictly must the delivered scheme match the `AsciiDoc Highlighting Review.html` "Proposed" column (what do acceptance tests assert)? → A: Directional + behavioral gates — the HTML is the design intent; the hard, tested gates are the behavioral FRs (markup recedes, heading levels / admonition severities / list types distinct, links followable) plus WCAG 2.1 AA contrast. Tests assert distinctness and contrast, not exact hex values; minor hue tuning to meet contrast is permitted.
- Q: What is the performance posture, given new constructs (inline code, links, attribute refs, callouts) must now be tokenized on the editing hot path? → A: Out of scope — this is a presentation-only rework; highlighting performance is not an acceptance gate for this feature and is left to the existing tokenizer infrastructure.
- Q: How should a test mechanically prove two same-family treatments (e.g., adjacent heading levels, list types) are distinguishable "by color alone"? → A: Minimum perceptual delta — adjacent same-family treatments MUST differ by a defined perceptual threshold (CIE ΔE in CIELAB, or an equivalent lightness/hue gap), asserted in tests; the concrete threshold is fixed during planning (recommended floor ΔE ≥ 15 for "distinct at a glance").

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Structural markup recedes so content leads (Priority: P1)

As a writer, the symbols I type to structure a document (`=`, `*`, `_`, `|`, list markers, block fences) stay visually quiet so the words I wrote are what I see first. Today these symbols are as loud as — or louder than — the prose, and whole constructs are flooded with a single color, burying the text inside them.

**Why this priority**: This is the core problem the feature exists to solve. If markup punctuation is dimmed to a consistent "scaffold" treatment and constructs stop flooding, the editor immediately reads as content-first. Every other story builds on this foundation, and delivering only this story already makes the editor materially more readable.

**Independent Test**: Open a document containing headings, bold/italic spans, lists, a table, and a delimited block. Confirm that the structural punctuation (heading `=`, emphasis `*`/`_`, list markers, table `|`, block fences) renders in a single muted treatment that is visibly quieter than the surrounding content, and that no construct floods its interior with one color.

**Acceptance Scenarios**:

1. **Given** a heading written as `== Section`, **When** it is displayed in the editor, **Then** the leading `=` characters render in the muted markup treatment while the heading text renders in its heading color.
2. **Given** a paragraph containing `*bold*` and `_italic_`, **When** it is displayed, **Then** the `*` and `_` delimiters render muted while the enclosed words render with legible emphasis.
3. **Given** a delimited block (table, example, sidebar, stem, or listing), **When** it is displayed, **Then** the fences/separators render muted and the block body text renders at normal readability rather than being flooded with a single color.

---

### User Story 2 - Heading levels are distinguishable by color (Priority: P1)

As a writer scanning a long document, I can tell heading levels apart by color, not only by size. Today every heading is the same teal with a heavy underline, so a level-1 and a level-2 look identical except for font size.

**Why this priority**: Scanning structure is a primary editing activity, and color-coded hierarchy is the most-cited current pain point alongside the flooding problem. It is small in scope but high in daily value.

**Independent Test**: Create a document with a document title (level 0) and headings at levels 1, 2, and 3. Confirm each level is rendered in a visibly distinct color following a deep→light progression, and that the heavy underline treatment is gone.

**Acceptance Scenarios**:

1. **Given** headings at levels 0, 1, 2, and 3, **When** they are displayed, **Then** each level renders in a distinct color that is distinguishable from the adjacent levels.
2. **Given** any heading, **When** it is displayed, **Then** it no longer carries the previous heavy underline decoration.

---

### User Story 3 - Admonitions show severity from a compact label (Priority: P2)

As a writer, a NOTE/TIP/WARNING/IMPORTANT/CAUTION shows me its severity from the label without dyeing the whole paragraph, and the message itself stays easy to read. Today admonitions flood their entire block (or whole line, for the inline `NOTE:` form) in purple — label, body, and fences alike.

**Why this priority**: Admonitions are common and the current flooding is one of the most-readability-damaging behaviors, but the construct is less pervasive than headings, emphasis, and lists, so it ranks below P1.

**Independent Test**: Write both an inline admonition (`NOTE: ...`) and a block admonition (`[NOTE]` followed by a delimited block) for each severity. Confirm only the label receives a severity-specific treatment and the body text renders normally.

**Acceptance Scenarios**:

1. **Given** an inline admonition `TIP: remember to save`, **When** it is displayed, **Then** the `TIP:` label receives a tip-specific treatment and `remember to save` renders as normal body text.
2. **Given** a block admonition `[WARNING]` over a delimited block, **When** it is displayed, **Then** the `[WARNING]` label receives a warning-specific treatment, the fences render muted, and the block body renders as normal text.
3. **Given** admonitions of severities note, tip, warning, important, and caution, **When** they are displayed, **Then** each severity is visually distinguishable from the others by its label treatment.

---

### User Story 4 - Block interiors stay readable (Priority: P2)

As a writer, the contents of a table, example, sidebar, stem, or listing block are readable — the block markup recedes instead of coloring everything inside it, and block titles read as captions rather than stray colored lines.

**Why this priority**: Delimited blocks carry significant authored content, and the current flooding (purple for tables/stem/sidebar, green for example) actively hides that content. It is grouped with admonitions at P2 because it affects a meaningful but not universal share of editing.

**Independent Test**: Create a table, an example block, a sidebar, a stem block, and a listing block, each with a `.Block Title` line. Confirm fences/separators recede, the title reads as a caption, and the interior content is not flooded with a single color.

**Acceptance Scenarios**:

1. **Given** a table with header and body cells, **When** it is displayed, **Then** the `|` separators recede and cell content is readable; header cells are emphasized relative to body cells where header detection is available (best-effort — otherwise cells stay readable and the limitation is documented).
2. **Given** a block introduced by `.My Title`, **When** it is displayed, **Then** the title renders as a caption treatment rather than as a stray amber line.
3. **Given** a stem/math span or block, **When** it is displayed, **Then** the math is scoped to its own treatment rather than flooding the enclosing block.
4. **Given** a nested table — an `a|` cell wrapping an inner `!===` table with `!` separators — **When** it is displayed, **Then** the `!===` delimiter and `!` separators recede into the same muted markup as `|===`/`|`, and the nested cell content reads as normal text (not plain prose, not flooded).

---

### User Story 5 - List types, inline code, and links are each distinct (Priority: P2)

As a writer, I can tell an unordered item, an ordered item, a description-list term, and a checked vs. unchecked task apart; inline `` `code` `` and links are visibly distinct from each other and from prose. Today a list dyes the entire line solid blue (marker and words), real links render as inert plain text, description lists and checklists turn solid blue, and inline code gets no treatment at all — so the clickable thing looks dead and the prose looks clickable.

**Why this priority**: This resolves several collisions where unlike constructs share a color or where meaningful constructs get no treatment. It is high value but depends on the P1 scaffold/marker model being in place first.

**Independent Test**: Create unordered, ordered, description, and checklist (done + todo) list items, plus a paragraph containing inline code, a bare URL, and a labeled link. Confirm the list marker is muted while item text is normal, each list type is distinguishable, checked vs. unchecked tasks differ, and inline code and links each have a distinct treatment with links reading as followable.

**Acceptance Scenarios**:

1. **Given** an unordered item, an ordered item, and a description-list term, **When** they are displayed, **Then** each is visually distinguishable from the others and the marker is muted while the item text renders normally.
2. **Given** a checklist with a done item and a todo item, **When** they are displayed, **Then** the done and todo states are visually distinguishable from each other.
3. **Given** a paragraph with inline `` `code` ``, a bare URL, and a labeled link, **When** it is displayed, **Then** inline code has a distinct treatment, and links read as followable and are distinct from list items and from prose.

---

### User Story 6 - Document header, attributes, and callouts read correctly (Priority: P3)

As a writer, the document header (author line, revision line), attribute references, and callouts are highlighted as the distinct constructs they are rather than as plain prose, so the top-of-document metadata and inline references are recognizable.

**Why this priority**: These constructs are less frequently edited than body content and lists, but leaving them as plain text is part of the "mis-or-un-highlighted" problem the feature sets out to fix.

**Independent Test**: Create a document header with author and revision lines, a paragraph with an attribute reference (`{attr}`), and a listing block with callouts. Confirm each is visually distinct from plain prose.

**Acceptance Scenarios**:

1. **Given** a document header with an author line and a revision line, **When** it is displayed, **Then** the author and revision metadata are visually distinguished from body prose.
2. **Given** a paragraph containing an attribute reference such as `{version}`, **When** it is displayed, **Then** the reference is visually distinct from surrounding prose.
3. **Given** a callout marker on a code line and its matching callout list item, **When** they are displayed, **Then** the callouts are visually distinct from prose and from other list types.

---

### Edge Cases

- What happens when a single line mixes multiple constructs — e.g., a list item that contains bold text, inline code, and a link? Each inline construct must retain its own treatment within the item rather than the line being flooded by the list treatment.
- How does the scheme handle nested constructs — e.g., emphasis inside a table cell, or an admonition inside an example block? Inner constructs keep their treatment; outer block markup stays muted.
- How does the scheme handle a nested table — an `a|`/`a!` AsciiDoc-format cell containing an inner `!===` table with `!` separators (per the Asciidoctor nested-tables rules)? The `!===` delimiter, the `!` separators, and the `a|`/`a!` cell prefix recede to the muted `--markup` treatment exactly like `|===`/`|`, and the nested cell content stays readable. The `!` separators must NOT render as plain prose (the pre-rework behavior) and must NOT flood the cell. Inside a verbatim cell (`a|` wrapping a listing) a literal `!` is inert (FR-019).
- How does the scheme treat verbatim contexts (listing/literal/code blocks) where `*`, `_`, `|`, and `{...}` are literal text, not markup? Inside verbatim contexts these characters must NOT be styled as emphasis, table, or attribute markup.
- What happens with a heading level deeper than the explicitly-distinguished range (e.g., level 4 or 5)? It must still render legibly by reusing the level-3 treatment rather than falling back to flooding or to an undefined style.
- How does the scheme behave when the editor theme is switched between light and dark mode mid-session? All treatments must remain legible with adequate contrast in both modes without requiring a reload.
- What happens for an inline admonition label that appears mid-sentence rather than at line start (not a real admonition)? It must not receive the admonition label treatment (only genuine admonitions are styled).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The editor MUST render structural markup punctuation — heading `=`, emphasis `*` and `_`, list markers, block fences, and table `|` separators — in a single consistent muted "markup/scaffold" treatment that is visually distinct from, and quieter than, content.
- **FR-002**: The editor MUST render heading levels 0 through 3 in four distinct colors that follow a deep→light progression and are distinguishable from one another and from body text. The document title (level 0, single `=`) MUST receive its own deepest/strongest color, with level 1, 2, and 3 ramping progressively lighter/desaturated.
- **FR-003**: The editor MUST NOT apply the previous heavy underline decoration to headings.
- **FR-004**: Headings deeper than level 3 MUST reuse the level-3 treatment (a defined, legible style) rather than reverting to flooding or an undefined style.
- **FR-005**: The editor MUST render bold content and italic content as legibly distinct from body text and from each other, while rendering their delimiters in the muted markup treatment.
- **FR-006**: The editor MUST render admonition labels for the inline form (`NOTE:`) and the block form (`[NOTE]`) with a severity-specific treatment for each of note, tip, warning, important, and caution, while leaving the admonition body text rendered as normal content (not flooded). All five severities MUST be mutually distinguishable: note = info blue/teal, tip = green, warning = amber, important = red, caution = orange.
- **FR-007**: The editor MUST only apply admonition label treatment to genuine admonitions (a recognized inline label at line start, or a recognized block attribute), and MUST NOT flood the surrounding line or block.
- **FR-008**: The editor MUST render delimited blocks (table, example, sidebar, stem, listing) without flooding their interior with a single color; fences and separators MUST recede into the muted markup treatment and interior content MUST remain readable.
- **FR-009**: The editor MUST render block titles (lines beginning with `.`) as a caption treatment rather than as a stray colored line.
- **FR-010**: The editor MUST render tables so that `|` separators recede and cell content is readable. Header cells SHOULD be emphasized relative to body cells where reliable header detection is available; where it is not, the editor MUST fall back to readable, non-flooded cells and the limitation MUST be documented. Header-cell emphasis is best-effort and is NOT a hard acceptance gate; separator-recede and readable cells are. Nested tables (the `!`-separator form) are covered by FR-023.
- **FR-011**: The editor MUST render math/STEM content scoped to its own treatment rather than flooding the enclosing block.
- **FR-012**: The editor MUST render unordered items, ordered items, description-list terms, and checklist items such that each list type is visually distinguishable from the others, with the marker muted and the item text rendered as normal content.
- **FR-013**: The editor MUST render checklist done and todo states as visually distinguishable from each other.
- **FR-014**: The editor MUST render inline code (`` `code` ``) with a distinct treatment that it currently lacks.
- **FR-015**: The editor MUST render links — both bare URLs and labeled links — with a treatment that reads as followable and is distinct from list items and from prose.
- **FR-016**: The editor MUST render the document header author line and revision line as visually distinct from body prose.
- **FR-017**: The editor MUST render attribute references (e.g., `{name}`) as visually distinct from surrounding prose.
- **FR-018**: The editor MUST render callouts (markers and their matching callout-list items) as visually distinct from prose and from other list types.
- **FR-019**: Within verbatim contexts (listing/literal/source blocks), the editor MUST NOT style literal `*`, `_`, `|`, `!`, or `{...}` characters as emphasis, table, nested-table, or attribute markup.
- **FR-020**: Every treatment defined by this scheme MUST meet WCAG 2.1 AA contrast against the editor background — 4.5:1 for normal-size token text and 3:1 for large or bold text — in both light and dark editor modes, and MUST remain legible when the mode is switched within a session.
- **FR-021**: The rework MUST NOT change the rendered (preview) output, the sanitization behavior, or editing behavior; it affects only the presentation of the editor source.
- **FR-022**: Where constructs previously collided on the same color (e.g., lists vs. links, description lists/checklists turning solid blue, tables coloring every part identically), the refreshed scheme MUST give each colliding construct a distinct treatment.
- **FR-023**: The editor MUST highlight nested tables (an AsciiDoc-format cell — `a|` in a `|` table, `a!` in a nested table — containing an inner table delimited by `!===` with `!` cell separators) consistently with top-level tables: the nested-table delimiter `!===`, the `!` cell separators, and the `a|`/`a!` AsciiDoc-cell-style prefix MUST recede into the muted `--markup` treatment (the same treatment as `|===`/`|`), and the nested cells' content MUST remain readable rather than rendering as plain prose or being flooded. Nesting MAY be highlighted to a single level of depth; deeper nesting MUST at minimum keep `!===`/`!` receded and content readable.

### Key Entities

- **Construct treatment**: A named visual style (color, weight, emphasis) assigned to one AsciiDoc construct or sub-part (e.g., "heading level 2", "muted markup", "tip label", "inline code", "link"). Attributes: target construct, light-mode appearance, dark-mode appearance, role (content vs. scaffold/markup vs. caption vs. label).
- **Severity label set**: The five admonition severities, each mapped to a mutually-distinct label treatment shared by the inline and block forms — note = info blue/teal, tip = green, warning = amber, important = red, caution = orange.
- **Heading level scale**: An ordered mapping from heading level to a distinct color following a deep→light progression: level 0 (document title) deepest/strongest, then level 1, 2, 3 progressively lighter; levels deeper than 3 reuse the level-3 color (four distinct colors total).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Given a representative document exercising all covered constructs, a writer can correctly identify the level of any heading (0–3, including the document title as level 0) by color alone, without relying on font size, in 100% of cases. Adjacent heading levels MUST differ by at least the defined minimum perceptual color-difference threshold (CIE ΔE, or equivalent lightness/hue gap; exact value set in planning) so distinctness is automatically verifiable.
- **SC-002**: For every covered construct, the structural punctuation renders in the shared muted markup treatment while the authored content does not — verifiable as 0 cases where a construct floods its interior content with a single color.
- **SC-003**: A writer can correctly distinguish all five admonition severities (note, tip, warning, important, caution) from their label alone — each in its own tint — and confirm the body text of each renders identically to normal paragraph text.
- **SC-004**: A writer can correctly tell apart an unordered item, an ordered item, a description-list term, a checked task, and an unchecked task, and can distinguish inline code and links from one another and from prose — in 100% of cases on a representative sample. Same-family treatments that must be told apart (the list types; checked vs. unchecked) MUST differ by at least the defined minimum perceptual color-difference threshold so distinctness is automatically verifiable.
- **SC-005**: Every previously plain-or-mis-highlighted construct (document header author/revision, bare URLs, inline code, attribute references, callouts) is now visually distinct from plain prose.
- **SC-006**: Every treatment passes a WCAG 2.1 AA contrast check against its background — 4.5:1 for normal-size token text, 3:1 for large/bold text — in both light and dark mode.
- **SC-007**: The rendered preview output for a representative document is byte-for-byte identical before and after the rework, confirming no change to reader-facing output, sanitization, or editing behavior.

## Assumptions

- The set of AsciiDoc constructs to cover is the constructs named in the description (headings 0–3+, bold/italic, inline/block admonitions of the five standard severities, tables — **including nested tables** in the `a|`/`a!` + `!===`/`!` form (FR-023), example/sidebar/stem/listing blocks, block titles, unordered/ordered/description/checklist lists, callouts, inline code, links, document header author/revision, attribute references) plus the source languages already supported inside listing blocks; no constructs beyond these are introduced.
- "Light and dark mode" refers to the editor's existing theme modes; this feature reuses them and does not add a new theme-switching mechanism.
- Contrast is measured against WCAG 2.1 AA (4.5:1 for normal-size token text, 3:1 for large/bold), evaluated against the editor background in both light and dark palettes.
- `AsciiDoc Highlighting Review.html` is the visual source of truth for design intent: the right ("Proposed") column is the target appearance and the left ("Current") column documents today's behavior. Conformance is verified directionally — acceptance tests assert the behavioral requirements (markup recedes; heading levels, admonition severities, and list types are distinct; links read as followable) and WCAG 2.1 AA contrast, not exact hex values; minor hue tuning to satisfy contrast in either mode is permitted.
- A single fixed scheme is delivered and it replaces the current scheme outright; it is not a second selectable theme, and no user-facing color picker is in scope.
- The existing source-language highlighting inside listing/source blocks is retained as-is; only its surrounding block fences/title treatment changes.
- Heading hierarchy is keyed off AsciiDoc heading level (number of leading `=`), and the document title is treated as level 0.

## Out of Scope

- Changing the rendered (preview) output.
- A user-customizable color picker or multiple selectable themes.
- Rich semantic editor features beyond coloring (folding, linting, outline).
- Non-AsciiDoc languages inside source blocks beyond what is already supported.
- Highlighting/tokenization performance targets: this presentation-only rework is not gated on a performance budget, and editing-latency or large-document load targets are left to the existing tokenizer infrastructure.
