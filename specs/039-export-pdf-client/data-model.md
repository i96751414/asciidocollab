# Phase 1 Data Model: In-Browser PDF Export

These are **in-memory, browser-side** structures (worker ↔ main-thread DTOs and orchestrator
types). **No database entities, no Prisma changes, no domain-ring entities.** All types are defined
in `packages/asciidoc-pdf/src/protocol.ts` (cross-boundary DTOs) and the pipeline modules. Fallible
operations use `Result`-style diagnostics rather than throwing across the worker boundary.

---

## ProjectSnapshot

An immutable capture of the project state to render, taken from the editor at request time (built
from `useProjectSymbolIndex().getFiles()` + main/open file ids). Never mutated; the pipeline works
on VFS copies.

| Field | Type | Notes |
|-------|------|-------|
| `files` | `Record<string, string>` | path → AsciiDoc/text content (editor-live overlay applied) |
| `binaryAssets` | `Record<string, Uint8Array>` | path → image/font bytes (PNG/JPG/SVG/TTF/OTF) |
| `rootPath` | `string` | the document to convert (mainFile ?? open file) |
| `openPath` | `string` | currently-open file (for preview focus) |
| `themePath?` | `string` | project pdf-theme YAML path (if any) |
| `fontPaths` | `string[]` | custom font files to mount |
| `imagesDir?` | `string` | project `:imagesdir:` if set |
| `bibPath?` | `string` | BibTeX source path (if citations used) |
| `attributes` | `Record<string,string>` | seeded/intrinsic attributes (RENDER_INTRINSIC_ATTRIBUTES + project) |

**Validation**: every path MUST pass `resolveSandboxedPath` (no `..`, absolute, remote, NUL). Remote-
looking targets are excluded here and surfaced as warnings (Principle IX/X).

---

## RenderRequest

A worker message asking for a render (export or preview share the same request; `mode` differs).

| Field | Type | Notes |
|-------|------|-------|
| `requestId` | `string` | monotonic; used for staleness guard (stale results discarded) |
| `mode` | `'export' \| 'preview'` | export → return full Blob; preview → may return page-limited/rasterized preview |
| `snapshot` | `ProjectSnapshot` | see above (or a delta — see caching note) |
| `changedPaths?` | `string[]` | for warm re-render: only these `/project` files are rewritten |
| `optimize` | `boolean` | run hexapdf optimize (export=true; preview may skip) |

**State/flow**: `queued → preprocessing → converting → optimizing → done|failed`. Only the latest
`requestId` per mode is honored; superseded requests are cancelled at the next stage boundary.

---

## PipelineStage

An ordered pre-processing step run in the worker **before** the Ruby convert. Each stage reads and
writes the in-memory `/project` VFS so Ruby only ever sees local AsciiDoc + local images.

| Field | Type | Notes |
|-------|------|-------|
| `kind` | `'include-resolve' \| 'citations' \| 'diagrams-math' \| 'image-guard' \| 'mount-assets' \| 'convert'` | fixed order |
| `run` | `(ctx) => Promise<StageResult>` | pure w.r.t. injected `readFile`/shim interfaces (testable) |

**Ordered contract** (matches technical input, adjusted for offline):
1. `include-resolve` — recursive include expansion preserving `tags=`/`lines=`/`leveloffset`
   (reuses `assembleIncludes` + `asciidoc-core`). Remote/escaping includes → skip+warn.
2. `citations` — parse `.bib` once, rewrite `cite:/citenp:/bibitem:/bibliography::` → formatted
   AsciiDoc with anchors (citation-js).
3. `diagrams-math` — render mermaid/graphviz/vega/MathJax → SVG|PNG into `/project/.gen`, rewrite
   blocks to `image::` refs. PlantUML/ditaa → skip+warn (R7).
4. `image-guard` — validate local images (type/size); remote image refs → skip+warn (no fetch, R9).
5. `mount-assets` — mount fonts/theme/images into VFS.
6. `convert` — `Asciidoctor.convert_file(..., backend:'pdf', safe: :unsafe, attributes:{...})`;
   optional hexapdf optimize; read `/out/*.pdf` → bytes.

---

## GeneratedAsset

A rendered diagram/math/formatted-bibliography artifact, content-addressed for caching + determinism.

| Field | Type | Notes |
|-------|------|-------|
| `sourceHash` | `string` | hash of block source + render params + shim version (cache key) |
| `kind` | `'diagram' \| 'math' \| 'bibliography'` | producing shim family |
| `format` | `'svg' \| 'png'` | png ⇒ prawn-svg raster fallback fired (diagnostic recorded) |
| `bytes` | `Uint8Array` | the asset written to `/project/.gen/<sourceHash>.<ext>` |
| `rasterFallback` | `boolean` | true if SVG was unsupported by prawn-svg (R3) |

**Determinism**: identical `sourceHash` ⇒ identical `bytes` ⇒ stable placement (Principle XII).

---

## CacheEntry

An entry in the content-addressed generated-asset cache (in-memory `Map`; optional IndexedDB later).

| Field | Type | Notes |
|-------|------|-------|
| `key` | `string` | `sourceHash` |
| `asset` | `GeneratedAsset` | cached result |
| `lastUsedTick` | `number` | logical (not wall-clock) LRU counter — no `Date.now()` in output path |

**Rule**: keystroke edits that don't change a block's source ⇒ cache hit ⇒ no re-render of that
diagram/math/bibliography. The wasm blob itself is cached separately via the Cache API (R2).

---

## RenderResult

Returned to the main thread on success (possibly with non-fatal warnings).

| Field | Type | Notes |
|-------|------|-------|
| `requestId` | `string` | correlate + staleness check |
| `mode` | `'export' \| 'preview'` | |
| `pdf` | `Blob` | `application/pdf` (export: downloadable; preview: rendered via pdf.js) |
| `diagnostics` | `RenderDiagnostic[]` | per-resource/per-block warnings (never abort — spec FR-012) |
| `stats` | `{ coldStartMs?, renderMs, cacheHits, rasterFallbacks }` | logical timings for budget/observability |

---

## RenderDiagnostic

A per-resource/per-block warning or a structured error (spec FR-012, SC-005).

| Field | Type | Notes |
|-------|------|-------|
| `severity` | `'warning' \| 'error'` | `error` still allows the rest of the doc to export |
| `code` | `'remote-skipped' \| 'unsupported-image' \| 'missing-glyph' \| 'font-unavailable' \| 'diagram-unsupported' \| 'malformed-diagram' \| 'malformed-math' \| 'malformed-citation' \| 'unresolved-include'` | enumerated |
| `resource` | `string` | file path / URL / block id the diagnostic refers to |
| `location?` | `{ path: string; line?: number }` | source location for the editor to surface |
| `message` | `string` | localized, human-readable |

---

## RenderError (fatal, structured)

Only for whole-export failures (e.g. empty/unparseable root, VM instantiation failure) — spec edge
case "no content to export". Carried over the worker protocol as a discriminated failure, not a
thrown exception.

| Field | Type | Notes |
|-------|------|-------|
| `requestId` | `string` | |
| `phase` | `'vm-init' \| 'preprocessing' \| 'convert' \| 'read-output'` | where it failed |
| `code` | `string` | stable machine code |
| `message` | `string` | user-facing |

---

## Relationships

```
ProjectSnapshot ──(input to)──▶ RenderRequest ──▶ [PipelineStage×N] ──▶ convert ──▶ RenderResult
                                                        │                               │
                                        produces GeneratedAsset ◀─cache─ CacheEntry     ├─ RenderDiagnostic[]
                                                                                        └─ RenderError (failure branch)
```

**Not modeled** (out of scope v1): consent records / remote-fetch allowlist entries (no egress in
v1 — would be introduced only by a future remote-resource increment under Principle X governance).
