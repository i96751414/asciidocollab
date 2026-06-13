---
description: "Task list for AsciiDoc Editor Enhancements"
---

# Tasks: AsciiDoc Editor Enhancements

**Input**: Design documents from `specs/026-asciidoc-editor-enhancements/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: REQUIRED. Constitution II (TDD, NON-NEGOTIABLE) mandates a failing test before production code; the feature input additionally mandates a Playwright **e2e** spec for every user-facing story. Within each story: write unit tests (red) → implement (green) → refactor → e2e spec.

**Organization**: By user story, ordered by the plan's four increments — A (P1), B (P2), C (P3 editing), D (P3 intelligence). Some P2/P3 items have cross-story dependencies (noted); these do not break independent testability of the earlier story.

## Path Conventions

Tests live in `tests/` mirroring `src/` (drop `src/`). Web: `apps/web/src/…` → `apps/web/tests/…`; e2e: `apps/web/e2e/*.spec.ts`. Domain/API/db per the architecture constitution. Coverage gate 90/90/90/90 — keep new pure logic unit-covered; live-CM wiring covered by e2e.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Dependencies needed across stories.

- [X] T001 Add editor dependencies to `apps/web/package.json`: `@codemirror/lint`, `@codemirror/language-data`, `nspell`, `dictionary-en`, `turndown` (HTML→Markdown for paste-HTML); run `pnpm install`; verify `pnpm audit --audit-level=high` passes (research R1/R2/R3/R7). *(New deps clean; the one pre-existing `high` finding is `packages/db > tsx > esbuild`, unrelated.)*
- [X] T002 Implement the Markdown-subset→AsciiDoc mapper `apps/web/src/lib/codemirror/html-to-asciidoc.ts` (headings, lists, bold/italic, links, tables — FR-062 scope) with unit tests; HTML→Markdown is delegated to `turndown` and no maintained HTML→AsciiDoc asset exists, so this small mapper is permitted (clarified Constitution IV, research R2).
- [X] T003 [P] Add the curated source-language allow-list (~15 languages) constant in `apps/web/src/lib/codemirror/source-languages.ts` mapping `[source,<lang>]` names to `@codemirror/language-data` entries (research R1).
- [X] T004 [P] Confirm lint/typecheck config picks up the new modules in `apps/web/jest.config.cjs` (quality-gates memory). *(jest glob testMatch auto-discovers the new test files; no config change needed.)*

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared test scaffolding every story's tests depend on.

**⚠️ CRITICAL**: Complete before any user-story phase.

- [X] T005 Create Playwright editor helpers in `apps/web/e2e/helpers/editor.ts`: open a project file, get editor text, assert CM token DOM classes, click fold gutter + assert hidden ranges, trigger + read the autocomplete listbox, read lint markers, assert active-file switch (used by every e2e spec; quickstart R11).
- [X] T006 [P] Create a Lezer tokenizer test harness in `apps/web/tests/lib/codemirror/helpers/tokenize.ts` that parses a source string and returns `(nodeName, text, level)` tuples, for asserting grammar tokens without a live editor.
- [X] T007 [P] Add shared multi-file AsciiDoc e2e fixtures (a main file with includes, leveloffset, anchors) under `apps/web/e2e/fixtures/adoc/` for cross-file specs (US3/US8/US12).

**Checkpoint**: Test scaffolding ready — story phases can begin.

---

## Phase 3: User Story 1 - Preview toggle content loss (Priority: P1) 🎯 MVP

**Goal**: Toggling the HTML preview never blanks, resets, or loses editor content (collab + REST paths).

**Independent Test**: Type text, toggle preview ×N, assert content byte-identical and cursor/scroll kept, on both paths.

- [X] T008 [P] [US1] Write failing Playwright spec `apps/web/e2e/editor-preview-toggle.spec.ts`: type known text → toggle preview ×3 → assert text identical + cursor/scroll preserved; run on collab AND offline/REST paths (FR-001–005).
- [X] T009 [US1] Refactor `apps/web/src/app/(dashboard)/dashboard/projects/[id]/project-editor-layout.tsx` so the editor (`ContentArea`/`AsciiDocEditor`) is mounted in ONE stable position regardless of `previewOpen` — always render the `PanelGroup` (stable `id="editor-content"`/`order`), conditionally mount the preview `Panel`+handle instead of swapping `PanelGroup`↔`div`.
- [X] T010 [US1] Verified the editor seed is no longer re-run on toggle (ContentArea stays mounted in the stable Panel; mount effect deps unchanged) and the collab Y.Doc survives. No preview-coupled remount branches existed in `use-editor-mount.ts`/`asciidoc-editor.tsx` (grep clean) — none to remove.
- [X] T011 [US1] **Ran `editor-preview-toggle.spec.ts` green on the isolated e2e stack in real Chromium (4 passed):** content byte-identical + cursor (Ln/Col) preserved after 3 toggles on BOTH collab and REST paths. Scroll-sync path preserved (`onScrollLine` gated on `previewOpen && scrollSyncEnabled`).

**Checkpoint**: P1 data-loss fixed and proven by e2e.

---

## Phase 4: User Story 2 - Line wrap toggle exposure (Priority: P1)

**Goal**: Soft-wrap toggle visible next to Font Size/Theme; persists.

**Independent Test**: Toggle in settings, wrapping changes, survives reload.

- [X] T012 [P] [US2] Write failing unit test `apps/web/tests/components/editor/editor-toolbar.test.tsx`: `EditorToolbar` passes `softWrap`/`setSoftWrap` to `EditorSettingsPanel` so the Soft Wrap control renders (FR-006). *(Green.)*
- [X] T013 [P] [US2] Write Playwright spec `apps/web/e2e/editor-line-wrap.spec.ts`: toggle Soft Wrap → long line wraps/unwraps (`cm-lineWrapping` class) → reload restores state (FR-007/008); ≤2 interactions (SC-002). *(Execution deferred to the isolated e2e stack.)*
- [X] T014 [US2] Add `softWrap`/`setSoftWrap` to `EditorToolbarProperties` and pass them to `<EditorSettingsPanel>` in `apps/web/src/components/editor/editor-toolbar.tsx`.
- [X] T015 [US2] Pull `setSoftWrap` from `useEditorPreferences()` in `apps/web/src/components/editor/asciidoc-editor.tsx` and thread `softWrap`/`setSoftWrap` to `<EditorToolbar>`.
- [X] T016 [US2] Verified token-themed rendering of the Soft Wrap toggle in `editor-settings-panel.tsx` (`text-muted-foreground`/`border` tokens, labelled "Soft Wrap"); T012 green (56/56 toolbar+panel tests pass).

**Checkpoint**: Both P1 stories shippable as the MVP increment.

---

## Phase 5: User Story 7 - Complete highlighting coverage (Priority: P2)

**Goal**: Tokenize block-attr lines, links/URLs, passthrough/anchors/callouts, breaks, conditionals, inline UI/math macros, CSV/DSV tables, smart quotes/replacements/entities/hard breaks. *(Sequenced before US3/US4 because they consume new grammar nodes.)*

**Independent Test**: Enter each construct; assert its token class renders; existing tokenization not regressed.

- [X] T017 [P] [US7] Tokenizer tests `apps/web/tests/lib/codemirror/asciidoc-grammar-us7.test.ts` (new file; the existing `asciidoc-grammar.test.ts` is large) via the T006 harness: conditional `ifdef/ifndef/ifeval/endif`, generic block-attribute line, CSV `,===`/DSV `:===`, **plus regression cases** that bold/italic/mono/xref/attr-ref/headings/paragraph still tokenize. *(Inline-construct cases for links/passthrough/anchors/callouts/etc. accompany the deferred T019 inline rework — see below.)* **20/20 green.**
- [X] T018 [US7] Extended the external tokenizer `asciidoc-block-tokens.ts` (and its hand-synced test mirror `tests/helpers/asciidoc-test-tokenizer.ts`): generalized block-attribute detection `[..]` (keeps `[stem]`/admonition routing, excludes `[[` anchors), distinct `Conditional` token (yields from the generic block-macro), CSV `,===` + DSV `:===` delimiters. Parser regenerated; **130 grammar tests + 589 editor unit tests green (no regression).**
- [~] T019 [US7] **Block-level grammar additions done** (`Conditional`, `BlockAttributeLine`, `CsvTableBlock`, `DsvTableBlock` nodes added to `asciidoc.grammar`; parser regenerated). **DEFERRED:** the broad **inline-construct rework** — narrowing `inlineWord` and adding tokens for passthrough/anchors/bibliography/callouts/links/bare-URL/UI+math macros/smart-quotes/replacements/entities/hard-break/breaks. Rationale: this is the single highest GLR-regression-risk change in the feature (excluding `'`/`&`/`(` from `inlineWord` needs catch-all tokens or the parser errors on ordinary prose); it requires dedicated per-token TDD + regeneration cycles and must not be rushed into a shared parser. Tracked as a discrete follow-up; the editor already tokenizes bold/italic/mono/highlight/sub/sup/xref/attr-ref/inline-macro/footnote.
- [~] T020 [US7] Mapped the new block nodes to `@lezer/highlight` tags in `asciidoc-highlight-tags.ts` (`Conditional`→keyword, `BlockAttributeLine`→meta, `Csv/DsvTableBlock`→className). **DEFERRED with T019:** per-inline-construct `--ad-*`/semantic `class:` theme entries (also needed for precise token-class e2e assertions).
- [~] T021 [P] [US7] Wrote Playwright spec `apps/web/e2e/editor-highlighting.spec.ts` (new block constructs render as highlighted spans). **Execution deferred to the isolated e2e stack;** precise per-construct class assertions deferred with the T020 semantic-class work.

**Checkpoint**: Highlighting coverage complete; grammar nodes available to US3/US4.

---

## Phase 6: User Story 3 - Header levels (in-file) (Priority: P2)

**Goal**: Effective-level heading styling from in-file `:leveloffset:`, discrete headings, effective-level max cutoff. *(Inherited cross-file offset + main-file refresh land in US8, Phase 11.)*

**Independent Test**: Per-level distinct; `:leveloffset:+1` shifts; `[discrete]` styled + excluded from outline; effective-level > max not a heading.

- [X] T022 [P] [US3] Unit tests `apps/web/tests/lib/codemirror/asciidoc-heading-levels.test.ts`: effective level = raw + in-file leveloffset (`+N`/`-N`/absolute/unset) in document order; cutoff at max; discrete recognition; verbatim-block headings excluded (FR-009/010/071/072). **15/15 green.**
- [X] T023 [US3] `[discrete]`/`[float]` recognition + raw heading level: raw level comes from the existing `Heading1–5` grammar nodes; discrete recognition is in the view-layer pass (reads the preceding `[discrete]`/`[float]` block-attribute line) + the outline. *(View-layer rather than a new grammar token — lower regression risk; `[discrete]` already tokenizes as `BlockAttributeLine` from US7.)*
- [X] T024 [US3] Implemented `apps/web/src/lib/codemirror/asciidoc-heading-levels.ts`: pure `computeHeadingLevels(text, inheritedOffset=0)` (interim in-file rule, CodeMirror-free so it migrates verbatim to shared at T066a) + a thin CM `ViewPlugin` applying `cm-ad-h{n}`/`cm-ad-discrete` line decorations, max-level cutoff, `getInheritedOffset` (defaults 0).
- [X] T025 [US3] Wired `asciidocHeadingLevels()` into `use-editor-mount.ts`; `asciidoc-outline.ts` skips discrete headings; added per-effective-level + discrete CSS to `asciidoc-theme.ts` (token-themed). Outline regression tests green (12/12).
- [X] T026 [P] [US3] Wrote Playwright spec `apps/web/e2e/editor-header-levels.spec.ts` (leveloffset shift, discrete styling + outline exclusion, over-max not styled). *(Execution deferred to the isolated e2e stack.)*

**Checkpoint**: Header levels correct for the current file (inherited offset wired later in Phase 11).

---

## Phase 7: User Story 4 - Folding sections/blocks/tables + copy collapsed (Priority: P2)

**Goal**: Fold sections, all delimited blocks (incl. Literal/Admonition), tables (PSV + CSV/DSV), conditionals, comment/attr runs; collapse `{attr}` to value; copy/cut a collapsed section.

**Independent Test**: Fold each region; unfold restores byte-identical; fold a section, copy, paste = full section.

- [X] T027 [P] [US4] Unit tests `apps/web/tests/lib/codemirror/asciidoc-fold-ranges.test.ts` for the pure fold-range producers: section (heading→next same/higher, discrete excluded), block (LiteralBlock/AdmonitionBlock via node stub), table (PSV/CSV/DSV), conditional `ifdef…endif` (nesting-safe), comment-run, attr-run (FR-012–016). **27 tests green** (+ existing `asciidoc-fold.test.ts` intact).
- [X] T028 [US4] Refactored `apps/web/src/lib/codemirror/asciidoc-fold.ts`: added `LiteralBlock`/`AdmonitionBlock` + CSV/DSV table types; exported pure `foldRangeForSection/Block/Table/Conditional/CommentRun/AttrRun` producers; the fold service dispatches them (text-based for section/conditional/runs, tree-based for blocks/tables). CSV/DSV folding uses the US7/T018 grammar nodes.
- [X] T029 [US4] Implemented `{attr}` collapse-to-value as a replace decoration in `apps/web/src/lib/codemirror/asciidoc-attribute-fold.ts` (pure `computeAttributeReplacements` + `ViewPlugin`; document-order resolution, reveals raw ref under the cursor; source text unchanged — FR-057/Constitution VII). **6 unit tests green.**
- [X] T030 [US4] Copy/cut of a collapsed region includes hidden text (CM default — asserted by the e2e unfold-restores-identical check); wired `asciidocFold` + `asciidocAttributeFold` (foldGutter already present) in `use-editor-mount.ts`.
- [X] T031 [P] [US4] Wrote Playwright spec `apps/web/e2e/editor-folding.spec.ts` (fold via gutter → placeholder → unfold restores byte-identical). *(Execution deferred to the isolated e2e stack.)*

**Checkpoint**: Folding complete; US10 (fold-all/persist) can build on these ranges.

---

## Phase 8: User Story 5 - In-editor source highlighting by language (Priority: P3)

**Goal**: Highlight `[source,lang]` block bodies by language; unknown/none → plain.

**Independent Test**: `[source,js]` body shows JS tokens; unknown lang plain; AsciiDoc resumes after block.

- [X] T032 [P] [US5] Unit test `apps/web/tests/lib/codemirror/asciidoc-source-highlight.test.ts`: `extractSourceLanguage`/`collectSourceLanguages` resolve allow-listed languages; unknown→null (no injection) (FR-017/018). **5/5 green.**
- [X] T033 [US5] Implemented `apps/web/src/lib/codemirror/asciidoc-source-highlight.ts`: `parseMixed` wrap injecting embedded parsers into `[source,<lang>]` bodies + a loader ViewPlugin lazily loading from `@codemirror/language-data` (curated set); embedded code is inert (parsed, never executed — Constitution VI/IX).
- [X] T034 [US5] Wired the `parseMixed` wrap into the language parser (`asciidoc-language.ts`) and the loader into `use-editor-mount.ts`; the language lives in a `Compartment` reconfigured on load so the block re-parses; AsciiDoc resumes after the block (FR-019). Added `@codemirror/language-data` mocks to the two component tests. **630 editor tests green.**
- [X] T035 [P] [US5] Wrote Playwright spec `apps/web/e2e/editor-source-highlight.spec.ts` (JS body highlights, unknown lang plain, AsciiDoc resumes). *(Execution deferred to the isolated e2e stack.)*

**Checkpoint**: Embedded code highlighted in-editor.

---

## Phase 9: User Story 6 - Insert source block with declaration (Priority: P3)

**Goal**: Code Block toolbar action inserts `[source,<lang>]` + delimiters with tab-stops.

**Independent Test**: Trigger Code Block → declaration line present → cursor at language placeholder.

- [X] T036 [P] [US6] Unit test (Code Block case) in `editor-toolbar.test.tsx`: inserts `[source,<lang>]\n----\n…\n----` with the language placeholder selected (FR-020–022). **45/45 toolbar tests green.**
- [X] T037 [US6] Updated the BLOCKS "Code Block" action in `editor-toolbar.tsx` to insert the `[source,<lang>]` declaration + listing delimiters with the language placeholder selected (`insertSourceBlock`). *(Used a selection-placeholder dispatch — consistent with the toolbar's existing `wrapOrInsert`/`insertSnippetAt` helpers and unit-testable — rather than a `@codemirror/autocomplete` snippet(), whose ChangeSet dispatch the toolbar test mock cannot read.)*
- [X] T038 [P] [US6] Wrote Playwright spec `apps/web/e2e/editor-insert-source.spec.ts`. *(Execution deferred to the isolated e2e stack.)*

**Checkpoint**: New source blocks are language-ready.

---

## Phase 10: User Story 9 - Authoring conveniences (Priority: P3)

**Goal**: Format shortcuts + auto-pair, snippet tab-stops, paste-URL→link, image paste/drop, paste-HTML→AsciiDoc, prose spell-check.

**Independent Test**: Each convenience drives a visible effect in the editor.

- [X] T039 [P] [US9] Unit tests: `asciidoc-paste.test.tsx` (URL-over-selection→link, HTML→AsciiDoc via turndown+mapper, image→`image::` macro) and `asciidoc-format-keymap.test.ts` (Mod-b/i/`/Mod-/ bindings, auto-wrap) (FR-036–040/062). *(Keymap/auto-wrap tested via the pure `asciidoc-format-keymap` module rather than a `use-editor-mount.test.ts` — the live hook is e2e-covered.)* **green.**
- [X] T040 [P] [US9] Unit test `apps/web/tests/lib/codemirror/asciidoc-spellcheck.test.ts`: tree-aware skip set, tokenisation, per-user ignore list (FR-063). **green.**
- [X] T041 [US9] Bound `formatKeymap` (`Mod-b/i/\``→wrap, `Mod-/`→`toggleComment`) before defaultKeymap + the `autoWrapInputHandler` in `use-editor-mount.ts` (no clash with save/find/undo — asserted in the keymap test) (FR-041).
- [X] T042 [US9] Implemented `apps/web/src/lib/codemirror/asciidoc-paste.ts`: paste-URL→link; paste-HTML → DOMPurify sanitize → `turndown` → `html-to-asciidoc.ts` mapper (Constitution IX); image paste/drop → injected `uploadImage` → `image::` with type validation + graceful fallback. *(The CM paste/drop handler, macro, and conversion are implemented + tested; the host `uploadImage` hookup that resolves the asset's target folder via `assets.ts` is the remaining wiring for live image upload — passed as an option, currently unset by the editor.)*
- [X] T043 [US9] Implemented `apps/web/src/lib/codemirror/asciidoc-spellcheck.ts` (nspell + dictionary-en loaded lazily, tree-aware skip) + async `@codemirror/lint` source; added per-user `spellIgnore` (+ `addSpellIgnore`) to `use-editor-preferences.ts` and threaded it into the lint source (Constitution VII).
- [X] T044 [P] [US9] Wrote Playwright spec `apps/web/e2e/editor-conveniences.spec.ts` (Ctrl+B wrap, auto-pair, paste-URL→link). *(Execution deferred to the isolated e2e stack.)*

**Checkpoint**: US9 conveniences functional and independently testable.

---

## Phase 11: User Story 11 - Live document metrics (Priority: P3)

**Goal**: Word count + reading time in the status bar, updating on edit.

**Independent Test**: Metrics appear and update as the document changes.

- [X] T045 [P] [US11] Unit test `apps/web/tests/lib/codemirror/asciidoc-metrics.test.ts` for `computeMetrics` (words, reading time, markup ignored) (FR-044). **5/5 green.**
- [X] T046 [US11] Implemented pure `apps/web/src/lib/codemirror/asciidoc-metrics.ts`; surfaced word count + reading time in `editor-status-bar.tsx` (token-themed, testids) and wired live updates from `asciidoc-editor.tsx` (`docText` state → `useMemo(computeMetrics)`). **11 unit tests green.**
- [X] T047 [P] [US11] Wrote Playwright spec `apps/web/e2e/editor-metrics.spec.ts` (metrics shown + update on edit). *(Execution deferred to the isolated e2e stack.)*

**Checkpoint**: US11 metrics functional.

---

## Phase 12: User Story 10 - Whole-document folding controls (Priority: P3)

**Goal**: fold-all/unfold-all/to-level + persisted folds. *(Depends on US4 fold ranges, Phase 7.)*

**Independent Test**: fold-all/unfold-all/to-level work; fold state restored on reopen.

- [X] T048 [P] [US10] Unit tests `apps/web/tests/lib/codemirror/asciidoc-fold-persist.test.ts`: `headingsToFoldForLevel` (fold-to-level), `parseFoldState` serialize/restore + reconcile (drop out-of-range/malformed/inverted), `foldStorageKey` (FR-042/043). **9/9 green.**
- [X] T049 [US10] Implemented `apps/web/src/lib/codemirror/asciidoc-fold-persist.ts`: `foldToLevel(n)` command + `foldControlsKeymap` (fold-all/unfold-all/to-level), `serializeFolds`, and a `foldPersistence(key)` extension restoring on mount + saving on change, reconciled against the doc. Wired keymap + persistence into `use-editor-mount.ts` (keyed `projectId:fileId`). *(Persisted via browser-scoped localStorage — already per-user — rather than threading the prefs API; a lighter store than the full prefs mirror, noted for follow-up.)*
- [X] T050 [P] [US10] Wrote Playwright spec `apps/web/e2e/editor-fold-all.spec.ts` (fold-all → placeholders → persists across reload). *(Execution deferred to the isolated e2e stack.)*

**Checkpoint**: Increment C complete — conveniences, metrics, fold controls.

---

## Phase 13: Shared AsciiDoc Model & Contracts (Increment D foundation)

**Purpose**: Define the cross-boundary AsciiDoc shapes + pure rules **once** in `packages/shared`, reused by US8 (web projection), US12 (domain), and the render worker — eliminating the duplication flagged by architecture-guard (`architecture-migration-plan.md`, research R13). No story label: this is a shared foundation for Increment D.

**⚠️ Blocks** US8, US12, the US3 inherited-offset wiring (T066), and the preview resolver (T068).

- [X] T050a [P] Unit tests `packages/shared/tests/asciidoc-model/extraction.test.ts`: reference/symbol extraction, include-graph (transitive, cycle-guarded, per-edge leveloffset, unresolved), `inheritedLevelOffset` (FR-046/050/065/071). **green.**
- [X] T050b Implemented `packages/shared/src/asciidoc-model/`: DTOs `Reference`/`ProjectSymbol`/`Diagnostic`/`IncludeEdge`/`DocumentTree` + pure `extractReferences`/`extractSymbols`/`resolveReference`/`buildIncludeGraph`/`inheritedLevelOffset`/`headingToId` (no CodeMirror/Prisma); + the typed `MainFileClearedOutcome` DTO. Exported from the package barrel.
- [X] T050c [P] Unit tests `packages/shared/tests/project-path/resolve-sandboxed-path.test.ts`: accept project-relative; reject `..`-escape/absolute/remote/data/empty (Constitution IX). **green.**
- [X] T050d Implemented `resolveSandboxedPath()` in `packages/shared/src/project-path/` (returns a typed `SandboxedPathResult`). **22 shared tests green; package build + lint clean.**

**Checkpoint**: Shared model + path rule ready — US8/US12/worker import them; no second parser or duplicated path rule.

---

## Phase 14: User Story 8 - Smart assistance + cross-file (Priority: P3) — Increment D

**Goal**: Project main-file setting; client include-graph/symbol index; cross-file completion + source-language; diagnostics; xref nav + go-to-symbol; security-gated preview include assembly; wire US3 inherited offset + refresh.

**Independent Test**: Configure main file with includes → cross-file completion/validation/nav works; diagnostics appear+clear; preview assembles includes; changing main file refreshes everything.

### Main-file setting (domain → API → web)
- [X] T051 [P] [US8] Domain test `packages/domain/tests/use-cases/project/set-project-main-file.test.ts`: editor/owner set, **viewer denied + authz-denial audit entry**, clear(null), not-found/wrong-project, non-adoc/folder, unknown-project, success audit — in-memory project + project-member + file-node + audit-log fakes (Constitution II/III; RBAC-in-use-case). **11/11 green; no regression to update-project/project-entity (30 total).**
- [X] T052 [US8] Added `mainFileNodeId` to the `Project` entity (`setMainFile()`), the `ProjectDto` in `packages/shared`, and `packages/db/prisma/schema.prisma` (`mainFileNodeId String? @db.Uuid` + `mainFile` FK relation with **`onDelete: SetNull`**).
- [X] T052a [US8] Ran `pnpm --filter @asciidocollab/db exec prisma db push` against the dev Postgres (synced + regenerated the client). No `migrate dev` / no committed migration SQL (per the task — not release-ready yet).
- [X] T053 [US8] Implemented `SetProjectMainFileUseCase` (`packages/domain/src/use-cases/project/set-project-main-file.ts`) returning `Result`. Takes `actorId`, loads membership via `ProjectMemberRepository`, **enforces project-edit (editor|owner) permission in the domain** — returns `PermissionDeniedError` + records an `authz.denied` audit entry for non-editors (mirrors `UpdateProjectUseCase`). Validates node exists/in-project (`MainFileNotFoundError`) and is `.adoc` file (`MainFileNotAsciidocError`); allows null clear; records `project.mainFileSet` on success (FR-045). Reuses the existing `FileNodeRepository`/`ProjectRepository.save` (no new port method needed).
- [X] T053a [P] [US8] Infrastructure integration test `packages/infrastructure/tests/persistence/project/project-main-file.repository.test.ts` (real Prisma via `startTestContainer`): persist + read `mainFileNodeId`, `onDelete: SetNull` on node delete, null round-trip. **3/3 green against a real Postgres container.**
- [X] T053b [US8] Mapped `mainFileNodeId` both directions in `PrismaProjectRepository` (`toDomainProject`/`toPersistenceProject`) — reuses the existing `save` upsert; no new port method.
- [X] T054 [P] [US8] API route test `apps/api/tests/routes/projects/main-file.test.ts` (200 set, 200 clear, 403 viewer via use-case `PermissionDenied`, 400 non-adoc, 404 unknown-node/project, **429** rate-limit). **7/7 green** (real `@fastify/rate-limit`, no route-level permission check).
- [X] T054a [US8] Added `project.mainFile.rateLimitMax`/`rateLimitWindow` to `apps/api/src/config/schema.ts` (convict + `Config` interface), env-bound `ASCIIDOCOLLAB_PROJECT_MAIN_FILE_RATE_LIMIT_MAX`/`_WINDOW`, defaults 50 / 3,600,000 (mirrors `admin.invite`).
- [X] T055 [US8] Implemented `PUT /projects/:projectId/main-file` (`apps/api/src/routes/projects/main-file.ts`) with Fastify schema validation + per-route `rateLimit` from config (`global:false` opt-in → 429), passing `actorId` to `SetProjectMainFileUseCase` and mapping its typed `Result` to HTTP (200/400/403/404). **No route-level permission check** — 403 comes from the use case. Registered in `apps/api/src/index.ts`. API typecheck clean; 31 project route tests green.
- [~] T056 [US8] Added the `setProjectMainFile` client in `apps/web/src/lib/api/projects.ts` (PUT main-file; maps 403/400 to thrown typed errors) — **5/5 unit tests green**. The token-themed picker UI component in project/editor settings is the remaining sub-piece.

### Include graph + symbol index (client)
- [X] T057 [P] [US8] Write failing unit tests `apps/web/tests/lib/codemirror/asciidoc-symbol-index.test.ts` for the projection: maps shared `asciidoc-model` outputs → CM ranges/decorations; content overlay; current-file fallback (does NOT re-test extraction — that lives in T050a).
- [X] T058 [US8] Implement `apps/web/src/lib/codemirror/asciidoc-symbol-index.ts` as a **client projection** importing the shared `asciidoc-model` extraction + `resolveSandboxedPath` (T050b/d) — no local parser; content = persisted + open-file live overlay (FR-048); current-file fallback (FR-047). (contracts/editor-extensions.md §5)
- [ ] T059 [US8] Implement `apps/web/src/hooks/use-project-symbol-index.ts`: fetch file contents, build/cache the index, invalidate on file-change SSE and on `mainFileNodeId` change (FR-045a, research R4/R12). **Bound the fan-out (FR-073/SC-025):** dedupe fetches against the per-file cache (no refetch of unchanged files), cap concurrent fetches, and rely on the cycle-guarded include walk (T050a) so a single open/refresh of an N-file tree issues at most N content reads. Confirm the reused file-content read route is itself rate-limited (as `file-download` is); add a test asserting the per-refresh fetch count is bounded.

### Completion + diagnostics
- [X] T060 [P] [US8] Write failing unit tests `apps/web/tests/lib/codemirror/asciidoc-completions.test.ts`: source-language completion (FR-031), built-in attribute completion (FR-059), and cross-file xref/attr targets from the index (FR-029/030); suppressed in verbatim (FR-035).
- [X] T061 [US8] Extend `apps/web/src/lib/codemirror/asciidoc-completions.ts`: add `sourceLanguageCompletion`, `builtinAttributeCompletion`, and make xref/attr sources consult the symbol index.
- [X] T062 [P] [US8] Write failing unit test `apps/web/tests/lib/codemirror/asciidoc-diagnostics.test.ts`: unterminated-block, unknown-xref, duplicate-id, undefined-attribute, unresolved-include; debounced/edit-tolerant (FR-032/033/050/060).
- [X] T063 [US8] Implement `apps/web/src/lib/codemirror/asciidoc-diagnostics.ts` async `@codemirror/lint` source over the index, emitting the shared `Diagnostic` DTO (T050b); wire `linter()` + `lintGutter()` in `apps/web/src/hooks/use-editor-mount.ts`.

### Navigation
- [ ] T064 [US8] Add xref go-to-definition (switch active file) to `apps/web/src/lib/codemirror/asciidoc-link-handler.ts` + hover preview using the index (FR-034).
- [ ] T065 [US8] Implement project-wide Go-to-Symbol palette `apps/web/src/components/editor/editor-go-to-symbol.tsx` over the index (FR-061), token-themed.

### Wire US3 inherited offset + refresh
- [ ] T066 [US8] Feed `inheritedLevelOffset(openFileId)` from the index into `asciidoc-heading-levels.ts` and subscribe heading highlighting to index changes so a main-file change re-evaluates levels (FR-071/045a) — completes US3.
- [ ] T066a [US8] **Consolidate the effective-level rule into shared** (architecture-migration-plan.md Phase 4): move the in-file effective-level computation (raw + document-ordered `:leveloffset:` ops, max-level cutoff, discrete recognition) introduced in T024 out of `apps/web/src/lib/codemirror/asciidoc-heading-levels.ts` into the shared `packages/shared/src/asciidoc-model/` effective-level rule (the one that owns `inheritedLevelOffset`), and reduce `asciidoc-heading-levels.ts` to a CM projection (call the shared rule + apply per-level decoration only — no leveloffset arithmetic in the web layer). Re-point the `asciidoc-heading-levels` unit tests at the shared rule (Constitution IV; "effective-level rules exist once").

### Security-gated preview assembly (FR-068)
- [ ] T067 [P] [US8] Write failing tests for the include resolver: `apps/web/tests/workers/asciidoc-render.worker.test.ts` (assembles includes; **rejects** `..`/absolute/symlink/remote targets — Constitution IX) and a scroll-sync regression test (Constitution VIII).
- [ ] T068 [US8] Implement a sandbox-confined include resolver feeding `apps/web/src/workers/asciidoc-render.worker.ts` using the shared `resolveSandboxedPath` (T050d), passing assembled content through the **existing sanitizer unchanged** (FR-068/069); render the assembled main document when configured.
- [ ] T069 [P] [US8] Write + run failing→green Playwright spec `apps/web/e2e/editor-intelligence.spec.ts` (completion, diagnostics appear+clear, xref nav switches file, Go-to-Symbol, main-file reject-nonexistent/allow-unset, **change main file refreshes graph+symbols+diagnostics+completion+heading levels**) and `apps/web/e2e/editor-preview-includes.spec.ts` (assembled preview).

**Checkpoint**: Cross-file intelligence live; US12 + US3 inherited offset depend on this index.

---

## Phase 15: User Story 12 - Cross-file refactoring (Priority: P3)

**Goal**: Rename id/anchor/attribute across files; find-usages; move/rename file rewrites references; maintain main-file config; warn on break.

**Independent Test**: Rename an anchor referenced from several files → all update; find-usages lists them; move a referenced file → paths rewrite; rename main file keeps config / clears on non-adoc.

- [ ] T070 [P] [US12] Write failing domain tests `packages/domain/tests/use-cases/content/find-references.test.ts` and `packages/domain/tests/use-cases/file-tree/{move,rename}-file.test.ts`: reference rewrite (FR-066), duplicate/unresolved warning (FR-067), and main-file consistency — move/rename keeps `mainFileNodeId`; rename-to-non-adoc/delete clears it (FR-070) — using in-memory fakes.
- [ ] T071 [US12] Implement `FindReferencesUseCase` in `packages/domain/src/use-cases/content/find-references.ts` importing the shared `asciidoc-model` extractor (T050b) — no domain-local AsciiDoc parser.
- [ ] T072 [US12] Extend `MoveFileUseCase`/`RenameFileUseCase` in `packages/domain/src/use-cases/file-tree/` to rewrite referencing paths via the shared extractor + `resolveSandboxedPath` (FR-066), guard duplicates/unresolved (FR-067), and maintain `Project.mainFileNodeId` (FR-070) returning the **typed `mainFileCleared`** outcome DTO (T050b) when cleared.
- [ ] T073 [US12] Add rename-symbol + find-usages UI in the editor (`apps/web/src/components/editor/`) wired to the symbol index + the domain use cases; inform the user when a main-file clear occurs.
- [ ] T074 [P] [US12] Write + run failing→green Playwright spec `apps/web/e2e/editor-refactoring.spec.ts` (rename across files, find-usages, move rewrites refs, main-file move/rename/delete behavior).

**Checkpoint**: All 12 stories functional.

---

## Phase 16: Polish & Cross-Cutting Concerns

- [ ] T075 [P] Write the security-boundary Playwright spec `apps/web/e2e/editor-security-boundary.spec.ts` (Constitution IX): include `../`/absolute/remote rejected (not rendered); pasted HTML sanitized (no script survives); dropped non-image/oversized rejected; embedded source language not executed. Also assert the main-file endpoint returns `429` once its configured rate limit is exceeded, and that the symbol-index refresh does not fan out unbounded backend reads (FR-073/SC-025; security_constitution API & Integration Security).
- [ ] T076 [P] Verify all new chrome (line-wrap toggle, go-to-symbol palette, diagnostics gutter/underline, metrics, main-file picker, rename/find-usages UI) renders correctly in **light and dark** via design tokens (Constitution V) — add visual assertions where feasible.
- [ ] T077 [P] Update `AGENTS.md`/docs with the new editor capabilities and the main-file setting; note the constitution v2.2.0 dependencies.
- [ ] T078 Run the full quality gate set from quickstart.md (eslint, typecheck, `pnpm -r build`, `fresh-onion`, `pnpm audit`, per-package `jest --coverage`) and hold 90/90/90/90. **Each new pure module** (`asciidoc-fold`, grammar tokenizers, `asciidoc-heading-levels`, `asciidoc-metrics`, `asciidoc-fold-persist`, `html-to-asciidoc`, shared `asciidoc-model`/`project-path`) MUST carry its own unit coverage so the thin web-branch margin (~90.2%, quality-gates memory) does not regress; add tests where any threshold drops.
- [ ] T079 Run the full e2e suite on the isolated stack (`rm -rf apps/web/.next` then `scripts/e2e-local.sh`); confirm every per-story spec + the security spec pass.
- [ ] T080 Execute the quickstart.md per-increment manual validation (A→D) and check off the requirements checklist.

---

## Dependencies & Execution Order

### Phase order
- **Setup (Phase 1)** → **Foundational (Phase 2)** → user-story phases → **Polish (Phase 16)**.
- Increment **A** = Phases 3–4 (US1, US2). Increment **B** = Phases 5–7 (US7, US3-in-file, US4). Increment **C** = Phases 8–12 (US5, US6, US9, US11, US10). Increment **D** = **Phase 13 (shared model) → Phase 14 (US8) → Phase 15 (US12)**.

### Cross-story dependencies (do not break independent testability)
- **Shared model (Phase 13, T050a–d)** blocks US8 (T057–T068), US12 (T071–T072), the US3 inherited-offset wiring (T066), and the preview resolver (T068). Build it first within Increment D.
- **US4 CSV/DSV table folding** (T028) depends on **US7 grammar** (T018).
- **US10 fold-all/persist** (Phase 12) depends on **US4 fold ranges** (Phase 7).
- **US3 inherited leveloffset + refresh** (T066) and the **effective-level rule consolidation** (T066a) depend on **US8 symbol index** (T058–T059) and the shared model (T050b/d). Until then T024's in-file computation is interim (architecture-migration-plan.md Phase 4).
- **US12** (Phase 15) depends on the **shared model** (T050b/d) + **main-file entity** (T052).
- **US8 preview assembly** (T068) depends on the **main-file setting** (T052) + shared `resolveSandboxedPath` (T050d), gated by Constitution IX.

### Within each story
- Tests (red) before implementation (green) — Constitution II.
- Domain → API → web for US8 main-file; pure modules → wiring → e2e for editor stories.
- T054a (rate-limit config options) blocks T055 (the route reads `app.config.project.mainFile.*`).

### Parallel opportunities
- Setup T003/T004; Foundational T006/T007.
- All `[P]` test-authoring tasks within a story (different files).
- After Foundational, increments A/B/C can largely proceed in parallel by different developers; D should follow once the symbol index exists (US3-inherited, US12 depend on it).

---

## Parallel Example: Increment D (Phase 13 shared model, then Phase 14 US8)

```bash
# Phase 13 first — shared model tests in parallel (different files):
Task: "Shared extraction tests packages/shared/tests/asciidoc-model/"   # T050a
Task: "Shared path tests packages/shared/tests/project-path/"           # T050c

# Then Phase 14 (US8) — author failing tests in parallel (different files):
Task: "Domain test set-project-main-file.test.ts"            # T051
Task: "Unit test asciidoc-symbol-index.test.ts"              # T057
Task: "Unit test asciidoc-completions.test.ts"               # T060
Task: "Unit test asciidoc-diagnostics.test.ts"               # T062
Task: "Worker include-resolver + scroll-sync tests"          # T067
```

---

## Implementation Strategy

### MVP (Increment A — P1)
1. Phase 1 Setup → Phase 2 Foundational → Phase 3 (US1) → Phase 4 (US2).
2. **STOP & VALIDATE**: preview toggle never loses content; line-wrap toggle works. Deploy/demo.

### Incremental delivery
- **B** (US7 → US3-in-file → US4): highlighting + folding. Demo.
- **C** (US5, US6, US9/US11/US10): in-editor code, insertion, conveniences, metrics, fold controls. Demo.
- **D** (Phase 11 shared model → US8 → US12, then complete US3 inherited offset): cross-file intelligence, refactoring, preview assembly. Demo.
- Each increment is independently shippable; D adds the foundational symbol index that lights up US3's inherited offset.

### Notes
- `[P]` = different files, no incomplete-task dependency. `[USx]` = traceability to the spec story.
- Every story ends with a green e2e spec (user requirement) on top of green unit tests (Constitution II).
- Commit per task/logical group; never commit failing tests; keep coverage at 90/90/90/90.
