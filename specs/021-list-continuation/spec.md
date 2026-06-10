# Feature Specification: AsciiDoc List Auto-Continuation

**Feature Branch**: `021-list-continuation`

**Created**: 2026-06-09

**Status**: Draft

**Input**: User description: "clicking enter (creating a new line) inside an ordered or unordered list, checklist, or description list creates another item in the next line, for instance, when in an unordered list item pressing enter will not just introduce a new line but also a * at the begining to the new line"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Continue an unordered list with one keystroke (Priority: P1)

A writer is typing a bulleted list in the editor. After finishing an item and pressing Enter, the editor starts the next bullet automatically so they can keep typing content without re-typing the marker. When they have no more items, pressing Enter on the now-empty bullet clears the marker and drops them out of the list.

**Why this priority**: Unordered lists are the most common list type, and the marker-retyping friction is exactly what the user reported. This single story delivers the core value and is a usable MVP on its own.

**Independent Test**: Type `* first`, press Enter, confirm the new line begins with `* ` and the cursor sits after it; type `second`, press Enter twice, confirm the trailing empty bullet is removed and the cursor lands on a normal blank line.

**Acceptance Scenarios**:

1. **Given** the cursor is at the end of `* Buy milk`, **When** the user presses Enter, **Then** a new line `* ` is inserted and the cursor is placed after the marker.
2. **Given** an item using the dash marker `- Item`, **When** the user presses Enter, **Then** the new item reuses `- ` (the same marker character), not `* `.
3. **Given** a nested item `** Sub-item` (two-level), **When** the user presses Enter, **Then** the new item is `** ` at the same nesting depth.
4. **Given** an empty item `* ` (marker only, no content), **When** the user presses Enter, **Then** the marker is removed and the line becomes empty (the user exits the list).
5. **Given** the cursor is in the middle of `* Hello world` (between "Hello " and "world"), **When** the user presses Enter, **Then** the item splits into `* Hello ` and a new `* world`.
6. **Given** the cursor is on an ordinary, non-list line, **When** the user presses Enter, **Then** a plain newline is inserted (behavior unchanged).

---

### User Story 2 - Continue ordered lists (Priority: P2)

A writer building a numbered or step-by-step list presses Enter and the editor continues the ordered list with the correct next marker, so steps stay sequential without manual numbering.

**Why this priority**: Ordered lists are common for procedures but slightly less frequent than bullets, and they rely on the same continuation mechanism as User Story 1.

**Independent Test**: Type `. Step one`, press Enter and confirm a new `. ` line; type `1. Step one`, press Enter and confirm a new `2. ` line.

**Acceptance Scenarios**:

1. **Given** the cursor at the end of an implicitly-numbered item `. Preheat oven`, **When** Enter is pressed, **Then** the new line is `. ` at the same level.
2. **Given** an explicitly-numbered item `1. First`, **When** Enter is pressed, **Then** the new line is `2. `.
3. **Given** a nested ordered item `.. Sub-step`, **When** Enter is pressed, **Then** the new line is `.. `.
4. **Given** an empty ordered item `. `, **When** Enter is pressed, **Then** the marker is removed and the user exits the list.

---

### User Story 3 - Continue checklists with an unchecked box (Priority: P2)

A writer maintaining a task list presses Enter after a task and the editor starts a new task with an empty checkbox, ready to be ticked later — never copying a "checked" state into the new item.

**Why this priority**: Checklists are a valued sub-case of unordered lists; reusing the marker while resetting the checkbox is a specific behavior worth calling out separately.

**Independent Test**: Type `* [ ] Task A`, press Enter and confirm `* [ ] `; on `* [x] Done`, press Enter and confirm the new item is `* [ ] ` (unchecked).

**Acceptance Scenarios**:

1. **Given** `* [ ] Write tests`, **When** Enter is pressed, **Then** the new line is `* [ ] `.
2. **Given** a checked item `* [x] Ship it`, **When** Enter is pressed, **Then** the new item is `* [ ] ` (unchecked), not `* [x] `.
3. **Given** an empty checklist item `* [ ] `, **When** Enter is pressed, **Then** the marker and checkbox are removed and the user exits the list.
4. **Given** a dash-based checklist item `- [x] Done`, **When** Enter is pressed, **Then** the new item is `- [ ] ` (unchecked) — Asciidoctor accepts checkboxes on `-` items as well as `*`.

---

### User Story 4 - Continue description lists (Priority: P3)

A writer authoring a description (term/definition) list presses Enter and the editor continues the list at the same level so they can add the next term/definition pair.

**Why this priority**: Description lists are the least common of the four supported types and have the most ambiguity in how continuation should look, so they carry the lowest priority.

**Independent Test**: Type `CPU:: The brain`, press Enter and confirm a new line at the same indentation carrying the `::` separator followed by a space, with the cursor after it; on the resulting `:: ` line press Enter again and confirm the separator is removed (the user exits to a blank line).

**Acceptance Scenarios**:

1. **Given** the cursor at the end of `CPU:: The processor`, **When** Enter is pressed, **Then** a new line `:: ` is inserted at the same indentation and the cursor is placed after the separator.
2. **Given** a deeper item `Term::: Detail`, **When** Enter is pressed, **Then** the new line is `::: ` (same separator level).
3. **Given** an empty description item `:: ` (separator only, no other content), **When** Enter is pressed, **Then** the separator is removed and the user exits the list, leaving an ordinary blank line.
4. **Given** an item using the `;;` separator `Term;; Detail`, **When** Enter is pressed, **Then** the new line is `;; ` (Asciidoctor's four term separators are `::`, `:::`, `::::`, and `;;`).
5. **Given** a bare term line `CPU::` (no inline definition, the definition following on later lines), **When** Enter is pressed, **Then** the line is continued as a normal description item (`:: ` is inserted), not treated as empty.

---

### Edge Cases

- A line that looks like a list marker but sits inside a verbatim/delimited block (listing `----`, literal `....`, or a code/passthrough block) MUST NOT be auto-continued — the `*` or `.` there is literal text.
- Pressing Enter with an active text selection inside a list replaces the selection first, then continues (consistent with normal typing).
- Trailing whitespace after the marker (for example `*   `) is treated as an empty item, so Enter exits the list.
- An item whose only content is the checkbox (`* [ ]`) counts as empty, so Enter exits the list.
- A list item immediately followed by an attached block continuation (`+`) or a nested block — continuation applies to the item's text line, not the attached block.
- Deeply nested items continue at the same depth without an arbitrary cap.
- Undo after a continuation (or an exit) restores the exact pre-Enter state in a single step.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: When the cursor is within a recognized list item and the user presses Enter, the editor MUST start a new list item on the following line using the current item's marker type, marker character, and nesting level — instead of inserting a plain newline.
- **FR-002**: For unordered lists, the continued item MUST reuse the same marker character (`*` or `-`) and the same depth (count of marker characters) as the current item.
- **FR-003**: For ordered lists, an implicitly-numbered item (`.`, `..`, …) MUST continue with the same `.`-depth marker, and an explicitly-numbered item (for example `1.`) MUST continue with the next sequential number.
- **FR-004**: For checklist items — using either the `*` or the `-` marker — the continued item MUST be created with an empty (unchecked) checkbox, reusing the same marker character, regardless of the current item's checked state.
- **FR-005**: For description-list items, the continued line MUST be started at the same indentation with the same term separator at the same level (`::`, `:::`, `::::`, or `;;`) followed by a space, the cursor placed after it — symmetric with how other list markers are continued. A bare term line (term present, separator, no inline definition) MUST be continued as a normal description item, not treated as an empty item.
- **FR-006**: When the user presses Enter on an empty list item (a marker — including a bullet/number, an empty checkbox, or a description separator on a line with no other content, e.g. `:: `) plus optional whitespace, the editor MUST remove that marker and exit the list, leaving an ordinary empty line at the appropriate indentation.
- **FR-007**: When the cursor is in the middle of an item's content, pressing Enter MUST split the content, moving the text after the cursor into the newly continued item.
- **FR-008**: The editor MUST NOT auto-continue a line whose marker is literal text inside a verbatim or delimited block (for example listing or literal blocks).
- **FR-009**: Auto-continuation MUST affect only the source text in the editor; it MUST NOT change rendered output, preview behavior, or content semantics beyond the characters it inserts or removes.
- **FR-010**: Each auto-continuation, and each empty-item exit, MUST be a single undo/redo step.
- **FR-011**: Pressing Enter when the cursor is not within a list MUST behave exactly as it does today (a plain newline) — no regression.
- **FR-012**: When text is selected and Enter is pressed within a list, the editor MUST replace the selection and then apply continuation, consistent with standard editing.
- **FR-013**: Continuation MUST preserve the leading indentation/whitespace of the current item so nested items stay aligned.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For every supported list type (unordered, ordered, checklist, description), a user can add a new item by pressing Enter once, with the correct marker and indentation inserted automatically and zero manually-typed markers.
- **SC-002**: A user can exit any list by pressing Enter once on an empty item — the marker is removed in a single keystroke.
- **SC-003**: Building a five-item bulleted list requires the marker to be typed only once (for the first item), down from five times today.
- **SC-004**: Enter produces an unchanged plain newline on 100% of non-list lines and inside verbatim blocks — no regressions and no false continuations.
- **SC-005**: Continuing a nested item keeps it at the same nesting depth in 100% of cases.
- **SC-006**: A continuation or an exit can be reverted with a single undo in 100% of cases.

## Assumptions

- The behavior applies to the AsciiDoc source editor used for text documents; binary assets and the rendered preview are unaffected.
- "Empty item" means the line contains only the marker plus optional whitespace — for description lists that is a separator-only line (`:: `, `;; `, …) with no term and no definition.
- For description lists, the continued line is started at the same indentation with the separator pre-inserted (`:: `) and the cursor after it. **Resolved during planning, revised in the AsciiDoc-syntax review** (research D4): the term separator is treated as the list marker and continued/exited **symmetrically** with the other list types — Enter on a separator-only line removes it and exits. The accepted trade-off is that a pre-inserted `:: ` line is separator-before-term until the user types a term ahead of it; this was chosen for behavioral consistency across all four list types.
- For explicitly-numbered ordered lists, the continued item uses the next number; automatically renumbering the already-existing items below the insertion point is out of scope for the first version (AsciiDoc also supports implicit `.` numbering that needs none).
- Standard AsciiDoc marker syntaxes are supported: `*` / `-` (unordered), implicit `.` or an explicit number `1.` (ordered), `* [ ]` / `* [x]` / `- [ ]` / `- [x]` (checklist), and `term::` / `:::` / `::::` / `;;` (description). Explicit-number ordered lists are also added to the editor grammar so they are syntax-highlighted, not only continued (research D3).
- Alpha/roman ordered styles (`a.`, `A.`, `i.`, `I.`) and callout lists (`<1>`, `<.>`) are out of scope for this feature.
- The trigger is the Enter key while editing; other ways of introducing newlines (such as pasting multi-line text) are not expected to auto-insert markers.
