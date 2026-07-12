# Implementation Plan: In-Browser PDF Export

**Branch**: `039-export-pdf-client` | **Date**: 2026-07-11 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/039-export-pdf-client/spec.md`

## Summary

Add client-side, print-ready PDF export (and a live PDF preview) for the AsciiDoc project the
user is editing, with **element-level style parity** against the project's canonical
Asciidoctor-PDF toolchain (the external CLI / Maven "reference build"). Rendering runs entirely
in the browser via the **real `asciidoctor-pdf` Ruby gem compiled to WebAssembly** (ruby.wasm,
CRuby `wasm32-wasip1`) inside a long-lived Web Worker, so confidential source never leaves the
client. A worker-side pre-processing pipeline resolves includes, citations, diagrams, and math to
local AsciiDoc + local images *before* the Ruby convert, so Ruby only ever sees sandbox-local
inputs. Per the spec's resolved clarifications, **v1 is fully offline**: remote includes/images are
warned-and-skipped (no backend proxy, no Kroki), diagrams and math are both in scope via
browser-side shims, and the fidelity bar is element-level parity verified against a reference
fixtures corpus.

**Primary approach** (from technical input, grounded in the existing render-worker architecture):
- New web-only leaf package `packages/asciidoc-pdf` — the pinned Gemfile + `rbwasm` build, the
  built `.wasm` handling, TS bindings that instantiate the VM (`@ruby/wasm-wasi` +
  `@bjorn3/browser_wasi_shim` with manual preopens), the worker message-protocol DTOs, the
  VFS-population contract, and an **environment-agnostic pipeline orchestrator** whose diagram/
  math/citation rendering is injected via interfaces (so it is unit-testable with in-memory fakes).
- `apps/web` — the PDF worker that wires the package to concrete browser shims (mermaid, Graphviz
  via `@hpcc-js/wasm`, vega/vega-lite, MathJax SVG, citation-js), the `use-pdf-export` /
  `use-pdf-preview` hooks (mirroring `use-asciidoc-preview`), the Export button + PDF preview panel
  (design-token UI), plus wasm asset serving.
- Reuse include/attribute/path-resolution logic via a **shared environment-agnostic assembly
  primitive** (extracted so both the existing HTML preview and the PDF pipeline consume it) exposed
  to the package through an injected `IncludeAssembler` port — the package never imports `apps/web`
  (Architecture Constitution Blocking rule 9). Reuse `@asciidocollab/asciidoc-core` directly, and the
  `apps/web/public/vendor/mathjax/` + `build:*` script precedent for vendoring the wasm blob
  same-origin.
- `apps/api` — **no new code in v1** (fully offline; the optional fetch proxy is deferred).

## Technical Context

**Language/Version**: TypeScript 5.x (repo standard, `node16` modules) for bindings/orchestration/
UI; Ruby 3.x compiled to `wasm32-wasip1` via ruby.wasm for the rendering engine. Frontend is
Next.js 16 (App Router, Turbopack) / React 19.

**Primary Dependencies**:
- Engine (in-wasm, all pure-Ruby / sandbox-safe): `asciidoctor-pdf`, `prawn`/`prawn-svg`
  (transitive), `rouge` (code highlighting), `text-hyphen` (hyphenation), `hexapdf` (PDF optimize),
  `prawn-templates` (branded page backgrounds), `js` (host bridge). Native transitive gems (e.g.
  `bigdecimal`) excluded/replaced — see research.
- Runtime host: `@ruby/wasm-wasi`, `@bjorn3/browser_wasi_shim`, `wasi-vfs` (baked stdlib+gems).
- Browser shims (Principle XIV): `mermaid`, `@hpcc-js/wasm` (Graphviz), `vega` + `vega-lite`,
  MathJax (SVG-output), `@citation-js/core` + BibTeX + CSL plugins.
- Build: `rbwasm` (ruby.wasm builder Docker image) from a pinned `Gemfile`/`Gemfile.lock`.

**Storage**: No database changes. In-memory WASI VFS (preopens `/project` repopulated per render,
`/out` writable for the PDF; `/usr` = baked immutable stdlib+gems). Wasm blob cached via the Cache
API with immutable headers. Content-addressed generated-asset cache (in-memory Map keyed by source
hash; optionally IndexedDB for cross-session reuse — deferred).

**Testing**: Jest (unit — orchestrator/pipeline/cache-key/protocol with in-memory fakes; TTFunk
font selection; warning aggregation). Integration — the Ruby convert exercised via the actual wasm
(runnable headless under Node/WASI for the convert step). Playwright e2e — full export/preview flow
in a real browser (shims need DOM). **New reference-parity harness** — renders fixture projects,
rasterizes PDF pages (pdf.js → canvas), diffs against a committed reference-PDF fixtures corpus with
`pixelmatch`/`odiff` at a defined tolerance (Principles XI/XV). No existing visual-snapshot infra —
this is net-new.

**Target Platform**: Modern evergreen browsers (Chromium, Firefox, Safari) with WebAssembly +
`WebAssembly.instantiateStreaming`. Single-threaded ruby.wasm build → **no SharedArrayBuffer**, so
**no COOP/COEP cross-origin-isolation headers required** (avoids breaking other cross-origin
assets) — to be confirmed in research.

**Project Type**: Web (frontend-heavy). New browser-only leaf package + `apps/web` worker/UI; no
backend in v1.

**Performance Goals**: Warm VM instantiated once per session (cold start behind a spinner). Per-
render, only changed `/project` files are overwritten and only stale assets re-rendered (content-
hash cache), so keystroke-level edits don't re-render stable diagrams/math/bibliography. Live
preview debounced/coalesced; editor thread never blocked (Principle XIII). Exact latency/size
budgets set in research against a representative project (spec defers hard numbers).

_Measured (headless engine harness, reference two-language highlighted doc; single-run, indicative):_
cold start (wasm compile + first warmup) ~290 ms; first convert ~910 ms; warm re-convert ~300 ms;
built wasm ~68.3 MiB raw / ~19.0 MiB brotli; rendered PDF 39,198 B raw / 20,943 B brotli. Output is
byte-deterministic across warm renders after `normalizePdfBytes` (no `SOURCE_DATE_EPOCH` needed).
**Pinned live-preview latency budget (SC-004): warm re-render < 1000 ms** on the reference document
(engine convert only). See `quickstart.md` → "Measured performance".

**Constraints**: No threads, no sockets in the Ruby layer (Principle XIV). Fully offline — no
document content egress (Principle X); remote includes/images warned-and-skipped. Images: PNG/JPG
native to prawn, SVG via prawn-svg (subset — rasterization fallback), other formats pre-converted
client-side. Fonts: TTF/OTF only (ttfunk); WOFF2→TTF converted at build; default theme fonts baked
in, only custom project fonts mounted at runtime. Wasm binary tens of MB → gzip/brotli + immutable
caching mandatory. Output must be deterministic (Principle XII): normalize PDF `/CreationDate`,
`/ModDate`, `/ID` (e.g. `SOURCE_DATE_EPOCH`) so identical inputs produce byte-stable output, or fall
back to the defined visual tolerance.

**Scale/Scope**: Multi-file specifications (tens–hundreds of files, includes with tag/line/
leveloffset filters), custom theme + branded fonts, embedded diagrams, math, and BibTeX-backed
citations. Reference project per spec Success Criteria.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Governing document: `.specify/memory/constitution.md` **v2.6.0** (Principles I–XV) plus
`architecture_constitution.md` and `security_constitution.md`.

### Principle-by-principle (initial)

| Principle | Status | How the plan satisfies it |
|-----------|--------|---------------------------|
| I Clean Code | ✅ | Typed DTOs, `Result`-style diagnostics, no magic strings; pipeline stages are small single-purpose units. |
| II TDD (NON-NEG) | ✅ | Every deliverable via `/tdd`. Orchestrator/cache/protocol tested with in-memory fakes; convert + parity via integration/e2e. |
| III Seam testing w/ in-memory fakes | ✅ | Orchestrator takes `readFile` + shim interfaces; fakes drive unit tests. Wasm/DOM stay behind seams. |
| IV Reuse before rebuild | ✅ | Uses the **real** asciidoctor-pdf gem (not a reimplementation), `rouge`, MathJax; reuses `assembleIncludes`, `asciidoc-core`, the render-worker + vendor-asset precedents. Wasm is re-syncable (pinned Gemfile + `rbwasm` build step, not hand-edited). |
| V Design tokens | ✅ | Export button, progress, warnings panel, preview chrome derive from tokens; correct in light/dark. (PDF *content* is not app chrome.) |
| VI Style isolation | ✅ | Preview is a rendered **PDF** (iframe/pdf.js canvas), not injected HTML — document styles cannot leak into chrome. |
| VII Per-user prefs / shared immutability | ✅ | Export is a read action. Pre-processing rewrites (include inlining, `.gen` assets, citation rewrite) happen **only in the in-memory VFS copy**, never written back to project source or Yjs (asserted in T042). |
| VIII Editor pipeline integrity | ✅ (called out) | New rendering path. It does **not** touch the HTML-preview DOMPurify seam or scroll-sync. Its own untrusted-input handling is governed by IX (below); no existing sanitizer is widened or forked. |
| IX Untrusted Input Boundary (NON-NEG) | ✅ (security section) | Includes/images resolved only via reused `resolveSandboxedPath` (traversal/absolute/remote rejected). Fully offline → remote fetch rejected by construction. Images validated (type/size) at the boundary. Diagram/math/bib source treated as **inert data**: mermaid `securityLevel:'strict'` + `htmlLabels:false`, vega loader with remote data disabled, MathJax no external resources, citation-js parses `.bib` as data. |
| X Client-side / no egress (NON-NEG) | ✅ | Entire render is client-side wasm; wasm served same-origin. No proxy, no Kroki. Remote references warned-and-skipped, fail-closed. This principle is the reason for the architecture. |
| XI Reference-build parity (NON-NEG) | ✅ (gated by harness) | Reference = external Asciidoctor-PDF CLI/Maven; parity verified by the new comparison harness against a team-maintained reference fixtures corpus. Divergence = defect. |
| XII Deterministic output | ✅ (called out) | Content-addressed assets; normalize PDF date/ID metadata for byte-stability, else defined visual tolerance; no wall-clock/network/locale dependence in output. |
| XIII Non-blocking responsiveness | ✅ | All heavy work in the Web Worker; warm VM; debounced preview; main thread never blocked. |
| XIV Sandbox-safe dependencies (NON-NEG posture) | ✅ (gated by research) | Pure-Ruby gems only; native transitive deps excluded/replaced; OS capabilities via explicit WASI shims; no subprocess/socket. Confirmed in Phase 0. |
| XV Fidelity verified before done | ✅ | Theme, fonts, diagrams, math, citations, includes each covered by a comparison test vs reference before the deliverable is "done". |

### ✅ Resolved — architecture-constitution amendment landed

`architecture_constitution.md` originally mandated *server-side* PDF rendering (**"Asciidoctor-PDF
(Ruby sidecar) … no JS-based PDF fallback"**), which **NON-NEGOTIABLE Principle X (no source egress)**
forbids for confidential projects. This has been **resolved** (2026-07-11) by amending
`architecture_constitution.md` to **v2.5.0**:

- The PDF Technology Mandate now permits **client-side ruby.wasm** (the *real* Asciidoctor-PDF Ruby
  gem compiled to WebAssembly) alongside the server sidecar; the "no JS-based PDF reimplementation"
  constraint is unchanged — only the *execution locus* (server → client worker) is added.
- Async & Integration Rules updated to match; Module Boundaries record the accepted deviation for
  browser-only capability packages (e.g. `packages/asciidoc-pdf`) — inward-only, never imported by
  domain/application/infrastructure; and **new Blocking rule 9**: a package MUST NOT import from an
  app (enforced mechanically — see Complexity Tracking + tasks T047–T049).

**Gate result**: PASS for Principles I–XV. No governance item remains blocking; no principle is
violated or waived.

## Project Structure

### Documentation (this feature)

```text
specs/039-export-pdf-client/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── worker-protocol.md
│   ├── vfs-population.md
│   ├── shim-interface.md
│   └── convert-invocation.md
├── checklists/
│   └── requirements.md  # (from /speckit-specify)
└── tasks.md             # /speckit-tasks output (NOT created here)
```

### Source Code (repository root)

```text
packages/asciidoc-pdf/                     # NEW — browser-only leaf capability package (modeled on asciidoc-core)
├── package.json                           # private, tsc→dist, node16; deps: @ruby/wasm-wasi, @bjorn3/browser_wasi_shim, @asciidocollab/asciidoc-core
├── tsconfig.json / jest.config.cjs
├── ruby/
│   ├── Gemfile                            # PINNED gem set (asciidoctor-pdf, rouge, text-hyphen, hexapdf, prawn-templates, js)
│   ├── Gemfile.lock
│   └── build-wasm.sh                      # rbwasm build (CI, ruby.wasm builder image) → asciidoctor-pdf.wasm + wasi-vfs baked /usr
├── src/
│   ├── index.ts                           # barrel
│   ├── protocol.ts                        # worker message DTOs (RenderRequest/Progress/Result/Error)
│   ├── vm/wasi-bridge.ts                  # typed adapter over @ruby/wasm-wasi + browser_wasi_shim (all casts confined here — Blocking rules 5/6)
│   ├── vm/ruby-pdf-vm.ts                  # instantiate wasm, WASI + manual preopens, warm-VM lifecycle (uses wasi-bridge)
│   ├── vfs/populate.ts                    # ProjectSnapshot → /project tree; read /out
│   ├── ports/include-assembler.ts         # IncludeAssembler port (concrete impl injected by apps/web — no app import; Blocking rule 9)
│   ├── pipeline/orchestrator.ts           # ordered stages; shim rendering + readFile + IncludeAssembler injected via interfaces
│   ├── pipeline/stages/                   # include-resolve(via port), citations, diagrams+math, image-guard(→skip remote), mount-assets, convert
│   ├── cache/content-address.ts           # source-hash keying + CacheEntry store interface
│   └── convert/invoke.ts                  # attribute map + backend:'pdf' invocation contract
└── tests/                                 # in-memory-fake unit tests mirroring src/

apps/web/src/
├── workers/
│   └── asciidoc-pdf.worker.ts             # NEW — loads packages/asciidoc-pdf, wires concrete shims, runs pipeline+convert
├── workers/shims/                         # NEW — mermaid / graphviz / vega / mathjax / citation-js implementing the shim interface
├── lib/create-pdf-worker.ts               # NEW — worker factory (mirrors create-render-worker.ts)
├── hooks/use-pdf-export.ts                # NEW — one-click export (download Blob)
├── hooks/use-pdf-preview.ts               # NEW — live preview (mirrors use-asciidoc-preview.ts; debounce, staleness guard)
├── components/pdf-export-button.tsx       # NEW — token-styled action
├── components/pdf-preview-panel.tsx       # NEW — pdf.js/iframe preview + warnings surface
└── (wire into) app/(dashboard)/dashboard/projects/[id]/project-editor-layout.tsx  # mount button + preview; feed getProjectFiles snapshot + rootFileId

apps/web/
├── next.config.js                         # add .wasm asset handling (+ headers only if research says needed)
├── scripts/build-asciidoctor-pdf-wasm.mjs # NEW — copy built wasm → public/vendor/asciidoctor-pdf/ (predev/prebuild), mirrors build-mathjax-assets.mjs
├── public/vendor/asciidoctor-pdf/         # NEW — same-origin wasm blob (immutable-cached)
└── package.json                           # add build:asciidoctor-pdf-wasm to predev/prebuild chain

tests/ (reference-parity harness)
└── apps/web/e2e/pdf-parity/               # NEW — fixture projects + reference PDFs + rasterize/diff (Playwright)

apps/api/                                  # NO CHANGES in v1 (fully offline; fetch proxy deferred)
```

**Structure Decision**: Mirror the existing client-side HTML render pipeline
(`assemble-includes.ts` → `asciidoc-render.worker.ts` fed by `getFiles()`), substituting a
ruby.wasm PDF worker. Environment-agnostic engine/orchestration lives in the new browser-only leaf
package `packages/asciidoc-pdf` (depends inward on `asciidoc-core`; **must never be imported by
domain/application/infrastructure**); DOM-bound shims and UI live in `apps/web`. This keeps the
orchestrator unit-testable with in-memory fakes (Principle III) while the wasm/DOM pieces stay
behind seams and are exercised by integration/e2e + the parity harness. No database, no domain-ring,
and no backend changes in v1.

## Complexity Tracking

| Violation / Deviation | Why Needed | Simpler Alternative Rejected Because |
|-----------------------|-----------|--------------------------------------|
| Architecture-constitution Technology Mandate change: PDF via Ruby **sidecar (server)** → also **ruby.wasm (client)** — ✅ **applied** in `architecture_constitution.md` v2.5.0 | NON-NEGOTIABLE Principle X forbids sending confidential source to a server to render. The mandate predated the client-side principles and this feature. | Keeping the server sidecar is not an option — it violates a non-waivable principle. The wasm engine is still the real Asciidoctor-PDF Ruby gem, so "no JS-based PDF reimplementation" intent is preserved. Amendment landed (backward-compatible: sidecar still permitted for non-confidential builds). |
| `packages/asciidoc-pdf` reusing include-assembly must not import `apps/web` (Blocking rule 9) — resolved via injected `IncludeAssembler` port / shared primitive | The environment-agnostic engine must stay app-free and unit-testable (Principle III). | Direct import of `apps/web/.../assemble-includes.ts` would invert the dependency rule. See `architecture-migration-plan.md`; tasks T048 (port) + T049 (boundary check). |
| Untyped ruby.wasm/WASI JS bridge confined to one typed adapter | The interop libraries are untyped; unguarded use would spread `any`/`as` (Blocking rules 5 & 6). | Scattering casts across vm/convert/vfs is prohibited; a single typed `wasi-bridge.ts` adapter contains them. Task T047. |
| New browser-only leaf package `packages/asciidoc-pdf` outside the domain rings | Isolates the wasm engine + orchestrator so it is reusable and unit-testable, and keeps `apps/web` thin. | Putting everything in `apps/web` (like the HTML worker) mixes DOM-bound shims with environment-agnostic orchestration and blocks in-memory-fake unit testing per Principle III. |
| Net-new visual reference-parity harness (no existing snapshot infra) | Principles XI & XV *require* verifying parity against reference output, not asserting it. | Reusing existing Jest/Playwright without image diffing cannot verify pixel/element parity; a comparison harness is mandatory, not optional. |

*The generated-asset cache, WASI shims, and rasterization fallback are inherent to the chosen
engine and are not tracked as deviations.*
