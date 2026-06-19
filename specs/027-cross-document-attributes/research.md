# Phase 0 Research: Cross-Document Attribute Resolution & Editor State Memory

This consolidates the technical decisions for the feature. Each entry: **Decision / Rationale / Alternatives**. There are no remaining `NEEDS CLARIFICATION` items — the spec's five clarification sessions resolved product questions; the items below resolve implementation approach against the actual codebase.

## R1 — Cross-document attribute resolution reuses the existing include-graph model

**Decision**: Extend `apps/web/src/lib/asciidoc/extraction.ts` (`buildIncludeGraphWithInheritance`, `inheritedAttributes`, `inheritedLevelOffset`) and its domain mirror `packages/domain/src/services/asciidoc-extraction.ts` rather than building a new resolver. The model already walks the include tree in document order, accumulates attributes (last-wins), snapshots each file's inherited attributes at its **first** include, is cycle-guarded, and computes inherited level offset — exactly the spec's resolution model (FR-001..FR-004, FR-002a/b, US2).

**Rationale**: The hard part (document-order walk, first-visit inheritance snapshot, cycle guard, `{attr}` substitution in values/targets) is already implemented and tested. The spec's clarified semantics (first-include-point context; root = main file; standalone when no root) map directly onto the existing `inheritedAttributes` map and `rootFileId` parameter.

**Gaps to add**: `:!name:` unset propagation; inline `{set:name:value}` / `{set:name!}` as document-order events; wrapping (multi-line `\`-continued) attribute values; precedence for locked/fixed attributes. These extend `documentOrderEvents` and the value accumulator.

**Alternatives**: A standalone new resolver (rejected — duplicates a tested asset, risks drift, violates Reuse IV); rely solely on Asciidoctor (rejected — the editor needs the resolved scope without a render round-trip, and the worker has no filesystem).

## R2 — Preview correctness via seeding Asciidoctor with inherited attributes + leveloffset

**Decision**: In `asciidoc-render.worker.ts`, when rendering a non-root open file, seed the Asciidoctor `attributes` option with the file's resolved **inherited attributes** (from R1) and prepend the resolved `:leveloffset:`. Let Asciidoctor.js's native engine then produce correct automatic IDs (`idprefix`/`idseparator`), cross-reference text (`xrefstyle`), captions/labels/signifiers, section numbers (`sectnums`/`sectnumlevels`), and TOC (`toc`/`toclevels`).

**Rationale**: These are all native Asciidoctor behaviors that "just work" once the document attribute state is correct at parse time. We do not re-implement ID generation, xref styling, captions, or numbering — we make the inputs correct. This satisfies FR-011..FR-019a, FR-037..FR-039 with minimal new code and maximal fidelity (Reuse IV).

**Caveat**: Asciidoctor processes the document it is given; because the worker pre-assembles includes (no FS), the seeded attributes represent the inherited context, and assembled child content carries forward its own definitions. Attribute precedence (API-seeded vs in-document) must be set so in-document definitions can still override seeds where AsciiDoc allows (use non-locked seeding).

**Alternatives**: Post-process the HTML to fix IDs/xref/captions (rejected — fragile, re-implements engine behavior); render the whole root always (rejected by spec clarification — preview is the open file only, FR-002c).

## R3 — Conditional directives (`ifdef`/`ifndef`/`ifeval`)

**Decision**: Split responsibility. (a) **Include-gating** conditionals (a conditional wrapping an `include::`) are evaluated in `assemble-includes.ts` using the resolved attribute state and a **minimal, non-`eval` evaluator** (presence tests for ifdef/ifndef; a restricted comparison grammar for ifeval matching Asciidoctor's operators). (b) **Content-level** conditionals are left to Asciidoctor's own built-in preprocessor, which runs safely on the assembled source with seeded attributes. Satisfies FR-029..FR-031.

**Rationale**: Asciidoctor already evaluates ifdef/ifeval safely on content it parses; the only thing it cannot do is decide whether to *pull in* an include (the worker resolves includes itself). So the assembler must understand conditionals just enough to gate includes. Avoiding `eval` satisfies Constitution IX.

**Alternatives**: Evaluate all conditionals in the assembler (rejected — duplicates Asciidoctor's evaluator); use `eval`/`Function` for ifeval (rejected — security boundary IX).

## R4 — Partial includes (`tags=` / `lines=`)

**Decision**: Extend `assemble-includes.ts` to parse `tags=`/`lines=` from the include directive and slice the child content before insertion, honoring AsciiDoc tag semantics (multiple, `!neg`, `*`/`**` wildcards) and line ranges (single/multiple/open-ended). Apply `leveloffset` and attribute resolution to the **sliced** result. Source-line mapping for retained lines must be preserved for scroll-sync. Satisfies FR-033..FR-036.

**Rationale**: The assembler is the single place includes are expanded; tag/line filtering belongs there. Tag markers (`// tag::name[]` / `// end::name[]`) are comments already recognized by the verbatim scanner.

**Alternatives**: Let Asciidoctor do tag/line filtering (rejected — it would need filesystem access the worker deliberately denies).

## R5 — STEM math rendering library

**Decision**: Render STEM **client-side** in the preview component with **MathJax 3**, self-hosted (bundled, no CDN), lazy-loaded on first math-bearing preview. Configure MathJax with both TeX (`\(...\)`, `\[...\]`) and AsciiMath input so the single dependency covers both notations the spec requires.

**Rationale**: The spec mandates both AsciiMath and LaTeX rendered client-side from a bundled library (clarified). MathJax 3 supports **both** input notations out of the box in one maintained package (Reuse IV), whereas KaTeX renders only TeX and would require an additional AsciiMath→TeX converter (two deps + custom wiring). Asciidoctor emits stem with delimiters MathJax recognizes. MathJax can be lazy-loaded so the bundle cost is paid only when math is present.

**Alternatives**: **KaTeX + asciimath2tex** (faster, smaller, but needs an extra converter and custom glue for the dual-notation requirement; reconsider only if MathJax bundle size proves unacceptable); external CDN/MathJax service (rejected — spec forbids external/network); server-side rendering (rejected — spec requires frontend rendering).

**Security (IX) & isolation (VI)**: MathJax renders from already-sanitized text content within the scoped preview container; its CSS is scoped like the vendored Asciidoctor stylesheet (build-time scoping) so it cannot restyle app chrome; the post-render container continues through DOMPurify. Math source is inert (never executed).

## R6 — Editor cross-document attribute highlighting

**Decision**: Feed the resolved cross-file attribute set (from R1, via `use-project-symbol-index.ts`) into a new CodeMirror facet/decoration (`cross-doc-attributes.ts`) so `{name}` references that resolve to a definition in a parent/ancestor or included file are highlighted as known. Re-resolution is driven by the existing symbol-index updates (live, FR-007a). Satisfies FR-020, US6.

**Rationale**: The symbol index already computes cross-file symbols using the include graph; highlighting just needs to consume the resolved attribute set for the open file's inherited context.

**Alternatives**: Highlight only local definitions (current behavior — rejected by spec).

## R7 — Editor highlighting fidelity (constrained rules, role spans, xref label, table cols, dimming)

**Decision**: Extend the in-repo Lezer grammar (`asciidoc.grammar`) and external block tokenizer. (a) **Constrained/unconstrained** correctness requires boundary-aware inline tokenization (lookbehind) — implement via the external tokenizer as the existing grammar comment anticipates. (b) **Role spans** `[.role]#...#` get a dedicated inline token; an extensible **inline-style registry** (`inline-style-registry.ts`) gives registered roles distinct emphasis while any role is highlighted generically (FR-021b/c). (c) **Xref target vs label** and (d) **table `cols`** get distinct sub-tokens. (e) **Inactive conditional branches** are dimmed live via a CodeMirror decoration (`conditional-dimming.ts`) driven by the resolved attribute state (FR-032, clarified = inline dimming). Satisfies FR-021a/b/c, FR-032, FR-042, FR-044..FR-046.

**Rationale**: No vendorable Lezer AsciiDoc grammar exists; extending the first-party grammar is the constitution-sanctioned path (IV, clarified). Boundary correctness is a known, scoped tokenizer rework.

**Alternatives**: Pragmatic heuristic for constrained rules (rejected by clarification — full correctness chosen); registry-only role highlighting (rejected — must also highlight unknown roles generically).

## R8 — Per-file, per-user cursor memory

**Decision**: Extend the existing per-user `localStorage` store (`use-last-selection.ts`, which already persists a single `{nodeId, …, line}`) into a **per-file map** keyed by file node id, scoped by `userId:projectId`. On opening a file, restore its remembered line (clamped to the nearest valid line); default to top when none. Satisfies FR-022..FR-027.

**Rationale**: The pattern, validation, and per-user/per-browser key scheme already exist and are tested; growing one entry to a map is the smallest correct change and keeps cursor position as a personal preference (Constitution VII).

**Deviation from spec assumption (recorded)**: The spec's Assumptions say cursor positions are persisted **server-side / cross-device**. The established project mechanism is **per-user `localStorage` (per-browser)**, and Constitution VII treats per-user editor state as a personal preference stored against the user, not shared content. **Resolution**: implement per-browser `localStorage` (matching the existing pattern); this satisfies all functional requirements (per-user, per-file, across sessions on the same browser) but not cross-device. If cross-device is later required, a server-backed `UserEditorState` model can be added without changing the hook's interface. This deviation is intentional and low-risk; the spec assumption should be read as "across sessions for the same user on the same browser."

**Alternatives**: New Prisma `UserEditorState` table for cross-device (deferred — larger surface, API + migration, not required by any FR; revisit if requested).

## R9 — Keeping the editor and domain extraction copies in sync

**Decision**: All resolution-rule changes (unset, `{set:}`, wrapping values, precedence) are made in **both** `apps/web/src/lib/asciidoc/extraction.ts` and `packages/domain/src/services/asciidoc-extraction.ts`, with shared DTO shapes in `packages/shared`. A unit test asserts parity on a shared fixture corpus.

**Rationale**: The files are documented mirrors (client live-buffer copy vs authoritative server copy); drift would cause editor/preview disagreement (FR-006).

**Alternatives**: Extract a shared package for the rules (attractive but larger refactor; note as possible follow-up, not required here).

## R11 — Editor section outline stays consistent with cross-document resolution

**Decision**: Treat the editor **section outline** (`asciidoc-outline.ts`, fed by the single authority `computeHeadingLevels` in `asciidoc-heading-levels.ts`, with `inheritedHeadingOffsetFacet` + `refreshHeadingLevelsEffect`) as a first-class consumer of the resolution model. Specifically:
- **Effective levels**: the outline already shifts levels by `:leveloffset:` and the inherited offset facet. Extend so the facet is updated (and `refreshHeadingLevelsEffect` dispatched) whenever the include structure or the project main-file setting changes (FR-007a/FR-007b), so reopening/recomputing yields the correct effective levels for a non-root file (US2).
- **Resolved titles**: a heading like `== {productName} Guide` MUST show the resolved value in the outline, using the file's resolved cross-document attribute scope (R1/R6). Today the outline shows the raw `{attr}`. This keeps the outline consistent with the rendered preview.
- **Conditional branches**: headings inside a branch that resolves to **inactive** for the current attribute state MUST be excluded from (or visibly marked in) the outline, consistent with the inline dimming (FR-032) and with what the preview will actually render.
- **Single authority preserved**: all level logic stays in `computeHeadingLevels`; the outline, heading highlight, and section folding continue to derive from it (no duplicate level logic).

**Rationale**: The outline is the editor's structural view; if it ignored cross-document offsets, resolved titles, or conditionals it would disagree with the preview and mislead navigation — the same class of bug this feature fixes for rendering. The existing facet/refresh-effect machinery (built for FR-071) is the seam to extend, so the change is incremental and keeps one source of truth.

**Scope note**: This is the **editor** outline panel. The **rendered preview TOC** (`:toc:`/`:toclevels:`) is a separate, native-Asciidoctor concern already covered by R2/FR-037–039; both must agree because both derive from the same resolved attribute state and effective heading levels.

**Testing**: unit tests for `computeHeadingLevels`/outline extraction (resolved titles, offset, inactive-branch exclusion); cross-file e2e asserting the outline panel reflects inherited `leveloffset` and resolved titles after opening a non-root file and after changing the main-file setting (this is cross-file behavior → e2e required per R10).

**Alternatives**: Leave the outline raw/level-only (rejected — diverges from preview, defeats the feature's consistency goal); compute a second, outline-specific level model (rejected — violates the single-authority design and risks drift).

## R10 — Testing strategy (per user directive)

**Decision**:
- **Unit (Jest) — every feature**: pure resolution functions with in-memory `readContent`/`resolveInclude` fakes (R1, conditionals, tag/line slicing, `{set:}`, wrapping, unset, precedence); render-worker output assertions (seeded attributes → correct IDs/xref/captions/numbering, conditionals, partial includes, math delimiters emitted); editor tokenizer/highlight tests (constrained rules, role spans, xref label, cols, dimming decision); cursor-memory store (per-file map, clamp, isolation); MathJax integration unit (delimiters → rendered nodes, sanitization preserved).
- **E2E (Playwright) — every feature that affects other files**: parent/child attribute resolution in preview; `leveloffset` across files; `idprefix`/`idseparator` and `xrefstyle` from parent/included files; caption/label family from a parent; conditionals gated on a parent/included attribute (incl. gating an include); partial includes (`tags`/`lines`); `sectnums`/`toc` across includes; cross-file attribute highlighting in the editor; live re-resolution when an include/attribute/main-file setting changes; multi-file cursor-memory navigation. Single-file-only behaviors (inline-style highlighting within a file, STEM within one file, constrained-formatting highlighting, table-cols/xref-label highlighting) are covered by unit/component tests and need e2e only where they cross files.

**Rationale**: Matches the user directive exactly and Constitution II (functional TDD, red-green; no performance tests since none requested). Cross-file behaviors are precisely the ones unit tests cover least faithfully (real include graph, real Asciidoctor, real DOM), so e2e is warranted there.

**Existing harness**: `apps/web/e2e` already has a Playwright suite (auth, collab, preview) and `docker-compose.e2e.yml`; new specs slot into the established `project-preview`/editor e2e patterns.
