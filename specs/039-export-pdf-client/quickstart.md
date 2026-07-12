# Quickstart: In-Browser PDF Export (feature 039)

How to build, run, and verify the client-side PDF export during development.

## Prerequisites

- Node 24 + pnpm (repo standard).
- Docker (only for the one-time wasm build — uses the ruby.wasm builder image; no runtime container).
- The feature is **fully offline** at runtime: no API/proxy needed for export.

## 1. Build the rendering wasm (one-time / on Gemfile change)

```bash
# builds packages/asciidoc-pdf/ruby/Gemfile → asciidoctor-pdf.wasm (stdlib+gems baked via wasi-vfs)
pnpm --filter @asciidocollab/asciidoc-pdf build:wasm
```

- Pinned by `packages/asciidoc-pdf/ruby/Gemfile.lock` + a pinned ruby.wasm version (re-syncable,
  Principle IV). CI runs this in a dedicated job and uploads the `.wasm` as an artifact.
- The build **fails** if any native gem extension enters the closure (Principle XIV / research R1).

## 2. Vendor the wasm same-origin (automatic in dev/build)

`apps/web` runs `build:asciidoctor-pdf-wasm` in `predev`/`prebuild` (mirrors the MathJax vendor
step), copying the blob to `apps/web/public/vendor/asciidoctor-pdf/` for same-origin, immutable-
cached serving.

```bash
pnpm --filter @asciidocollab/web dev   # predev vendors the wasm, then next dev
```

## 3. Export / preview in the editor

1. Open a project: `/dashboard/projects/<id>`.
2. **Export**: click **Export to PDF** (in `project-editor-layout`). First click warms the VM
   (spinner during cold start), then downloads `application/pdf`.
3. **Preview**: open the live PDF preview panel; edits re-render (debounced) without blocking typing.
4. Warnings (remote-skipped, unsupported image, missing glyph, malformed diagram/math/citation)
   surface per-resource; the rest of the document still exports (spec FR-012).

## 4. Run the tests

```bash
# Unit (orchestrator, cache-key, protocol, font selection) — in-memory fakes
pnpm --filter @asciidocollab/asciidoc-pdf test

# e2e + reference-parity harness (real browser; shims need DOM)
pnpm --filter @asciidocollab/web test:e2e -- pdf-parity
```

### Reference-parity harness (Principles XI & XV)

- Fixtures: `apps/web/e2e/pdf-parity/fixtures/<project>/` each with a **committed reference PDF**
  produced by the external Asciidoctor-PDF CLI/Maven build (team-maintained corpus, spec SC-001).
- The harness exports each fixture in-app, rasterizes in-app + reference PDFs (pdf.js → canvas), and
  diffs with pixelmatch/odiff at the project's **element-level tolerance**. Over-tolerance diffs fail
  and emit a diff image.
- **Determinism first** (research R6): if a fixture is flaky, check `SOURCE_DATE_EPOCH`/`/ID`
  normalization before adjusting tolerance.

## 5. Regenerating reference fixtures

When the reference toolchain changes, regenerate the reference PDFs with the external CLI/Maven build
and re-commit them. In-app output must then be brought back to parity (Principle XI: the reference is
correct; divergence is a defect to fix in-app, not a tolerance to loosen).

## Budgets to record during implementation

- Built wasm size (gzip/brotli) and cold-start ms on the reference project (research R2).
- Warm re-render ms and cache-hit rate for keystroke-level edits.
- These populate the plan's Performance Goals (the spec deferred hard numbers).

## Measured performance (reference doc)

Captured by the headless engine harness `packages/asciidoc-pdf/tests/integration/engine-smoke.mjs`
(run it directly, or via the gated test `engine.integration.test.ts` — both skip when the wasm is
absent). The reference document is a two-language highlighted-source doc (`[source,ruby]` +
`[source,js]`, `source-highlighter: rouge`). Numbers are a single-run capture on a developer machine
and vary run to run; treat them as reference magnitudes, not exact guarantees.

| Metric | Measured |
| --- | --- |
| Built wasm size (raw) | 71,615,348 B (~68.3 MiB) |
| Built wasm size (gzip) | ~24.1 MiB |
| Built wasm size (brotli q5) | ~19.0 MiB |
| Cold start (module compile + first warmup) | ~290 ms (compile ~50 ms + warmup ~240 ms) |
| First convert (cold render, first rouge load) | ~910 ms |
| Warm re-convert (same input, warm VM) | ~300 ms |
| Rendered PDF size (raw) | 39,198 B |
| Rendered PDF size (brotli) | 20,943 B |

- **Determinism**: the two warm renders normalize to byte-identical output (`normalizePdfBytes` over
  each), and normalization is idempotent — no extra normalization or `SOURCE_DATE_EPOCH` handling was
  needed beyond what already ships.
- **Highlighting**: the rouge highlighter loads and runs in-VM (zero "highlighter unavailable"
  engine warnings), and the code text survives into the PDF text layer (verified with `pdftotext`).

### Pinned live-preview latency budget (was deferred by the spec, SC-004)

Based on the measured warm re-convert (~300 ms) with generous headroom: **a warm re-render of the
reference document must complete in under 1000 ms** (engine convert time only, excluding debounce).
This is asserted by the gated integration test and is the concrete number the spec deferred.

## Gotchas

- **WOFF2 fonts**: converted to TTF at build/mount; prawn/ttfunk cannot read WOFF2 (research R8).
- **mermaid**: must run with `htmlLabels:false` or labels vanish in prawn-svg (research R3).
- **PlantUML/ditaa**: out of v1 (need remote Kroki) — warned-and-skipped (research R7).
- **No COOP/COEP**: single-threaded ruby.wasm; do not cross-origin-isolate the app (would break
  existing same-origin assets) unless a future threaded build requires it (research R2).
