---
description: "Task list for Cross-Document Attribute Resolution & Editor State Memory"
---

# Tasks: Cross-Document Attribute Resolution & Editor State Memory

**Input**: Design documents from `/specs/027-cross-document-attributes/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ (resolution-model.md, render-worker.md, cursor-memory.md)

**Tests**: INCLUDED. The plan mandates TDD (Constitution II, non-negotiable) and research R10: a Jest unit/component test for **every** feature, and a Playwright e2e test for **every cross-file** behavior. Write tests first; ensure they fail (red) before implementing (green).

**Library policy (user directive)**: When adding new libraries, pick the most recent compatible release (e.g. the latest MathJax 3.x). **Implementation must run to completion without stopping to report intermediate progress.**

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: User story label (US1–US15; US14 = inline styles FR-021a–c; US15 = STEM FR-021d–f)
- Exact file paths included in every task

## Path Conventions

- Web source: `apps/web/src/...`; web unit/component tests: `apps/web/tests/...` mirroring src with `src/` dropped (e.g. `src/lib/asciidoc/extraction.ts` → `tests/lib/asciidoc/extraction.test.ts`).
- Domain source: `packages/domain/src/...`; domain tests: `packages/domain/tests/...`.
- Shared DTOs: `packages/shared/src/...`; tests: `packages/shared/tests/...`.
- E2E: `apps/web/e2e/*.spec.ts` (stack via `docker-compose.e2e.yml`).
- **Never** use `__tests__/` or co-locate tests with source.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Add the one new dependency and shared DTO scaffolding the feature needs.

- [X] T001 Add the latest compatible MathJax 3.x as an `apps/web` dependency (self-hosted, no CDN) and record the resolved version in `apps/web/package.json`; verify it can be imported without network access.
- [X] T002 [P] Add a scoped math-CSS build step mirroring the existing `pnpm build:asciidoctor-style` pattern in `apps/web/package.json` scripts, outputting a preview-scoped MathJax stylesheet under `apps/web/src/styles/vendor/` (Constitution VI — must not restyle app chrome).
- [X] T003 [P] Add shared DTO/type shapes for resolved attributes, include edges (with `tags`/`lines`/`gatedBy`), and conditional expressions in `packages/shared/src/asciidoc-model/` and export them from `packages/shared/src/index.ts` (per data-model.md entities).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Extend the cross-document resolution model and the include assembler primitives that ALL rendering/highlighting stories build on (contracts/resolution-model.md). Kept in sync across the web copy and the domain mirror (R9).

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### Tests for Foundational (write first, must fail)

- [X] T004 [P] Unit tests for the extended resolution model (`resolveAttributeScope`, `DocumentOrderEvent` with inline-set/unset/wrapping, first-include inheritance, locked precedence, standalone `rootFileId=null`, cycle/depth termination) using in-memory `readContent`/`resolveInclude` fakes in `apps/web/tests/lib/asciidoc/extraction.test.ts`.
- [X] T005 [P] Unit tests for `parseIncludeTags`, `parseIncludeLines`, `parseConditional`, and `evaluateConditional` (presence tests + restricted ifeval comparison grammar, NO eval) in `apps/web/tests/lib/asciidoc/extraction-conditionals.test.ts`.
- [X] T006 [P] Parity test asserting the web and domain resolution copies produce identical results on a shared fixture corpus in `apps/web/tests/lib/asciidoc/extraction-parity.test.ts` (FR-006, R9).

### Implementation for Foundational

- [X] T007 Extend `documentOrderEvents` and the value accumulator in `apps/web/src/lib/asciidoc/extraction.ts` to handle `:!name:` unset propagation, inline `{set:name:value}` / `{set:name!}` events, wrapping (trailing `\`) multi-line attribute values, and locked/fixed precedence (FR-003, FR-004, FR-005, FR-040, FR-041, FR-043).
- [X] T008 Add `resolveAttributeScope({rootFileId, fileId, readContent, resolveInclude})` returning `ResolvedAttributeScope` (origin root/inherited/standalone) in `apps/web/src/lib/asciidoc/extraction.ts`, honoring first-include-point inheritance (FR-002a/b) and reusing the existing cycle guard (FR-007).
- [X] T009 Add `parseIncludeTags`, `parseIncludeLines`, `parseConditional`, and a non-`eval` `evaluateConditional` to `apps/web/src/lib/asciidoc/extraction.ts` (FR-029, FR-030, FR-033, FR-034; Constitution IX).
- [X] T010 Mirror all of T007–T009 into `packages/domain/src/services/asciidoc-extraction.ts`, keeping the documented authoritative copy in sync (R9), and re-export any new public types from `packages/domain/src/services/index.ts`.

**Checkpoint**: Resolution model + assembler primitives ready and unit-green; user stories can begin.

---

## Phase 3: User Story 1 - Attributes resolve across the include tree (Priority: P1) 🎯 MVP

**Goal**: Every `{name}` reference in the previewed open file resolves to the value in effect at that position in the assembled include tree, anchored to the project main file (root) at the file's first-include point.

**Independent Test**: Parent sets `:productName: Acme` then `include::child.adoc[]`; previewing `child.adoc` (which references `{productName}`) renders "Acme"; editing the parent's value updates the preview live.

### Tests for User Story 1 (write first, must fail)

- [X] T011 [P] [US1] Unit test for the render worker seeding the resolved inherited scope (RenderRequest `rootFileId`/`openFileId` → seeded Asciidoctor `attributes`) and rendering `{name}` from a parent, including unset/`{set:}` cases, in `apps/web/tests/workers/asciidoc-render.worker.test.ts`.
- [X] T012 [P] [US1] Component test that `use-asciidoc-preview` passes the open file's inherited context to the worker and re-resolves live on attribute edit in `apps/web/tests/hooks/use-asciidoc-preview.test.ts`.
- [X] T013 [P] [US1] Playwright e2e: set a project main file, define `:productName:` before an include, open the child, assert preview shows the resolved value and updates live when the parent value is edited, in `apps/web/e2e/preview-cross-document-attributes.spec.ts`.

### Implementation for User Story 1

- [X] T014 [US1] Extend `RenderRequest` and the worker in `apps/web/src/workers/asciidoc-render.worker.ts` to accept `rootFileId`/`openFileId`, call `resolveAttributeScope`, and seed Asciidoctor `attributes` with the full resolved inherited scope (non-locked so in-document defs may override) plus resolved `:leveloffset:`, keeping the DOMPurify boundary unchanged (render-worker.md; FR-001, FR-002a/b/c, FR-006).
- [X] T015 [US1] Make `apps/web/src/workers/assemble-includes.ts` attribute-aware: track attribute state in document order (mirroring the resolution model) so include targets and `{attr}` path substitution see correct values, preserving source-line/`data-source-line` mapping (FR-001, Constitution VIII).
- [X] T016 [US1] Wire `apps/web/src/hooks/use-asciidoc-preview.ts` to pass `rootFileId` (project main file) and `openFileId` to the worker and trigger live re-resolution on attribute/include edits (FR-007a).
- [X] T017 [US1] Handle unresolved references and missing includes gracefully in the worker/assembler path so the rest of the document still renders (FR-007, edge cases; SC-008).

**Checkpoint**: Cross-document attribute values render correctly and live — MVP deliverable.

---

## Phase 4: User Story 2 - Heading levels honor `leveloffset` across files (Priority: P1)

**Goal**: `:leveloffset:` (document attribute) and `leveloffset=` (include option) shift included headings correctly in both the preview and the editor's structural understanding, scoped correctly.

**Independent Test**: Parent `include::child.adoc[leveloffset=+1]` with a level-1 child title → child renders as level-2; parent headings unaffected.

### Tests for User Story 2 (write first, must fail)

- [X] T018 [P] [US2] Unit test for `:leveloffset:` attribute-form resolution and include-scoped restoration in `apps/web/tests/lib/asciidoc/extraction.test.ts` (extend), and for worker output heading levels in `apps/web/tests/workers/asciidoc-render.worker.test.ts` (extend).
- [X] T019 [P] [US2] Unit test for `computeHeadingLevels` reflecting attribute-form + inherited `leveloffset` in `apps/web/tests/lib/codemirror/asciidoc-heading-levels.test.ts`.
- [X] T020 [P] [US2] Playwright e2e: open a non-root child included with `leveloffset=+1` and assert preview heading depth and editor outline levels in `apps/web/e2e/preview-leveloffset-cross-file.spec.ts`.

### Implementation for User Story 2

- [X] T021 [US2] Extend the resolution model in `apps/web/src/lib/asciidoc/extraction.ts` (and mirror in `packages/domain/src/services/asciidoc-extraction.ts`) so the `:leveloffset:` attribute form participates in document-order resolution and include-scoped restoration (FR-009, FR-010).
- [X] T022 [US2] Apply the resolved effective offset in `apps/web/src/workers/assemble-includes.ts` for both the directive option and the attribute form, restoring the prior offset after each include ends (FR-008, FR-010).
- [X] T023 [US2] Update `apps/web/src/lib/codemirror/asciidoc-heading-levels.ts` so `computeHeadingLevels` (the single authority) reflects attribute-form and inherited `leveloffset`, refreshed via `inheritedHeadingOffsetFacet`/`refreshHeadingLevelsEffect` (FR-008, R11).

**Checkpoint**: Level offsets correct in preview and editor structure.

---

## Phase 5: User Story 3 - Automatic IDs honor `idprefix` / `idseparator` (Priority: P2)

**Goal**: Auto-generated heading IDs use the resolved `idprefix`/`idseparator` in effect at each heading; explicit IDs preserved.

**Independent Test**: `:idprefix: sect_` + `:idseparator: -` in the main file, child heading "My Section" → ID `sect_my-section`.

### Tests for User Story 3 (write first, must fail)

- [X] T024 [P] [US3] Unit test asserting seeded `idprefix`/`idseparator` produce the expected native IDs, explicit IDs preserved, and mid-document changes affect only later headings, in `apps/web/tests/workers/asciidoc-render.worker.test.ts` (extend).
- [X] T025 [P] [US3] Playwright e2e: define `:idprefix:`/`:idseparator:` in the main file, open a child, assert generated heading IDs in the preview DOM, in `apps/web/e2e/preview-autoid-cross-file.spec.ts`.

### Implementation for User Story 3

- [X] T026 [US3] Confirm/extend worker seeding in `apps/web/src/workers/asciidoc-render.worker.ts` so `idprefix`/`idseparator` flow through as document attributes (native Asciidoctor ID generation); add a targeted fix only if precedence prevents in-document override (FR-011, FR-012, FR-013).

**Checkpoint**: Auto IDs honor configured prefix/separator across files.

---

## Phase 6: User Story 4 - Cross-references honor `xrefstyle` (Priority: P2)

**Goal**: `<<id>>` link text follows the resolved `xrefstyle` at each reference's position, including redefinitions inside includes.

**Independent Test**: `:xrefstyle: full` in a parent → `<<section-id>>` renders the full-style label.

### Tests for User Story 4 (write first, must fail)

- [X] T027 [P] [US4] Unit test asserting seeded `xrefstyle` (and per-position redefinition) yields the corresponding native xref text, default when unset, in `apps/web/tests/workers/asciidoc-render.worker.test.ts` (extend).
- [X] T028 [P] [US4] Playwright e2e: set `:xrefstyle:` in the main file and assert cross-reference text in a child preview in `apps/web/e2e/preview-xrefstyle-cross-file.spec.ts`.

### Implementation for User Story 4

- [X] T029 [US4] Verify `xrefstyle` is seeded/resolved in `apps/web/src/workers/asciidoc-render.worker.ts`; for redefinitions inside assembled content ensure the value is present in source order (assembler) so native xref text matches per position (FR-014, FR-015, FR-016).

**Checkpoint**: xref text matches the configured style across files.

---

## Phase 7: User Story 5 - Caption / label / signifier attributes (Priority: P2)

**Goal**: `table-caption`, `figure-caption`, and the full built-in label/caption/signifier family resolve across the include tree and render in the preview.

**Independent Test**: `:table-caption: Tabela` in a parent → child titled table labeled "Tabela N.".

### Tests for User Story 5 (write first, must fail)

- [X] T030 [P] [US5] Unit test asserting the caption/label/signifier family (`table-caption`, `figure-caption`, `example-caption`, admonition `*-caption`, `appendix-caption`, `toc-title`, `chapter-signifier`, `part-signifier`, `section-refsig`, `version-label`, `last-update-label`) seeds correctly and empty values suppress labels, in `apps/web/tests/workers/asciidoc-render.worker.test.ts` (extend).
- [X] T031 [P] [US5] Playwright e2e: set `:table-caption:` and `:toc-title:` in the main file and assert localized labels in a child preview in `apps/web/e2e/preview-captions-cross-file.spec.ts`.

### Implementation for User Story 5

- [X] T032 [US5] Ensure the full caption/label/signifier family is included in the seeded inherited scope in `apps/web/src/workers/asciidoc-render.worker.ts` (no allow-list filtering that drops them); handle empty/unset per AsciiDoc semantics (FR-017, FR-018, FR-019, FR-019a).

**Checkpoint**: Caption/label family honors configured values across files.

---

## Phase 8: User Story 6 - Editor highlights attributes from included/parent files (Priority: P2)

**Goal**: The editor highlights `{name}` references and definitions that resolve anywhere in the include tree, live.

**Independent Test**: Open a file referencing an attribute defined only in an included sub-document → the reference highlights as a known attribute.

### Tests for User Story 6 (write first, must fail)

- [X] T033 [P] [US6] Unit test for the cross-doc attribute facet/decoration deciding known-vs-unknown from a resolved scope, AND that attribute definition entries (`:name:`) are highlighted as entries in any file of the include tree (FR-021), in `apps/web/tests/lib/codemirror/cross-document-attributes.test.ts`.
- [X] T034 [P] [US6] Unit test that `use-project-symbol-index` exposes the resolved per-file attribute scope in `apps/web/tests/hooks/use-project-symbol-index.test.tsx`.
- [X] T035 [P] [US6] Playwright e2e: attribute defined in an included file is highlighted as known in the parent (and vice versa), in `apps/web/e2e/editor-cross-document-attributes.spec.ts`.

### Implementation for User Story 6

- [X] T036 [US6] Create `apps/web/src/lib/codemirror/cross-document-attributes.ts`: a CodeMirror facet/decoration that highlights `{name}` references resolving to a definition in the file's inherited cross-document scope (FR-020, FR-021). (Filename uses `cross-document-` to satisfy the `unicorn/prevent-abbreviations` lint rule.)
- [X] T037 [US6] Extend `apps/web/src/hooks/use-project-symbol-index.ts` to expose the resolved cross-document attribute scope per file (`resolvedScopeOf`) and drive live updates (FR-007a).
- [X] T038 [US6] Register the new decoration in the editor extensions wiring (`apps/web/src/lib/codemirror/editor-extensions.ts`); `:name:` entries (`AttributeEntry`) and `{name}` refs (`AttributeReference`) are already tokenized + tag-mapped in `asciidoc-highlight-tags.ts`, so no new token was needed (FR-021 verified).

**Checkpoint**: Cross-document attributes highlighted live in the editor.

---

## Phase 9: User Story 8 - Conditional preprocessor directives (Priority: P2)

**Goal**: `ifdef`/`ifndef`/`ifeval` evaluate against the resolved cross-document attribute state; include-gating conditionals include/skip targets; content-level conditionals left to Asciidoctor; live re-evaluation.

**Independent Test**: `ifdef::draft[]…endif::[]` gated by a main-file `:draft:` toggles live; `ifdef::edition-pro[include::pro-only.adoc[]]` includes only when set.

### Tests for User Story 8 (write first, must fail)

- [X] T039 [P] [US8] Unit test for include-gating evaluation in the assembler (skip/assemble a wrapped `include::` per resolved state; nested/unbalanced handled gracefully) in `apps/web/tests/workers/assemble-includes.test.ts`.
- [X] T040 [P] [US8] Playwright e2e: conditional gated on a main-file attribute shows/hides content live, and a conditional wrapping an include includes/skips the target, in `apps/web/e2e/preview-conditionals-cross-file.spec.ts`.

### Implementation for User Story 8

- [X] T041 [US8] Implement include-gating in `apps/web/src/workers/assemble-includes.ts` using `parseConditional`/`evaluateConditional` against the document-order attribute state; leave content-level conditionals in source for Asciidoctor; handle undefined attrs, nesting, and unbalanced `endif` without aborting the render (FR-029, FR-030, FR-031).
- [X] T042 [US8] Ensure conditional re-evaluation is live by re-running assembly on attribute/include edits via `apps/web/src/hooks/use-asciidoc-preview.ts` (FR-007a, FR-031).

**Checkpoint**: Conditionals (incl. include-gating) evaluated against cross-document state, live.

---

## Phase 10: User Story 11 - Inline attribute assignment & wrapping values (Priority: P2)

**Goal**: `{set:name:value}` / `{set:name!}` and `\`-continued multi-line attribute entries resolve in the preview and are highlighted in the editor, participating in cross-document resolution.

**Independent Test**: `{set:basedir:src/main/java}` then `{basedir}` renders the value; a `\`-continued `:longval:` joins lines; editor highlights both.

### Tests for User Story 11 (write first, must fail)

- [X] T043 [P] [US11] Unit test that inline `{set:}`/unset and wrapped values resolve correctly in preview output in `apps/web/tests/workers/asciidoc-render.worker.test.ts` (extend) — model logic already covered by T004.
- [X] T044 [P] [US11] Editor highlighting unit test for `{set:…}` tokens and multi-line wrapped attribute entries (all continued lines highlighted as one entry) in `apps/web/tests/lib/codemirror/asciidoc-highlight.test.ts`.

### Implementation for User Story 11

- [X] T045 [US11] Apply inline `{set:}`/unset and wrapped values during assembly/seeding in `apps/web/src/workers/assemble-includes.ts` so subsequent references (including across includes) resolve correctly (FR-040, FR-041; reuses Phase 2 model).
- [X] T046 [US11] Extend the grammar/tokenizer for `{set:…}` and wrapped attribute-value continuation in `apps/web/src/lib/codemirror/asciidoc.grammar` and `apps/web/src/lib/codemirror/asciidoc-block-token-logic.ts`, with tag mappings in `apps/web/src/lib/codemirror/asciidoc-highlight-tags.ts` (FR-042).

**Checkpoint**: Inline set and wrapped values resolve and highlight.

---

## Phase 11: User Story 14 - Inline styles render and highlight (FR-021a–c) (Priority: P2)

**Goal**: Built-in inline formatting and role-based spans (`[.role]#text#`) render in the preview and highlight in the editor; an extensible registry gives known roles distinct emphasis while any role highlights generically.

**Independent Test**: `[.lead]#text#` renders styled in the preview; an unregistered custom role still highlights; registering a custom role adds distinct emphasis with no logic change.

### Tests for User Story 14 (write first, must fail)

- [X] T047 [P] [US14] Unit test for the inline-style registry (`isKnown`, built-in set, custom registration without code change) in `apps/web/tests/lib/codemirror/inline-style-registry.test.ts`.
- [X] T048 [P] [US14] Editor highlighting unit test: built-in inline marks and role spans tokenized; known roles get distinct emphasis, unknown roles highlight generically, in `apps/web/tests/lib/codemirror/asciidoc-highlight.test.ts` (extend).

### Implementation for User Story 14

- [X] T049 [P] [US14] Create the extensible `apps/web/src/lib/codemirror/inline-style-registry.ts` (built-in known set + configurable custom entries; `isKnown(role)`) (FR-021c).
- [X] T050 [US14] Add a role-span inline token and built-in inline-formatting recognition to `apps/web/src/lib/codemirror/asciidoc.grammar` and map tags in `apps/web/src/lib/codemirror/asciidoc-highlight-tags.ts`, consuming the registry for distinct emphasis (FR-021b, FR-021c).
- [X] T051 [US14] Verify the preview renders built-in inline styles and role spans (native Asciidoctor) and that role CSS is scoped to the preview container in `apps/web/src/components/asciidoc-preview.tsx` (FR-021a; Constitution VI).

**Checkpoint**: Inline styles render and highlight; registry extensible.

---

## Phase 12: User Story 15 - STEM (math) rendering (FR-021d–f) (Priority: P2)

**Goal**: Client-side, self-hosted MathJax renders both AsciiMath and LaTeX, inline and block, gated by the resolved `:stem:` attribute; per-expression macros override notation; output stays within the sanitized, scoped preview container.

**Independent Test**: `:stem:` + `stem:[x^2]` and a `[stem]` block render as math; `latexmath:[…]` uses LaTeX regardless of the active notation; with `:stem:` absent, expressions are not math-rendered.

### Tests for User Story 15 (write first, must fail)

- [X] T052 [P] [US15] Unit test for `render-math.ts`: stem delimiters → rendered math nodes for both notations, malformed expressions surfaced gracefully, sanitization preserved, in `apps/web/tests/components/math/render-math.test.ts`.
- [X] T053 [P] [US15] Component test that the preview lazy-loads MathJax only when math is present and renders post-sanitize, scoped, in `apps/web/tests/components/asciidoc-preview.test.tsx` (extend).

### Implementation for User Story 15

- [X] T054 [P] [US15] Create `apps/web/src/components/math/render-math.ts`: a self-hosted MathJax integration configured for both TeX and AsciiMath input, rendering from already-sanitized DOM text within the scoped container (FR-021d, FR-021f; R5).
- [X] T055 [US15] Invoke client math rendering post-sanitize in `apps/web/src/components/asciidoc-preview.tsx`, lazy-loading MathJax when the worker flags math present; honor the resolved `:stem:` value (notation default AsciiMath; `asciimath:[]`/`latexmath:[]` override) (FR-021d, FR-021e).
- [X] T056 [US15] Emit a math-present marker and preserve Asciidoctor stem delimiters through DOMPurify in `apps/web/src/workers/asciidoc-render.worker.ts` (render-worker.md; do not render math in the worker).

**Checkpoint**: STEM renders client-side for both notations, gated by `:stem:`.

---

## Phase 13: User Story 7 - Per-file, per-user cursor memory (Priority: P3)

**Goal**: Remember each user's last cursor line per file (not just the last-opened file); restore on open, clamped to a valid line; isolated per user/file; persists across sessions on the same browser.

**Independent Test**: Scroll file A to line 120 and file B to line 8, switch away, reopen each → cursor restored per file.

### Tests for User Story 7 (write first, must fail)

- [X] T057 [P] [US7] Unit test for `rememberCursorLine`/`readCursorLine`/`pruneCursor`: per-file map, per-user/per-project key isolation, clamp-to-valid, missing ⇒ top, invalid entries dropped, in `apps/web/tests/hooks/use-last-selection.test.ts` (extend).
- [X] T058 [P] [US7] Playwright e2e: navigate among at least three files, reopen each, assert the cursor restores to the per-file remembered line in `apps/web/e2e/editor-per-file-cursor-memory.spec.ts`.

### Implementation for User Story 7

- [X] T059 [US7] Extend `apps/web/src/hooks/use-last-selection.ts` into a per-file cursor map keyed `asciidocollab:file-cursors:{userId}:{projectId}` with `rememberCursorLine`/`readCursorLine`/`pruneCursor`, validated reads (never throw), preserving the existing last-opened-file behavior (cursor-memory.md; FR-022, FR-024, FR-027).
- [X] T060 [US7] Wire save-on-settle (debounced) and restore-on-open (clamp to nearest valid line, default top) into the editor/file-open path via `apps/web/src/hooks/use-file-selection.ts` and the editor selection-change wiring (FR-023, FR-025, FR-026); prune entries for deleted files (edge case).

**Checkpoint**: Per-file cursor memory works across files and sessions.

---

## Phase 14: User Story 9 - Partial includes by `tags=` / `lines=` (Priority: P3)

**Goal**: Tag- and line-range partial includes select only the matching content, then apply attribute resolution and `leveloffset`; invalid selections surface gracefully.

**Independent Test**: `include::f.adoc[tags=intro]` and `[lines=2..4]` each render only their slice.

### Tests for User Story 9 (write first, must fail)

- [X] T061 [P] [US9] Unit test for tag filtering (multiple, `!neg`, `*`/`**`) and line ranges (single/multiple/open-ended), source-line mapping preserved, invalid selection graceful, in `apps/web/tests/workers/assemble-includes.test.ts` (extend).
- [X] T062 [P] [US9] Playwright e2e: a `tags=` and a `lines=` partial include render only the selected content (with `leveloffset` applied) in `apps/web/e2e/preview-partial-includes.spec.ts`.

### Implementation for User Story 9

- [X] T063 [US9] Slice child content by `tags=`/`lines=` in `apps/web/src/workers/assemble-includes.ts` (using `parseIncludeTags`/`parseIncludeLines`) before insertion, applying `leveloffset` and attribute resolution to the slice and preserving `data-source-line` mapping (FR-033, FR-034, FR-035, Constitution VIII).
- [X] T064 [US9] Surface non-matching/invalid tag or line selections gracefully without breaking surrounding render (FR-036; SC-008).

**Checkpoint**: Partial includes select correctly with offset/attribute resolution.

---

## Phase 15: User Story 10 - Section numbering & TOC across includes (Priority: P3)

**Goal**: `sectnums`/`sectnumlevels` and `toc`/`toclevels` resolved across the tree number sections and build a TOC reflecting the assembled, offset-adjusted structure.

**Independent Test**: `:sectnums:` + two `leveloffset=+1` chapters → continuous numbering; TOC at offset levels.

### Tests for User Story 10 (write first, must fail)

- [X] T065 [P] [US10] Unit test asserting seeded `sectnums`/`sectnumlevels`/`toc`/`toclevels` produce native numbering/TOC consistent with offset-adjusted levels in `apps/web/tests/workers/asciidoc-render.worker.test.ts` (extend).
- [X] T066 [P] [US10] Playwright e2e: enable `:sectnums:`/`:toc:` in the main file with offset chapters and assert numbering and TOC structure in `apps/web/e2e/preview-sectnums-toc-cross-file.spec.ts`.

### Implementation for User Story 10

- [X] T067 [US10] Confirm `sectnums`/`sectnumlevels`/`toc`/`toclevels` are seeded and that assembled offset-adjusted headings feed native numbering/TOC in `apps/web/src/workers/asciidoc-render.worker.ts`; add targeted fixes only where offset interaction is wrong (FR-037, FR-038, FR-039).

**Checkpoint**: Numbering and TOC consistent across includes and offsets.

---

## Phase 16: User Story 12 - Higher-fidelity editor highlighting (Priority: P3)

**Goal**: Constrained/unconstrained inline boundary correctness, distinct xref target vs label, table `cols` specifiers, and live dimming of inactive conditional branches.

**Independent Test**: `a*b*c` not bolded; `<<id,label>>` distinguishes target/label; `[cols="1,>2"]` highlighted; inactive `ifdef` branch dimmed live.

### Tests for User Story 12 (write first, must fail)

- [X] T068 [P] [US12] Unit tests for constrained/unconstrained boundary rules (no false marks in `a*b*c`, `Vec<3>`; genuine forms still highlighted) in `apps/web/tests/lib/codemirror/asciidoc-highlight.test.ts` (extend).
- [X] T069 [P] [US12] Unit tests for xref target/label distinction and table `cols` tokenization in `apps/web/tests/lib/codemirror/asciidoc-highlight.test.ts` (extend).
- [X] T070 [P] [US12] Unit test for the conditional-dimming decision (which ranges dim for a given resolved scope) in `apps/web/tests/lib/codemirror/conditional-dimming.test.ts`.

### Implementation for User Story 12

- [X] T071 [US12] Implement boundary-aware (lookbehind) inline tokenization for constrained/unconstrained marks in `apps/web/src/lib/codemirror/asciidoc.grammar` + `apps/web/src/lib/codemirror/asciidoc-block-token-logic.ts`, erring toward no false highlights on ambiguity (FR-044; SC-016).
- [X] T072 [P] [US12] Add distinct xref target/label sub-tokens and table `cols` tokenization to `apps/web/src/lib/codemirror/asciidoc.grammar` with tag mappings in `apps/web/src/lib/codemirror/asciidoc-highlight-tags.ts` (FR-045, FR-046).
- [X] T073 [US12] Create `apps/web/src/lib/codemirror/conditional-dimming.ts`: a live decoration that dims inactive conditional branches using the resolved scope, recomputing on attribute change; derive opacity/contrast from design tokens (FR-032; Constitution V).

**Checkpoint**: Editor highlighting fidelity raised; inactive branches dimmed live.

---

## Phase 17: User Story 13 - Remaining rendering completeness (Priority: P3)

**Goal**: Bibliography entries/citations, index terms (and index listing), counter attributes, and page breaks render correctly with no raw markup.

**Independent Test**: `[bibliography]` + `[[[ref]]]` + `<<ref>>` link; `indexterm:[Term]`/`((Term))` produce entries; `{counter:fig}` increments; `<<<` renders a page break.

### Tests for User Story 13 (write first, must fail)

- [X] T074 [P] [US13] Unit test asserting native rendering of bibliography/citations, index terms + index listing, counters, and page breaks (no raw markup) in `apps/web/tests/workers/asciidoc-render.worker.test.ts` (extend), plus a real-DOMPurify (jsdom) sanitizer-survival test for each construct in `apps/web/tests/components/asciidoc-preview.test.tsx` (the worker test runs in the node env where DOMPurify cannot execute).

### Implementation for User Story 13

- [X] T075 [US13] Verified: bibliography (`[bibliography]`/`[[[ref]]]`/`<<ref>>`), index terms (`indexterm:[]`/`indexterm2:[]`/`((…))`/`(((…)))` + `index::[]` listing), counters (`{counter:}`/`{counter2:}`), and page breaks (`<<<`) are all NATIVE Asciidoctor output — no extra worker config enables them, and the worker's post-processing passes them through untouched. The DOMPurify config (`{ USE_PROFILES: { html: true } }`) already preserves every needed element/attribute (anchor `id`s, the page-break div's inline `page-break-after` style), so NO sanitizer-allowlist change was needed (FR-047, FR-048, FR-049, FR-050).
- [X] T076 [US13] Added a scoped visible page-break boundary rule to `apps/web/src/styles/asciidoc-preview.css` (imported by `asciidoc-preview.tsx`): `<<<` emits `<div style="page-break-after: always">`, which is invisible on screen (print-only property), so a `.asciidoc-preview-content [style*="page-break-after"]` dashed-border separator renders the boundary, scoped to the preview container (Constitution VI). No other construct needed new CSS.

**Checkpoint**: Remaining AsciiDoc constructs render with full fidelity.

---

## Phase 18: Editor outline consistency (R11, cross-cutting) (Priority: P3)

**Goal**: The editor section outline reflects effective (offset-adjusted) levels, resolves `{attr}` in titles, excludes/marks inactive-branch headings, and refreshes live on include-structure and main-file changes.

**Independent Test**: Open a non-root file included with `leveloffset=+1` → outline shows offset levels; `== {productName} Guide` shows the resolved title; a heading in an inactive `ifdef` branch is excluded/marked; changing the main file refreshes the outline live.

### Tests for outline consistency (write first, must fail)

- [X] T077 [P] Unit test for outline extraction: resolved `{attr}` titles, offset-adjusted levels, inactive-branch exclusion/marking in `apps/web/tests/lib/codemirror/asciidoc-outline.test.ts`.
- [X] T078 [P] Playwright e2e: outline panel reflects inherited `leveloffset` and resolved titles after opening a non-root file and after changing the main-file setting in `apps/web/e2e/editor-outline-cross-document.spec.ts`.

### Implementation for outline consistency

- [X] T079 Extend `apps/web/src/lib/codemirror/asciidoc-outline.ts` to resolve `{attr}` in titles against the file's resolved scope and to exclude/mark headings inside inactive conditional regions (R11; FR-032 consistency).
- [X] T080 Drive live outline refresh on include-structure and main-file changes via `apps/web/src/hooks/use-section-outline.ts` + `refreshHeadingLevelsEffect`, keeping `computeHeadingLevels` the single authority (FR-007a, FR-007b, R11).

**Checkpoint**: Outline agrees with the rendered preview under cross-document resolution.

---

## Phase 19: Polish & Cross-Cutting Concerns

**Purpose**: Live re-resolution wiring, security/sanitization regression, and validation across all stories.

- [X] T081 Implement live re-resolution on main-file change: re-resolve inherited context and refresh preview + editor highlighting for all open files via `apps/web/src/hooks/use-asciidoc-preview.ts` and `apps/web/src/hooks/use-project-symbol-index.ts` (FR-007b). The symbol-index side already rebuilt on `rootFileId` change; fixed the preview to re-render on `rootFileId` change (added to the `[mainPath]` effect deps) so an open child re-resolves under the new root. Unit test added in `use-asciidoc-preview.test.tsx`.
- [X] T082 [P] Playwright e2e for the main-file-change live refresh across open files in `apps/web/e2e/preview-main-file-change.spec.ts` (FR-007b; SC-009). Authored; Playwright run deferred to CI (docker stack).
- [X] T083 [P] Sanitizer + scroll-sync regression tests: assembled/filtered/conditional content keeps identical DOMPurify output and preserved `data-source-line` mapping, in `apps/web/tests/workers/asciidoc-render.worker.test.ts` (extend) (Constitution VIII/IX).
- [X] T084 [P] Editor security-boundary regression for math/conditional/partial-include paths in `apps/web/e2e/editor-security-boundary.spec.ts` (extend) (Constitution IX). Authored; Playwright run deferred to CI.
- [X] T085 Run `pnpm check` (tsc + eslint + jest) and the math-CSS scoping build. tsc/eslint/jest green; `build:mathjax-style` runs without error. Playwright `apps/web/e2e` run requires the docker stack — DEFERRED TO CI.
- [ ] T086 Walk through `specs/027-cross-document-attributes/quickstart.md` manual verification items 1–14 and confirm each acceptance scenario. MANUAL — requires a running app; left for the human.
- [X] T087 [P] Attribute-relationships integration e2e (FR-028): a single fixture where `idprefix`/`idseparator`-generated IDs are targeted by an `xrefstyle`-styled `<<id>>`, a caption uses a parent-defined `:table-caption:`, and a conditional is gated on an attribute set in an included file — assert all resolve mutually consistently in one preview, in `apps/web/e2e/preview-attribute-relationships.spec.ts`. Authored; Playwright run deferred to CI.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on Setup — **BLOCKS all user stories** (resolution model + assembler primitives).
- **User Stories (Phases 3–18)**: All depend on Foundational. P1 first (US1 → US2), then P2 (US3, US4, US5, US6, US8, US11, US14, US15), then P3 (US7, US9, US10, US12, US13, outline).
- **Polish (Phase 19)**: Depends on the stories it touches (re-resolution wiring, regressions, validation).

### Story-level dependencies & shared-file notes

- **US1 (P1)** establishes worker seeding + attribute-aware assembly that **US3, US4, US5, US10** rely on (those become mostly seed-verify + tests).
- **US2 (P1)** offset resolution is reused by **US9** (offset applied to slices) and **US10** (offset-adjusted numbering/TOC).
- **US8 (conditionals)** and **US12 dimming** and **outline (Phase 18)** all consume the conditional evaluator from Phase 2.
- Shared files force serialization within a phase: `asciidoc-render.worker.ts` (US1, US3, US4, US5, US10, US13, STEM), `assemble-includes.ts` (US1, US8, US9, US11), `asciidoc.grammar` + `asciidoc-highlight-tags.ts` (US6, US11, STYLE, US12). Tasks touching the same file are **not** `[P]` relative to each other.

### Within Each User Story

- Tests are written first and must fail before implementation (Constitution II).
- Resolution-model/assembler changes precede worker/editor consumers.
- Story complete and independently testable before moving on.

### Parallel Opportunities

- Setup: T002, T003 in parallel (T001 first).
- Foundational tests T004–T006 in parallel; T007–T009 serialize on `extraction.ts`, then T010 mirrors.
- Within each story, all test tasks marked `[P]` run together; cross-story P2 work (e.g., US14, US15, US6) can proceed in parallel by different developers once Foundational is done, except where they share a grammar/worker file.

---

## Parallel Example: User Story 1

```bash
# Tests first (parallel):
Task: "Unit test render worker seeding in apps/web/tests/workers/asciidoc-render.worker.test.ts"  # T011
Task: "Component test use-asciidoc-preview in apps/web/tests/hooks/use-asciidoc-preview.test.ts"   # T012
Task: "E2E cross-document attributes in apps/web/e2e/preview-cross-document-attributes.spec.ts"    # T013

# Then implementation (worker + assembler serialize; hook wiring after):
Task: "Seed resolved scope in apps/web/src/workers/asciidoc-render.worker.ts"   # T014
Task: "Attribute-aware assembly in apps/web/src/workers/assemble-includes.ts"   # T015
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Phase 1: Setup.
2. Phase 2: Foundational (CRITICAL — blocks all stories).
3. Phase 3: User Story 1 → cross-document attribute values render live. **Validate, demo.**

### Incremental Delivery (priority order)

P1 (US1, US2) → P2 (US3, US4, US5, US6, US8, US11, US14 inline styles, US15 STEM) → P3 (US7, US9, US10, US12, US13, outline) → Polish. Each story is independently testable and adds value without breaking earlier ones.

### Continuous Execution (user directive)

Implementation must run end-to-end without pausing to report that individual items are done; use the newest compatible library releases (e.g. latest MathJax 3.x). Commit after each task or logical group; stop only at phase checkpoints to validate.

---

## Notes

- `[P]` = different files, no incomplete-task dependency.
- `[Story]` labels: US1–US15 map to spec user stories (US14 = inline styles FR-021a–c; US15 = STEM FR-021d–f). Phases 2, 18, 19 carry no story label (foundational/cross-cutting/polish).
- Every feature has a Jest test; every cross-file behavior also has a Playwright e2e (R10).
- Keep `extraction.ts` and `asciidoc-extraction.ts` in sync (R9) — parity test T006 guards this.
- Preserve the single DOMPurify boundary and `data-source-line` scroll-sync (Constitution VIII/IX) — regressions T083/T084.
