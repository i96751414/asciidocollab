# Phase 0 Research: In-Browser PDF Export

All open technical questions from the plan's Technical Context and the feature input are resolved
here. Spec clarifications (2026-07-11) already fixed three product decisions that constrain this
research: **fidelity bar = element-level parity**, **fully offline (remote unsupported in v1)**,
**diagrams + math both in v1**.

---

## R1 — asciidoctor-pdf dependency closure is sandbox-safe on ruby.wasm

**Decision**: Ship a **pinned Gemfile** built with `rbwasm` (ruby.wasm builder image) containing only
pure-Ruby, sandbox-safe gems: `asciidoctor`, `asciidoctor-pdf`, `prawn`, `prawn-svg`,
`prawn-templates`, `rouge`, `text-hyphen`, `hexapdf`, `js`. Exclude/replace native transitive gems.
Lock the closure in CI and fail the build if any native extension (`*.so`/C ext) enters the tree.

**Rationale**: Principle XIV requires everything run inside the WASI sandbox — no subprocess, no
socket, no native extension. The engine must be the *real* Asciidoctor-PDF gem (Principle XI/IV), so
the only viable path is compiling CRuby + these gems to `wasm32-wasip1`.

**Key native/transitive risks to resolve at build time**:
- `bigdecimal` — native default gem; excluded per input. Confirm no gem in the closure hard-requires
  it at runtime (Prawn's number handling paths); if reached, pin a pure-Ruby shim or a codepath that
  avoids it.
- `hexapdf` pulls `geom2d` (pure Ruby, ok) and uses `zlib` — provided by ruby.wasm's baked stdlib
  (`zlib` is available in the wasip1 build). Confirm `Zlib` loads in-wasm; if not, gate hexapdf
  optimize behind a capability check and skip optimization (non-fatal) rather than fail export.
- `ttfunk`/`prawn` font handling — pure Ruby, ok.
- `unicode`/`hyphen` (`text-hyphen` is pure Ruby with bundled dictionaries, ok).

**Alternatives considered**: (a) asciidoctor.js/Opal + a JS PDF lib — rejected: not the real gem, no
parity (Principle XI), and repo memory notes Opal-based Asciidoctor can't run faithfully under the
test runner. (b) Server sidecar — rejected: violates NON-NEGOTIABLE Principle X.

**Build reproducibility**: `Gemfile.lock` + pinned ruby.wasm version + `rbwasm` in CI = re-syncable,
verbatim-vendored artifact (Principle IV). Never hand-edit the `.wasm`.

---

## R2 — Wasm size, cold-start budget, caching strategy

**Decision**: Serve a single same-origin `asciidoctor-pdf.wasm` (Ruby stdlib + gems baked under
`/usr` via `wasi-vfs`) from `apps/web/public/vendor/asciidoctor-pdf/`, built by a
`build:asciidoctor-pdf-wasm` script wired into `predev`/`prebuild` (mirrors
`build-mathjax-assets.mjs`). Cache with the **Cache API + `immutable`, content-hashed filename**;
require **brotli/gzip** transfer encoding. Instantiate the VM **once per session** (warm VM);
subsequent renders reuse it. Cold start sits behind a spinner; measure actual size + cold-start on
the reference project during implementation and record the budget in quickstart.

**Rationale**: Tens-of-MB binary → transfer + compile dominates cold start; immutable content-hashed
caching makes it a one-time cost. Warm VM + per-render `/project` overwrite (only changed files)
keeps steady-state renders fast (Principle XIII).

**Cross-origin isolation**: Use the **single-threaded** ruby.wasm build → no `SharedArrayBuffer`,
therefore **no COOP/COEP headers needed**. This avoids cross-origin-isolating the whole app (which
would break the existing same-origin MathJax/worker assets). Confirm `@ruby/wasm-wasi` +
`@bjorn3/browser_wasi_shim` operate without threads. If a future threaded build is wanted, COOP/COEP
would become a separate, isolated decision.

**Alternatives considered**: Splitting stdlib into a separate fetch (dynamic-linking) — more
complexity, marginal benefit given immutable caching; deferred.

---

## R3 — prawn-svg SVG subset vs shim output; where rasterization is mandatory

**Decision**: Emit **prawn-svg-friendly SVG** from every shim, and provide a **PNG rasterization
fallback** (offscreen canvas) for constructs prawn-svg cannot draw cleanly. Concretely:
- **mermaid**: `htmlLabels:false` (+ `flowchart.htmlLabels:false`) so labels are real `<text>`, not
  `<foreignObject>` (prawn-svg cannot render foreignObject). `securityLevel:'strict'`.
- **Graphviz (@hpcc-js/wasm)**: SVG output is largely prawn-svg-safe; rasterize only if gradients/
  patterns appear.
- **vega/vega-lite**: prefer vega's **SVG** renderer; rasterize when the spec uses clip-paths,
  filters, or gradients unsupported by prawn-svg.
- **MathJax (SVG output)**: MathJax SVG uses `<use>`/paths that prawn-svg mostly supports; keep a
  raster fallback for edge glyphs.

**Rasterization-mandatory triggers** (documented rule): `foreignObject`, CSS `filter`, unsupported
gradient/pattern types, `clipPath` beyond rect, or any SVG feature on prawn-svg's unsupported list.
The orchestrator attempts SVG first, validates against a known-unsupported-feature check, and falls
back to PNG (at a DPI chosen for print fidelity) when triggered — recording a diagnostic (not an
error) so parity reviewers can see which assets were rasterized.

**Rationale**: SVG keeps vector crispness and smaller output where possible (parity + determinism);
raster fallback guarantees the block still renders (spec FR-012 "never fail the whole export").

---

## R4 — citation-js parity with asciidoctor-bibtex macro semantics

**Decision**: Pre-process citations **before** the Ruby convert: parse the project `.bib` once with
`@citation-js/core` (+ BibTeX + CSL plugins) and rewrite `cite:`/`citenp:`/`bibitem:`/
`bibliography::` into formatted AsciiDoc (inline-macro output + a generated reference list) with
stable anchors and back-links. Match the project's **CSL style** and the **ordering mode**
(appearance vs alphabetical) that asciidoctor-bibtex would produce.

**Rationale**: `asciidoctor-bibtex` (the reference toolchain's citation path) is itself a Ruby gem,
but its dependency closure (`bibtex-ruby`, `citeproc-ruby`, `csl`) risks native deps and is heavier
to validate in-wasm; citation-js is a maintained, sandbox-safe browser library covering BibTeX + CSL.

**This is the single highest fidelity risk (Principle XI).** Mitigations:
- Treat citation formatting as a **first-class parity fixture set** (cite/citenp/bibitem/
  bibliography, numeric vs author-date CSL, appearance vs alphabetical ordering, back-links) —
  Principle XV requires comparison tests here.
- If citation-js output diverges from asciidoctor-bibtex on a construct, that divergence is a defect
  to fix in the rewriter (Principle XI: reference is correct), not a new baseline.

**Alternative kept in reserve**: If citation-js parity proves insufficient, evaluate running
`asciidoctor-bibtex` inside the same wasm VM (subject to R1 sandbox-safety). Documented, not chosen
for v1.

---

## R5 — Reference-parity harness (diff method + tolerance)

**Decision**: Build a **visual reference-parity harness** (net-new; no snapshot infra exists):
1. Fixture projects (theme + fonts + includes + diagrams + math + citations) live under
   `apps/web/e2e/pdf-parity/fixtures/`, each with a **committed reference PDF** produced by the
   external Asciidoctor-PDF CLI/Maven build (the team-maintained corpus, per spec SC-001).
2. The harness runs the in-app pipeline (Playwright, real browser — shims need DOM), exports the
   PDF, rasterizes both in-app and reference PDFs page-by-page (pdf.js → canvas), and diffs with
   `pixelmatch` (or `odiff`) at a **defined per-project tolerance** (element-level parity, not pixel-
   identical — spec fidelity bar). Diffs over tolerance fail the test and emit a diff image.

**Rationale**: Principles XI and XV require *verified* parity. Element-level tolerance matches the
spec's fidelity bar and absorbs sub-pixel antialiasing/rasterizer differences without hiding real
layout/font/color divergence.

**Determinism dependency** (see R6): the harness is only meaningful if in-app output is
reproducible; normalize non-deterministic PDF metadata before diffing.

**Alternatives considered**: Text/structural PDF diffing (pdftotext) — catches content but not
appearance (fonts/spacing/color), so insufficient for the fidelity bar; may be added as a fast pre-
check.

---

## R6 — Determinism / reproducibility (Principle XII)

**Decision**: Make PDF output byte-stable for identical inputs by neutralizing ambient state:
- Set a fixed `SOURCE_DATE_EPOCH` (or post-process) so `/CreationDate`, `/ModDate` and the document
  `/ID` are constant; strip other timestamp/producer-nondeterminism.
- **Content-address** every generated asset (diagram/math SVG-or-PNG, prefetched—here skipped—
  images, formatted bibliography) by a hash of its source + render params; identical source → identical
  asset bytes → cache hit and stable placement.
- Ensure font subsetting (ttfunk) and hyphenation are order-stable; avoid locale/`Time.now`
  dependence in any pre-processing.

**Rationale**: Reproducibility underpins both the parity harness (R5) and the keystroke-level cache.
Where byte-stability is impractical (e.g. rasterizer variance across browsers), fall back to the
**defined visual tolerance** used consistently by R5.

---

## R7 — PlantUML / ditaa

**Decision**: **Out of scope for v1.** These have no clean client-side engine and would require a
remote Kroki endpoint. The spec resolved remote-resource handling to **fully offline** (Principle
X), so any Kroki/remote path is excluded. PlantUML/ditaa diagram blocks are **warned-and-skipped**
(spec FR-012) with a clear diagnostic naming the block and the reason. **v1 diagram engines:
mermaid, Graphviz, vega/vega-lite** (all client-side). Revisit if/when a remote-resource increment
with explicit consent + allowlist is specified (Principle X governance).

**Rationale**: Directly follows the spec clarification; keeps v1 within the non-negotiable no-egress
boundary without an exception.

---

## R8 — Fonts

**Decision**: TTF/OTF only (ttfunk constraint). Convert any project WOFF2 fonts → TTF **at build/
mount time** (client-side conversion in the worker or a build step for baked theme fonts). Default
theme fonts are **baked into the wasm** `/usr` tree; only **custom project fonts** are mounted into
`/project` at runtime from the ProjectSnapshot. Missing-glyph/unavailable-font conditions raise a
warning (spec edge case) and fall back predictably.

**Rationale**: prawn/ttfunk cannot consume WOFF2; baking defaults keeps the common case zero-mount
and fast, while custom fonts follow the same VFS-mount path as images.

---

## R9 — Remote images / includes (offline enforcement)

**Decision**: The pipeline's "remote-image prefetch" and "remote-include resolution" stages become
**offline guards** in v1: any `include::`/`image::` target that resolves to a remote URL (or escapes
the sandbox) is **rejected by the reused `resolveSandboxedPath`** and **warned-and-skipped**; only
sandbox-local project resources are mounted into `/project`. No fetch, no proxy, no URL leaves the
client (Principle X + IX).

**Rationale**: Enforces the spec's fully-offline decision at the exact seam the input pipeline
described for remote fetching, converting it from a fetch stage into a fail-closed skip stage.

---

## Summary of resolved unknowns

| # | Question | Resolution |
|---|----------|-----------|
| R1 | Dependency sandbox-safety | Pinned pure-Ruby Gemfile; CI fails on native ext; exclude bigdecimal etc. |
| R2 | Wasm size / cold start / cache | Same-origin blob, Cache API immutable + brotli, warm VM, no COOP/COEP (single-threaded) |
| R3 | prawn-svg subset | SVG-first with mandatory PNG raster fallback on unsupported features; mermaid htmlLabels:false |
| R4 | citation-js parity | Pre-process with citation-js; highest fidelity risk → dedicated parity fixtures |
| R5 | Parity harness | Playwright + pdf.js rasterize + pixelmatch/odiff at element-level tolerance vs team fixtures |
| R6 | Determinism | Fixed SOURCE_DATE_EPOCH + content-addressed assets; else defined tolerance |
| R7 | PlantUML/ditaa | Out of v1 (needs remote Kroki); warned-and-skipped |
| R8 | Fonts | TTF/OTF only; WOFF2→TTF at build; defaults baked, custom mounted |
| R9 | Remote resources | Fail-closed skip via reused sandbox-path guard; no egress |

**No `NEEDS CLARIFICATION` remain.** Ready for Phase 1.
