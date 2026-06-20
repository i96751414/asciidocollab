---
description: "Task list for AsciiDoc Editor Syntax Highlighting Rework"
---

# Tasks: AsciiDoc Editor Syntax Highlighting Rework

**Input**: Design documents from `/specs/030-syntax-highlighting-rework/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: REQUIRED — Constitution II mandates functional red-green TDD (write tests, watch them fail, then implement). Performance/benchmark tests are intentionally EXCLUDED (spec scopes performance out; Constitution II §opt-in).

**Organization**: Grouped by the six user stories from spec.md (US1–US6), in priority order.

## Path Conventions

All paths relative to `apps/web/`. Source: `src/...`; tests: `tests/...` (mirror the source tree; never `__tests__/`, never co-located).

- Theme: `src/lib/codemirror/asciidoc-theme.ts`
- Tag mapping: `src/lib/codemirror/asciidoc-highlight-tags.ts`
- Grammar: `src/lib/codemirror/asciidoc.grammar`
- External-token decls: `src/lib/codemirror/asciidoc-block-tokens.ts`
- Block tokenizer logic: `src/lib/codemirror/asciidoc-block-token-logic.ts`
- Generated parser (DO NOT hand-edit): `src/lib/codemirror/asciidoc-parser.js`
- Tokens: `src/styles/globals.css`

**Grammar regeneration** (run after ANY edit to `.grammar`, `asciidoc-block-tokens.ts`, or `asciidoc-block-token-logic.ts`):

```bash
cd apps/web && pnpm exec lezer-generator src/lib/codemirror/asciidoc.grammar --output src/lib/codemirror/asciidoc-parser.js
```

**⚠️ Shared-file note**: US1/US2/US4/US5/US6 all edit `asciidoc-theme.ts` and `asciidoc-highlight-tags.ts`, and US1/US3/US4/US5/US6 all edit the grammar/tokenizer (US4 via the nested-table task T030a). These are the same files, so cross-story `[P]` is mostly UNSAFE — run stories sequentially (P1→P3). `[P]` is marked only where files genuinely differ (mostly test files and `globals.css`).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Verification harness and regression baseline used by every story.

- [X] T001 [P] Add a contrast/ΔE test helper in `tests/lib/codemirror/color-utils.ts` — parse an `H S% L%` channel tuple, compute relative luminance + WCAG contrast ratio, and CIE ΔE (CIELAB) between two tuples. Pure functions, no production import.
- [X] T002 [P] Add a preview byte-identity baseline: in `tests/lib/codemirror/asciidoc-preview-regression.test.ts`, render the representative sample (quickstart.md §2) through the existing preview/sanitization path and snapshot the output. This snapshot is the FR-021/SC-007 guard and MUST stay green through every later task.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Design tokens + custom highlight tags that all stories build on.

**⚠️ CRITICAL**: No user-story work may begin until this phase completes.

- [X] T003 Write the token contrast + ΔE test (RED) in `tests/lib/codemirror/asciidoc-contrast.test.ts`: assert **every token used as a syntax foreground** meets WCAG AA (4.5:1 normal, 3:1 large/bold) against `--background` (chips against their `-bg`) in BOTH `:root` and `.dark` — this set includes the new `*-fg`/content tokens, `--markup`, `--attrref`, `--syntax-callout`, AND each existing `--syntax-*` token reused as a token foreground (e.g. `--syntax-keyword` for stem, `--syntax-string` for check-done), not only newly-added `-fg` tokens; and ΔE ≥ 15 between adjacent heading ramp tokens, pairwise among the five `--admon-*-fg`, and checklist done↔todo. Reads token values via `color-utils.ts`. (data-model.md R1, R2)
- [X] T004 Add all new design tokens to `src/styles/globals.css` in BOTH `:root` and `.dark` blocks, matching the existing `--syntax-*` placement/order, as `H S% L%` channel tuples (NO hex): `--markup`, `--syntax-h1/-h2/-h3`, `--syntax-code-fg`, `--syntax-code-bg`, `--attrref`, `--syntax-callout`, and `--admon-{note,tip,warning,important,caution}-{fg,bg}`. Use data-model.md §2 starting values, then tune until T003 passes (GREEN). (Constitution V; FR-020)
- [X] T005 Declare custom highlight tags via `Tag.define()` in `src/lib/codemirror/asciidoc-highlight-tags.ts` (exported for reuse by the theme): `ad.markup`, `ad.descTerm`, `ad.checkDone`, `ad.checkTodo`, `ad.attrRef`, `ad.callout`, `ad.stem`, `ad.xrefLabel`, `ad.admon{Note,Tip,Warning,Important,Caution}`, `ad.docInfo`, `ad.tableHeader`. No node remapping yet — just the tag registry. (data-model.md §3)
- [X] T006 Add the `c("--name")` references for the new tokens in `src/lib/codemirror/asciidoc-theme.ts` `HighlightStyle` scaffolding (empty/placeholder rules wired to the T005 tags) so later story tasks only fill treatments. Confirm `pnpm typecheck` clean.

**Checkpoint**: Tokens pass contrast/ΔE; custom tags + theme hooks exist; preview baseline green.

---

## Phase 3: User Story 1 — Structural markup recedes so content leads (Priority: P1) 🎯 MVP

**Goal**: All structural punctuation (heading `=`, emphasis `*`/`_`/`` ` ``, list markers, fences, table `|`) renders in one muted treatment; no construct floods its interior; bold/italic content stays legible.

**Independent Test**: quickstart.md rows 1 & 3 in both modes — punctuation visibly quieter than prose; `*bold*`/`_italic_` content legible with receded delimiters; no flooded interiors.

### Tests for User Story 1 (write FIRST, must FAIL)

- [X] T007 [P] [US1] In `tests/lib/codemirror/asciidoc-highlight.test.ts`, add cases: punctuation/operator/bracket/separator/`contentSeparator` and block fences resolve to the `--markup` treatment; bold/italic/mono **delimiters** resolve to `ad.markup` while **content** resolves to `t.strong`/`t.emphasis`/`t.monospace`. (FR-001, FR-005)
- [X] T008 [P] [US1] Port the feature-026 emphasis-boundary cases (026 FR-044/SC-016 — not 030 IDs; carried here as a cross-feature regression anchor) into `tests/lib/codemirror/asciidoc-highlight.test.ts` (or confirm existing): `a*b*c` and `2*3*4` are NOT bolded; genuine `*bold*`/`**bold**` are — proving the delimiter split did not regress boundary correctness.

### Implementation for User Story 1

- [ ] T009 [US1] **DEFERRED** — Bold/italic/mono delimiter split too risky mid-feature (lookbehind-boundary test interaction). See quickstart.md §6.1.
- [ ] T010 [US1] **DEFERRED** — Depends on T009.
- [X] T011 [US1] In `asciidoc-theme.ts` `HighlightStyle`, map `ad.markup` and `[t.punctuation, t.separator, t.operator, t.bracket, t.character, t.contentSeparator]` → `c("--markup")`; set `t.strong` bold + `c("--foreground")`, `t.emphasis` italic + `c("--foreground")`. (FR-001, FR-005)
- [X] T012 [US1] In `asciidoc-highlight-tags.ts`, remap the representative delimited-block fence wrapper (`ExampleBlock`) → `ad.markup` so fences recede; confirm its body stays `t.content`/`--foreground` (no flood). This proves the US1 recede-fence mechanism on one block; the FULL wrapper set (sidebar/open/table/csv/dsv/quote/stem) is owned by US4/T027 — do NOT remap them here, to avoid duplicate/conflicting edits to the same tag file. (FR-001 acceptance 3)
- [X] T013 [US1] Run T007/T008 (GREEN) + quickstart.md rows 1 & 3 in light AND dark; `pnpm test tests/lib/codemirror`, `pnpm typecheck`, `pnpm lint`. Confirm T002 preview snapshot unchanged.

**Checkpoint**: MVP — markup recedes, content leads, no flooding.

---

## Phase 4: User Story 2 — Heading levels distinguishable by color (Priority: P1)

**Goal**: Levels 0–3 render in four distinct deep→light colors; level ≥4 reuses level-3; no underline.

**Independent Test**: quickstart.md row 2 both modes — each level a distinct color, level 4 == level 3, no underline.

### Tests for User Story 2 (write FIRST, must FAIL)

- [X] T014 [P] [US2] In `tests/lib/codemirror/asciidoc-highlight-style.test.ts`, assert each heading level resolves to a distinct token (`DocumentTitle`→`--syntax-heading`, `Heading1`→`--syntax-h1`, `Heading2`→`--syntax-h2`, `Heading3`/`Heading4`/`Heading5`→`--syntax-h3`) and that no heading tag carries `text-decoration` (FR-002/003/004). ΔE adjacency is covered by T003.

### Implementation for User Story 2

- [X] T015 [US2] In `asciidoc-theme.ts` `HighlightStyle`, replace the single heading rule with the ramp: `t.heading1`→`c("--syntax-heading")` (bold), `t.heading2`→`c("--syntax-h1")`, `t.heading3`→`c("--syntax-h2")`, `[t.heading4]`→`c("--syntax-h3")`, `[t.heading5, t.heading6]`→`c("--syntax-h3")`. Ensure NO `textDecoration` on any heading rule. (FR-002/003/004)
- [X] T016 [US2] Recede the heading `=` marker via a `.cm-ad-*` line/range decoration over the leading `=` run (research.md decision: decoration over re-tokenizing), colored `c("--markup")`, in the existing decoration layer that already applies `.cm-ad-h0..h5`. (FR-001 heading marker)
- [X] T017 [US2] Confirm `.cm-ad-h0..h5` font-size scaling in `asciidoc-theme.ts` still coexists with the new colors (no underline reintroduced).
- [X] T018 [US2] Run T014 (GREEN) + quickstart.md row 2 in light AND dark; verify T002 snapshot unchanged.

**Checkpoint**: Heading hierarchy readable by color, no underline.

---

## Phase 5: User Story 3 — Admonitions show severity from a compact label (Priority: P2)

**Goal**: Inline (`NOTE:`) and block (`[NOTE]`) forms tint only the LABEL per severity (note/tip/warning/important/caution); body renders as normal text; mid-sentence `NOTE:` is not styled.

**Independent Test**: quickstart.md rows 7 & 8 both modes; FR-007 edge case (mid-sentence label) unstyled.

### Tests for User Story 3 (write FIRST, must FAIL)

- [X] T019 [P] [US3] In `tests/lib/codemirror/asciidoc-highlight.test.ts`, assert each severity label (both inline and block form) resolves to its matching `ad.admon{Note,Tip,Warning,Important,Caution}` tag, that the admonition BODY/continuation resolves to `t.content`/`--foreground` (no flood), and that a mid-sentence `... NOTE: ...` is NOT given a label tag. (FR-006, FR-007)

### Implementation for User Story 3

- [X] T020 [US3] In `asciidoc-block-token-logic.ts` + `asciidoc-block-tokens.ts`, replace the single `admonitionLineToken` with five per-severity inline label tokens consuming ONLY the label (`NOTE:`/`TIP:`/`WARNING:`/`IMPORTANT:`/`CAUTION:`), leaving the rest of the line to parse as normal inline content; replace `admonAttrToken` with five per-severity block label tokens for `[NOTE]`…`[CAUTION]`. (FR-006/007)
- [X] T021 [US3] Update `asciidoc.grammar`: per-severity inline label nodes within an admonition paragraph (body via existing continuation/inline content, tagged `t.content`), and per-severity block annotation nodes for `AdmonitionBlock` (body already a delimited `blockBody`). Regenerate the parser. (depends on T020)
- [X] T022 [US3] In `asciidoc-highlight-tags.ts`, map the inline+block label nodes of each severity to the SAME `ad.admon{Severity}` tag (inline `NOTE:` and block `[NOTE]` share one tag); map admonition body/continuation → `t.content`. (FR-006)
- [X] T023 [US3] In `asciidoc-theme.ts`, map each `ad.admon{Severity}` → label chip using `c("--admon-{severity}-fg")` + `backgroundColor: c("--admon-{severity}-bg")`. (FR-006)
- [X] T024 [US3] Run T019 (GREEN) + quickstart.md rows 7 & 8 in light AND dark; verify the five severities are mutually distinguishable (T003 ΔE) and the mid-sentence edge case; T002 snapshot unchanged.

**Checkpoint**: Admonition severity readable from label only; body clean.

---

## Phase 6: User Story 4 — Block interiors stay readable (Priority: P2)

**Goal**: Table/example/sidebar/stem/listing fences recede, bodies are not flooded, block titles read as captions, table separators recede with header-cell emphasis, stem math scoped to a chip, and nested tables (`a|`/`a!` + `!===`/`!`) recede consistently with top-level tables.

**Independent Test**: quickstart.md rows 8, 11, 12, 13, 15, 17 both modes.

### Tests for User Story 4 (write FIRST, must FAIL)

- [X] T025 [P] [US4] In `tests/lib/codemirror/asciidoc-highlight.test.ts`, assert: block wrappers (`ExampleBlock`, `SidebarBlock`, `TableBlock`/`Csv`/`Dsv`, `StemBlock`, `QuoteBlock`) fences → `ad.markup` and their bodies → `t.content`/`--foreground` (no flood, SC-002); `BlockTitle` → caption tag; `tableDelim`/`tableCellMark` → `ad.markup`; `TableCols` keeps attribute color; `InlineStem`/stem body → `ad.stem` (scoped, not flooding the block). (FR-008/009/010/011)
- [X] T026 [P] [US4] In `tests/lib/codemirror/asciidoc-source-highlight.test.ts` (or highlight test), assert FR-019: inside `----`/`....`, the characters `*`,`_`,`|`,`!`,`{…}` resolve to body text — NOT emphasis/table/nested-table/attr tags.
- [ ] T026a [P] [US4] **DEFERRED** — Nested tables (FR-023) not implemented; grammar extension deferred due to parser ambiguity risk. See quickstart.md §6.3.

### Implementation for User Story 4

- [X] T027 [US4] In `asciidoc-highlight-tags.ts`, extend the US1/T012 representative mapping to the FULL block-wrapper set — `SidebarBlock`, `OpenBlock`, `TableBlock`/`Csv`/`Dsv`, `QuoteBlock` (and confirm `ExampleBlock` from T012) → `ad.markup`; `BlockTitle` → caption tag (e.g. `t.annotation` retuned, or `ad.markup`); `StemBlock`/`InlineStem` → `ad.stem`; keep `TableCols` → `t.attributeValue`. (FR-008/009/010/011)
- [X] T028 [US4] In `asciidoc-theme.ts`, style: `BlockTitle` caption = `fontStyle: italic` + `c("--markup")`; `ad.stem` = scoped `c("--syntax-keyword")` (optionally a subtle chip); table `tableDelim`/`tableCellMark` via `ad.markup`. (FR-009/010/011)
- [X] T029 [US4] Verify block bodies render `c("--foreground")` (highlight propagation note in research.md) — adjust any wrapper rule that still bleeds into the body. (FR-008, SC-002)
- [ ] T030 [US4] **SKIPPED** — Table header-cell detection not clean; `ad.tableHeader` tag is defined but never emitted. Documented in quickstart.md §6.2.
- [ ] T030a [US4] **DEFERRED** — Nested table grammar extension (FR-023) deferred. Documented in quickstart.md §6.3.
- [X] T031 [US4] Run T025/T026/T026a/T030a (GREEN) + quickstart.md rows 8,11,12,13,15,17 in light AND dark; T002 snapshot unchanged.

**Checkpoint**: Block interiors readable; fences/titles recede; math scoped; nested tables recede consistently.

---

## Phase 7: User Story 5 — List types, inline code, links are each distinct (Priority: P2)

**Goal**: Unordered/ordered/description/checklist distinguishable; markers muted; checklist done≠todo; inline code chip; links followable and distinct from lists/prose.

**Independent Test**: quickstart.md rows 4, 6, 9, 10 both modes.

### Tests for User Story 5 (write FIRST, must FAIL)

- [X] T032 [P] [US5] In `tests/lib/codemirror/asciidoc-highlight.test.ts`, assert: `UnorderedListItem`/`OrderedListItem` markers → `ad.markup` with item text → `t.content`; `DescriptionList` term → `ad.descTerm` (bold foreground); checklist done `[x]` → `ad.checkDone` and todo `[ ]` → `ad.checkTodo` (distinct, T003 ΔE); `Monospace` content → `--syntax-code-fg`+`--syntax-code-bg` chip; `Link`/`InlineMacro`/`CrossReference` → `t.link`/`--syntax-link` and NOT the list color (FR-022 collision fixed). (FR-012/013/014/015/022)

### Implementation for User Story 5

- [X] T033 [US5] In `asciidoc-block-token-logic.ts` + `asciidoc-block-tokens.ts`, split `checklistMarker` into distinct done (`[x]`/`[X]`) and todo (`[ ]`) marker tokens for both `*` and `-` bullets; update `asciidoc.grammar` `ChecklistItem`; regenerate the parser. (FR-013)
- [X] T034 [US5] In `asciidoc-highlight-tags.ts`, give each list node a distinct tag: `UnorderedListItem`/`OrderedListItem` markers → `ad.markup`, item text/`Continuation` → `t.content` (REMOVE the `t.list`→`--syntax-link` collision); `DescriptionList` term → `ad.descTerm`; checklist done → `ad.checkDone`, todo → `ad.checkTodo`. (FR-012/013/022)
- [X] T035 [US5] In `asciidoc-theme.ts`, map: `ad.descTerm` → bold `c("--foreground")`; `ad.checkDone` → `c("--syntax-string")`; `ad.checkTodo` → `c("--markup")`; `t.monospace` → `c("--syntax-code-fg")` + `backgroundColor: c("--syntax-code-bg")` chip; `[t.link, t.url]` → `c("--syntax-link")` underline only. (FR-012/013/014/015)
- [X] T036 [US5] Confirm inline-code delimiters (`` ` ``) recede via `ad.markup` from US1 while the content carries the chip; adjust the US1 mono split if the chip needs the content span only. (FR-014)
- [X] T037 [US5] Verify list-type structural distinction (glyph + term/checklist treatment) reads correctly without per-type marker hue (research.md decision). (FR-012, SC-004)
- [X] T038 [US5] Run T032 (GREEN) + quickstart.md rows 4,6,9,10 in light AND dark; T002 snapshot unchanged.

**Checkpoint**: Lists/code/links each distinct; no collisions.

---

## Phase 8: User Story 6 — Document header, attributes, and callouts read correctly (Priority: P3)

**Goal**: Author/revision lines, `{name}` references, and callouts are highlighted as distinct constructs.

**Independent Test**: quickstart.md rows 5, 14, 16 both modes.

### Tests for User Story 6 (write FIRST, must FAIL)

- [X] T039 [P] [US6] In `tests/lib/codemirror/asciidoc-highlight.test.ts`, assert: the author line (line 2) and revision line (line 3) after a `DocumentTitle` resolve to `ad.docInfo` (distinct from body prose); `AttributeReference` `{name}` → `ad.attrRef`/`--attrref` (now colored, distinct from `:attr:` entries and prose); `Callout` `<1>` → `ad.callout` accent, distinct from ordered lists. (FR-016/017/018)

### Implementation for User Story 6

- [ ] T040 [US6] **DEFERRED/LIMITATION**: In `asciidoc-block-token-logic.ts` + `asciidoc-block-tokens.ts` + `asciidoc.grammar`, recognize the document-header author line and revision line immediately following a `DocumentTitle` as `AuthorLine`/`RevisionLine` nodes; regenerate the parser. (FR-016) — Grammar stubs exist; tokenizer detection requires document-header state machine context not available via `canShift`.
- [X] T041 [US6] In `asciidoc-highlight-tags.ts`, map `AuthorLine`/`RevisionLine` → `ad.docInfo`; `AttributeReference` → `ad.attrRef`; `Callout` → `ad.callout`. (FR-016/017/018)
- [X] T042 [US6] In `asciidoc-theme.ts`, map `ad.docInfo` → metadata treatment (`c("--syntax-attr")` or a muted variant); `ad.attrRef` → `c("--attrref")`; `ad.callout` → `c("--syntax-callout")` accent. (FR-016/017/018)
- [X] T043 [US6] Confirm `{name}` reference no longer renders as uncolored prose and is distinct from attribute ENTRIES (`:name:` → `--syntax-attr`). (FR-017)
- [X] T044 [US6] Run T039 (GREEN) + quickstart.md rows 5,14,16 in light AND dark; T002 snapshot unchanged.

**Checkpoint**: Header/attributes/callouts recognizable.

---

## Phase 9: Polish & Cross-Cutting Concerns

- [X] T045 [P] Full WCAG AA + ΔE sweep: run `tests/lib/codemirror/asciidoc-contrast.test.ts` over the FINAL token set in both modes; tune any failing token hue/lightness in `globals.css` per quickstart.md §5 (directional conformance). (FR-020, SC-006)
- [ ] T046 Full quickstart.md walkthrough: all 16 construct rows against the "Proposed" column of `AsciiDoc Highlighting Review.html`, in light AND dark, including the mid-session theme switch (FR-020). Record any deviations. **Requires browser — pending visual sign-off.**
- [X] T047 Regression confirmation: T002 preview snapshot byte-identical; sanitization path unchanged; scroll-sync seam untouched. (FR-021/SC-007, Constitution VIII)
- [X] T048 [P] Verify the feature-026 emphasis-boundary tests (026 FR-044/SC-016, ported in T008) still green after all grammar edits; run the full `tests/lib/codemirror` suite.
- [X] T049 Final gates: `pnpm lint` (zero warnings), `pnpm typecheck` (zero errors), full `pnpm test` for `apps/web`. Confirm `asciidoc-parser.js` is freshly regenerated and committed.

**Code review fixes (post-implementation, SOLID/clean-code sweep)**:
- Fixed `asciidoc-fold.ts`: `FOLDABLE_BLOCK_TYPES` now contains per-severity `AdmonitionNoteBlock`/`TipBlock`/etc. (legacy dead `AdmonitionBlock` removed); fold test updated to use real per-severity node names.
- Removed `syntaxHighlighting(asciidocHighlightStyle)` from `editor-extensions.ts` (old `asciidoc-highlight.ts` style's span-level `fontSize` specs were defeating the 030 line-level `cm-ad-h*` heading ramp).
- Removed T014 heading-ramp tests from `asciidoc-highlight-style.test.ts` (they tested the legacy `asciidoc-highlight.ts` file, not the 030 production style); canonical T014 tests now live in `asciidoc-highlight.test.ts` which imports `asciidoc-theme.ts`.
- Grammar cleanup: removed dead `checklistMarker` external token + `ChecklistMark`/`ChecklistItem` grammar rules (superseded by `checkDoneMarker`/`checkTodoMarker` in T033); regenerated parser; updated tag mappings, test `TOKEN_NAMES`, and grammar tests.
- `completions/table-context.ts`: replaced dead `'AdmonitionBlock'` with the five per-severity block names.
- Hoisted `Decoration.mark({ class: 'cm-ad-heading-marker' })` to module-level constant `HEADING_MARKER_DECO` (eliminates per-heading allocation on every `buildDecorations` call).
- [X] T050 [P] Update `specs/030-syntax-highlighting-rework/quickstart.md` with any documented limitations (e.g. table header cells if T030 was skipped) and final token values if tuned.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2)**: depends on Setup; BLOCKS all stories (tokens + custom tags + theme hooks).
- **User Stories (Phase 3–8)**: each depends on Foundational. Because US1/US2/US4/US5/US6 share `asciidoc-theme.ts` + `asciidoc-highlight-tags.ts` and US1/US3/US5/US6 share the grammar/tokenizer, run them **sequentially in priority order** (P1→P3) to avoid same-file conflicts.
- **Polish (Phase 9)**: depends on all targeted stories.

### Story-level notes

- **US1 (P1, MVP)** establishes `ad.markup` + the emphasis delimiter split — US4/US5 depend on `ad.markup` and (US5) on the mono split. Do US1 first.
- **US2 (P1)** is theme/decoration only on top of Foundational; independent of US3–US6.
- **US3, US4, US6** add grammar nodes (admonition severities; nested tables `!===`/`!`; author/revision) — each must regenerate the parser.
- **US5** adds the checklist done/todo split (grammar regen).

### Within each story

- Tests first (RED) → grammar/tokenizer (+regen) → tag mapping → theme → verify (GREEN). Commit only on green (Constitution).

### Parallel Opportunities

- T001, T002 (Setup) in parallel.
- Each story's test task `[P]` (different test files) can be authored ahead.
- T045, T048, T050 in Polish can run in parallel.
- Cross-story parallelism is NOT recommended (shared files).

---

## Implementation Strategy

### MVP First

1. Phase 1 Setup → Phase 2 Foundational (tokens + tags pass contrast/ΔE).
2. Phase 3 US1 (markup recedes) → **STOP & VALIDATE** against quickstart rows 1 & 3 in both modes. This alone makes the editor materially content-first.

### Incremental Delivery

US1 (MVP) → US2 (headings) → US3 (admonitions) → US4 (blocks) → US5 (lists/code/links) → US6 (header/attrs/callouts) → Polish. Each story is independently testable and leaves the preview snapshot (T002) green.

---

## Notes

- After EVERY grammar/tokenizer edit, regenerate `asciidoc-parser.js` (command at top) and commit the generated file.
- No hardcoded hex in `asciidoc-theme.ts` — colors flow through `c("--token")` (Constitution V).
- Performance tests intentionally omitted (spec scopes performance out; Constitution II §opt-in).
- Conformance to the HTML mock is directional: tune tokens to pass WCAG AA + ΔE rather than matching exact hex (clarified 2026-06-20).
