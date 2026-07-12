---

description: "Task list for feature 039 — In-Browser PDF Export"
---

# Tasks: In-Browser PDF Export

**Input**: Design documents from `/specs/039-export-pdf-client/`

**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅

**Implementation**: Every task MUST be executed via the `/tdd` skill (Constitution §Implementation
Discipline). Tasks describe WHAT; `/tdd` owns red-green-refactor. One deliverable = one task — never
split "write test" from "write implementation".

> **✅ Governance prerequisite RESOLVED (2026-07-11)**: the architecture-constitution Technology
> Mandate now permits **client-side ruby.wasm** (real Asciidoctor-PDF gem) alongside the server
> sidecar, per NON-NEGOTIABLE Principle X — landed in `architecture_constitution.md` **v2.5.0** (PDF
> mandate + Async rules + Module Boundaries deviation for `packages/asciidoc-pdf` + Blocking rule 9:
> a package MUST NOT import from an app). No governance blocker remains; Phase 2 may proceed.

**Path conventions**: package tests → `packages/asciidoc-pdf/tests/` (mirrors `src/`); web tests →
`apps/web/tests/` (mirrors `src/`); e2e/parity → `apps/web/e2e/`. Never `__tests__/` or co-located.

**Fully offline v1**: no `apps/api` changes; remote includes/images and PlantUML/ditaa are
warned-and-skipped (research R7/R9).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Stand up the new package + the wasm build/vendor pipeline.

- [X] T001 Scaffold browser-only leaf package `packages/asciidoc-pdf` (private `package.json`, `tsconfig.json` node16/composite, `jest.config.cjs`, `src/index.ts` barrel) modeled on `packages/asciidoc-core`; deps `@ruby/wasm-wasi`, `@bjorn3/browser_wasi_shim`, `@asciidocollab/asciidoc-core`; add to `pnpm -r build`. Package MUST NOT be importable by domain/application/infrastructure.
- [X] T002 [P] Add pinned `packages/asciidoc-pdf/ruby/Gemfile` + `Gemfile.lock` (asciidoctor-pdf, prawn-svg, prawn-templates, rouge, text-hyphen, hexapdf, js) excluding native transitive gems (bigdecimal etc.) per research R1.
- [X] T003 Create `packages/asciidoc-pdf/ruby/build-wasm.sh` + `build:wasm` package script (rbwasm builder image + wasi-vfs baking stdlib+gems under `/usr`) emitting `asciidoctor-pdf.wasm`; the build MUST fail if any native gem extension enters the closure (Principle XIV / research R1).
- [X] T004 [P] Add a `.github/workflows/ci.yml` job that runs the wasm build and uploads `asciidoctor-pdf.wasm` as an artifact (model on existing `actions/upload-artifact@v7` usage; no Docker-image publish).
- [X] T005 Add `apps/web/scripts/build-asciidoctor-pdf-wasm.mjs` to vendor the wasm blob into `apps/web/public/vendor/asciidoctor-pdf/` and wire it into `apps/web` `predev`/`prebuild` (mirror `build-mathjax-assets.mjs`); serve same-origin, immutable-cached (research R2).
- [X] T006 [P] Configure `apps/web/next.config.js` for `.wasm` asset handling and confirm the single-threaded build needs **no** COOP/COEP headers (research R2).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The environment-agnostic render engine every user story depends on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T007 [P] Define worker message-protocol + cross-boundary DTOs in `packages/asciidoc-pdf/src/protocol.ts` (`RenderRequest`/`Progress`/`Result`/`Error`, `RenderDiagnostic`, `ProjectSnapshot`, `GeneratedAsset`, `CacheEntry`) per data-model.md + contracts/worker-protocol.md.
- [X] T008 Implement warm-VM lifecycle in `packages/asciidoc-pdf/src/vm/ruby-pdf-vm.ts` (`@ruby/wasm-wasi` + `@bjorn3/browser_wasi_shim` manual preopens `/usr` `/project` `/out` `/tmp`; instantiate-once; `warmup`). **Prereq: T047** (program against the typed wasi-bridge adapter, not the raw untyped libs).
- [X] T009 Implement VFS population in `packages/asciidoc-pdf/src/vfs/populate.ts` (`ProjectSnapshot` → `/project` tree, read-back `/out`; reject residual `..`/absolute/remote paths as defense-in-depth) per contracts/vfs-population.md.
- [X] T010 [P] Implement content-addressed generated-asset cache in `packages/asciidoc-pdf/src/cache/content-address.ts` (`sourceHash` keying, `CacheEntry` Map store, logical-tick LRU — no `Date.now()` in the output path) per data-model.md / research R6.
- [X] T011 Implement the pipeline orchestrator in `packages/asciidoc-pdf/src/pipeline/orchestrator.ts` (ordered `PipelineStage` sequencing with `readFile` + `RenderShim` interfaces injected for testability; cancel/staleness at stage boundaries).
- [X] T012 Implement Ruby convert invocation in `packages/asciidoc-pdf/src/convert/invoke.ts` (`backend:'pdf'`, `safe: :unsafe` with the WASM VM as the boundary, attribute-map builder, optional hexapdf gated on capability, read `/out` → bytes) per contracts/convert-invocation.md. **Prereq: T047** (wasi-bridge adapter).
- [X] T013 [P] Implement deterministic-output normalization in `packages/asciidoc-pdf/src/convert/normalize-pdf.ts` (fixed `SOURCE_DATE_EPOCH`; strip `/CreationDate`,`/ModDate`,`/ID` nondeterminism) — Principle XII / research R6.
- [X] T014 Implement the PDF Web Worker `apps/web/src/workers/asciidoc-pdf.worker.ts` + factory `apps/web/src/lib/create-pdf-worker.ts` wiring VM + orchestrator + protocol (mirror `create-render-worker.ts`); register in `apps/web/src/workers/tsconfig.json` `build:worker` pass. **Prereq: T047** (wasi-bridge adapter) + T048 (IncludeAssembler port supplied here at the composition root).
- [X] T015 Implement `ProjectSnapshot` capture in `apps/web/src/lib/pdf/build-project-snapshot.ts` from `useProjectSymbolIndex().getFiles()` + `mainFile`/`selectedFile` + theme/font/bib/imagesdir discovery.
- [X] T016 Build the reusable reference-parity harness under `apps/web/e2e/pdf-parity/` (export in-app → pdf.js rasterize → `pixelmatch`/`odiff` vs committed reference PDF at element-level tolerance; emit diff image on failure) per research R5. Net-new visual-regression infra (Principles XI/XV).

**Checkpoint**: Render engine can instantiate, populate VFS, convert, and be diffed against a
reference PDF. User stories can begin.

---

## Phase 3: User Story 1 - One-click faithful PDF export (Priority: P1) 🎯 MVP

**Goal**: Click **Export to PDF** → downloadable, print-ready PDF honoring the project's own theme,
fonts, and images — client-side, no source egress.

**Independent Test**: Export a themed + branded-font + images project; PDF matches the reference at
element-level parity; network inspection shows zero source egress.

- [X] T017 [US1] Implement the **image-guard** stage `packages/asciidoc-pdf/src/pipeline/stages/image-guard.ts` (validate local images by type/size; remote/escaping image refs → `remote-skipped`/`unsupported-image` diagnostic, no fetch — FR-013/Principle IX/X) **and** the **asset-mount** stage `packages/asciidoc-pdf/src/pipeline/stages/mount-assets.ts` (mount theme YAML + custom fonts with WOFF2→TTF conversion; default theme fonts already baked) per research R8/R9 — the two data-model pipeline stages this task owns.
- [X] T018 [US1] Implement the project-faithful attribute builder in `packages/asciidoc-pdf/src/convert/invoke.ts` (`pdf-theme`/`pdf-themesdir`/`pdf-fontsdir`/`imagesdir`/`source-highlighter: rouge` + `ProjectSnapshot.attributes`, never fixed defaults) — spec FR-003 / Principle XI.
- [X] T019 [US1] Implement `apps/web/src/hooks/use-pdf-export.ts` (post render request, receive `Blob`, trigger download, `requestId` staleness guard).
- [X] T020 [P] [US1] Implement `apps/web/src/components/pdf-export-button.tsx` (design-token styling, cold-start spinner driven by `progress` messages) — Principle V.
- [X] T021 [US1] Wire the Export button + snapshot into `apps/web/src/app/(dashboard)/dashboard/projects/[id]/project-editor-layout.tsx` (`rootFileId = mainFile ?? selectedFile?.nodeId`, feed `getProjectFiles`).
- [X] T022 [US1] Implement per-resource diagnostics surface `apps/web/src/components/pdf-diagnostics.tsx` wired to `RenderResult.diagnostics` (warnings never abort the export) — spec FR-012.
- [X] T023 [US1] Enforce and prove no-egress: the worker performs zero network I/O and remote refs yield a `remote-skipped` diagnostic (test in `apps/web/tests/workers/pdf-no-egress.test.ts`) — NON-NEGOTIABLE Principle X / SC-003.
- [X] T024 [US1] Add reference-parity fixture + comparison test `apps/web/e2e/pdf-parity/fixtures/theme-fonts/` (custom theme + branded fonts + images) verifying element-level parity — Principle XI/XV / SC-001. Also assert **print-readiness (FR-014)**: fonts are embedded, text is selectable where the reference produces selectable text, and page geometry matches the reference.

**Checkpoint**: MVP — faithful one-click export, parity-verified, provably client-side.

---

## Phase 4: User Story 2 - Multi-file includes resolve correctly (Priority: P1)

**Goal**: `include::` (nested, with `tags=`/`lines=`/leveloffset filters) resolve into the PDF
exactly as the reference build places them.

**Independent Test**: Export a doc including files via tag + line-range filters; PDF contains exactly
the selected content in correct order and nesting.

- [X] T025 [US2] Implement the include-resolve pipeline stage `packages/asciidoc-pdf/src/pipeline/stages/include-resolve.ts` against the **injected `IncludeAssembler` port** (see T048) + `@asciidocollab/asciidoc-core` (tags/lines/leveloffset, conditional gating, cycle guard); write the expanded document into `/project` so Ruby sees one local doc. **MUST NOT import from `apps/web`** (Architecture Constitution Blocking rule 9); the concrete assembler is supplied by the web worker at the composition root.
- [X] T026 [US2] Handle unresolved and remote includes → `unresolved-include` / `remote-skipped` diagnostics (clear, located; never silent omission) — spec FR-004 + edge cases / Principle IX/X.
- [X] T027 [US2] Add reference-parity fixture + comparison test `apps/web/e2e/pdf-parity/fixtures/includes/` (nested includes + tag + line-range + leveloffset) verifying placement/order parity and 100% include resolution — Principle XV / SC-002.

**Checkpoint**: Multi-file specifications export faithfully.

---

## Phase 5: User Story 3 - Live PDF preview while editing (Priority: P2)

**Goal**: A live PDF preview updates as the document changes without freezing the editor.

**Independent Test**: Open the preview, edit rapidly; the preview updates within budget while the
editor stays fully interactive.

- [X] T028 [US3] Implement `apps/web/src/hooks/use-pdf-preview.ts` (debounce/coalesce, `requestId` staleness, warm-VM reuse, `changedPaths` delta) mirroring `use-asciidoc-preview.ts`.
- [X] T029 [P] [US3] Implement `apps/web/src/components/pdf-preview-panel.tsx` (pdf.js render to canvas/iframe; design-token chrome; never blocks the main thread) — Principles V/VI/XIII.
- [X] T030 [US3] Implement the warm re-render delta path (only `changedPaths` rewritten in `/project`; invalidate only affected `.gen` assets) across `orchestrator.ts` + `populate.ts` — Principles XII/XIII.
- [X] T031 [US3] Wire the preview panel toggle into `project-editor-layout.tsx`, guaranteeing the editor thread is never blocked during rendering.
- [X] T032 [US3] Add a non-blocking-responsiveness e2e test `apps/web/e2e/pdf-preview-responsive.spec.ts` (rapid edits; main thread interactive throughout; preview reflects the change) — SC-004.

**Checkpoint**: Live preview responsive; US1/US2 unaffected.

---

## Phase 6: User Story 4 - Diagrams, math, citations & highlighted code (Priority: P2)

**Goal**: Text-described diagrams, math, and BibTeX citations render in the reference style, and code
blocks are syntax-highlighted.

**Independent Test**: Export a doc with a diagram, a math expression, a citation + bibliography, and a
code block; each renders matching the reference build.

- [X] T033 [US4] Add browser-shim dependencies in `apps/web/package.json` (`mermaid`, `@hpcc-js/wasm`, `vega`, `vega-lite`, MathJax, `@citation-js/core` + BibTeX + CSL plugins).
- [X] T034 [P] [US4] Implement diagram shims `apps/web/src/workers/shims/{mermaid,graphviz,vega}.ts` implementing `RenderShim` (SVG-first; mermaid `htmlLabels:false` + `securityLevel:'strict'`; vega remote-data disabled; inert source) per contracts/shim-interface.md + research R3 / Principle IX.
- [X] T035 [P] [US4] Implement math shim `apps/web/src/workers/shims/mathjax.ts` (SVG output, no external resource fetch).
- [X] T036 [P] [US4] Implement citations shim `apps/web/src/workers/shims/citation-js.ts` (parse `.bib` once; rewrite `cite:`/`citenp:`/`bibitem:`/`bibliography::` → formatted AsciiDoc with anchors/back-links; match CSL style + appearance-vs-alphabetical ordering) per research R4.
- [X] T037 [US4] Implement the diagrams-math pipeline stage `packages/asciidoc-pdf/src/pipeline/stages/diagrams-math.ts` (render via injected shims → content-addressed `/project/.gen`, rewrite blocks to `image::`; PlantUML/ditaa → `diagram-unsupported` skip+warn) per research R3/R7.
- [X] T038 [US4] Implement the citations pipeline stage `packages/asciidoc-pdf/src/pipeline/stages/citations.ts` (batch rewrite via the citations shim; malformed source → `malformed-citation` diagnostic).
- [X] T039 [US4] Implement prawn-svg raster-fallback detection in `apps/web/src/workers/shims/prawn-svg-guard.ts` (unsupported-feature check → PNG at print DPI via offscreen canvas, record `rasterFallback` diagnostic) per research R3.
- [X] T040 [US4] Verify source-code syntax highlighting via `source-highlighter: rouge` in the convert path with a code fixture — spec FR-006 / SC-006.
- [X] T041 [US4] Add reference-parity fixtures + comparison tests `apps/web/e2e/pdf-parity/fixtures/{diagrams,math,citations,code}/` (mermaid/graphviz/vega; MathJax; cite/citenp/bibitem/bibliography with numeric + author-date CSL and appearance + alphabetical ordering; highlighted code) — Principle XV; **citations are the highest fidelity risk** (research R4).

**Checkpoint**: Rich content renders at parity; all four stories complete.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T042 [P] Malformed/exotic-input resilience: handle malformed diagram/math/citation, unsupported/exotic image formats, and missing-glyph/font-unavailable → localized diagnostics with the rest of the document still exporting (tests in `apps/web/tests/` + `packages/asciidoc-pdf/tests/`) — spec edge cases / SC-005. Also assert **shared-content immutability (Principle VII)**: pre-processing (include inlining, `.gen` assets, citation rewrite) writes **only** to the in-memory VFS and never mutates the `ProjectSnapshot`, project source, or Yjs.
- [X] T043 [P] Measure and record built-wasm size (brotli), cold-start ms, warm re-render ms, and cache-hit rate on the reference project into `quickstart.md` + plan Performance Goals (research R2), and **pin the concrete SC-004 preview-latency target** (the numeric budget the spec deferred) so it becomes assertable.
- [X] T044 Determinism verification test: identical inputs → byte-stable PDF (or within the defined tolerance) across fixtures (`apps/web/e2e/pdf-parity/`) — Principle XII.
- [X] T045 [P] Author `packages/asciidoc-pdf/README.md`: building/re-syncing the wasm (pinned Gemfile) and adding parity fixtures — Principle IV re-syncability.
- [X] T046 Verify implementation carries no residual server-sidecar assumptions for PDF generation; the architecture-constitution Technology Mandate amendment (Ruby-sidecar → also client-side ruby.wasm) is already landed in `.specify/memory/architecture_constitution.md` v2.5.0.

### Architecture-Guard Refactors (non-blocking — from architecture-migration-plan.md)

- [X] T047 [P] Introduce a typed wasm/WASI bridge adapter `packages/asciidoc-pdf/src/vm/wasi-bridge.ts` that wraps `@ruby/wasm-wasi` + `@bjorn3/browser_wasi_shim` behind a narrow fully-typed interface; contain all unavoidable casts there so no `any`/`as` appears in production code elsewhere (Architecture Constitution Blocking rules 5 & 6). **Gates T008/T012/T014.** [Refactor P1]
- [X] T048 Extract an environment-agnostic include-assembly primitive + define the `IncludeAssembler` port so `packages/asciidoc-pdf` never imports `apps/web` (per `architecture-migration-plan.md`, target A/B); the web PDF worker supplies the concrete assembler at the composition root, and the existing HTML preview keeps working on the shared primitive. **Gates T025.** [Refactor P1]
- [X] T049 [P] Add a mechanical import-boundary assertion (fresh-onion / lint) enforcing Architecture Constitution Blocking rule 9 — fail if `packages/asciidoc-pdf` imports from `apps/*`, or if `domain`/`application`/`infrastructure` import `@asciidocollab/asciidoc-pdf`. [Refactor P2]

- [X] T050 Run the full quality-gate sweep (`pnpm gate`: lint, typecheck, unit + integration + security scan + e2e) then `/code-review` in a loop until zero findings — Constitution §End-of-Feature Verification. **Runs last, after all refactors.**

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (P1)**: no dependencies. T001 before T002–T006; T003 (build) before T005 (vendor).
- **Foundational (P2)**: after Setup. Blocks ALL user stories. T007 (protocol) before T008–T016; T008/T009 before T012/T014; T011 before all pipeline stages; T016 harness before any parity fixture.
- **User Stories (P3–P6)**: after Foundational. US1 & US2 (both P1) first; US3 & US4 (P2) after. Stories are independently testable; if staffed in parallel, US2/US3/US4 each depend only on Foundational (US2 reuses `assembleIncludes`; US4 reuses the shim/cache seams).
- **Polish (P7)**: after all targeted stories. Architecture-Guard refactors (T047–T049) land during/
  before the phases they gate (see below); **T050 (final gate) runs last**.

### Architecture-Guard refactor gating (non-blocking, from architecture-migration-plan.md)

- **T047** (typed wasi-bridge adapter) gates **T008/T012/T014** — introduce the adapter before the
  VM/convert/worker code programs against the untyped libraries, so no `any`/`as` spreads.
- **T048** (IncludeAssembler port + shared primitive) gates **T025** — the port must exist before the
  include-resolve stage, so `packages/asciidoc-pdf` never imports `apps/web` (Blocking rule 9).
- **T049** (import-boundary assertion) can land any time after T001; best alongside T048.

### Story dependencies

- **US1 (P1)** — MVP: needs only Foundational.
- **US2 (P1)**: needs Foundational; independent of US1 (adds the include-resolve stage).
- **US3 (P2)**: needs Foundational; reuses US1's export path but is independently testable (preview vs download).
- **US4 (P2)**: needs Foundational; adds shims + two pipeline stages; independent of US1–US3.

### Governance

- The architecture-mandate amendment is **already landed** (`architecture_constitution.md` v2.5.0); **T046** is a verification checkpoint that no server-sidecar assumption leaks into implementation.

---

## Parallel Opportunities

- **Setup**: T002, T004, T006 in parallel after T001; T003→T005 sequential.
- **Foundational**: T007, T010, T013 in parallel; T008/T009/T011/T012/T014/T015/T016 as their inputs land.
- **US1**: T020 (button) ∥ backend tasks; T017/T018 (package) ∥ T019 (hook).
- **US4**: T034, T035, T036 (three shim families) fully parallel; T037/T038 depend on them.
- **Cross-story** (if staffed): US2, US3, US4 proceed in parallel once Foundational is done.

## Parallel Example: User Story 4

```bash
# Shim families are independent files — run together:
Task: "Implement diagram shims apps/web/src/workers/shims/{mermaid,graphviz,vega}.ts"   # T034
Task: "Implement math shim apps/web/src/workers/shims/mathjax.ts"                        # T035
Task: "Implement citations shim apps/web/src/workers/shims/citation-js.ts"              # T036
```

---

## Implementation Strategy

### MVP first (User Story 1 only)

1. Phase 1 Setup → 2. Phase 2 Foundational (CRITICAL) → 3. Phase 3 US1 → **STOP & VALIDATE**: export
a themed project, confirm reference parity + zero egress → demo.

### Incremental delivery

Foundation → US1 (MVP: faithful export) → US2 (includes) → US3 (live preview) → US4 (diagrams/math/
citations/code). Each story is a parity-verified increment that doesn't break the previous ones.

---

## Notes

- Each task = one `/tdd` invocation; tests-first within the task, never a separate test task.
- The verification-oriented tasks (T023 no-egress, T032 responsiveness, T044 determinism, and the
  parity fixtures T024/T027/T041) are **distinct verification deliverables** (security / e2e /
  determinism / reference-parity mandated by Principles X, XIII, XII, XI/XV) — NOT the split
  "test half" of another task's `/tdd` cycle, so they do not violate Implementation Discipline.
- Fidelity-critical tasks (T024, T027, T032, T040, T041, T044) verify against the reference corpus —
  Principle XV: not done until the comparison test passes. Each parity fixture MUST record the
  element-level **tolerance** it uses (research R5), so parity is reproducible and reviewable.
- Principles X (no egress) and XI (reference parity) are NON-NEGOTIABLE — resolve any tension in
  their favor, never by exception.
- Commit only after green (Constitution §Commit Discipline).
- No `apps/api` / database / domain-ring changes in v1.
