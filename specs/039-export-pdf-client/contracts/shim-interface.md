# Contract: Browser Shim Interface

Defines the interface every browser-side rendering shim implements, so the **environment-agnostic
orchestrator** (`packages/asciidoc-pdf/src/pipeline/`) can drive them without importing DOM APIs.
Concrete implementations live in `apps/web/src/workers/shims/` (mermaid, graphviz, vega, mathjax,
citation-js); unit tests inject **in-memory fakes** (Principle III).

## Interface

```ts
interface RenderShim {
  readonly kind: 'diagram' | 'math' | 'citations';
  readonly name: string;      // 'mermaid' | 'graphviz' | 'vega' | 'mathjax' | 'citation-js'
  readonly version: string;   // participates in the content-address hash (R6)

  /** Render one block of source to an asset. MUST NOT fetch remote resources. */
  render(input: ShimInput): Promise<ShimOutput>;
}

interface ShimInput {
  source: string;                       // block source, treated as INERT DATA (Principle IX)
  params: Record<string, string>;       // block attributes (e.g. diagram type, format hint)
  preferredFormat: 'svg' | 'png';       // orchestrator asks SVG-first (R3)
}

type ShimOutput =
  | { ok: true; asset: { format: 'svg' | 'png'; bytes: Uint8Array }; rasterFallback: boolean }
  | { ok: false; diagnostic: { code: string; message: string } };   // malformed source → skip+warn
```

## Rules

1. **Inert input**: `source` is data, never executed. Shims MUST run in their safest mode:
   - mermaid: `securityLevel:'strict'`, `htmlLabels:false` (real `<text>`, prawn-svg-safe — R3).
   - vega/vega-lite: loader configured so **remote data/urls are disabled** (no egress).
   - MathJax: SVG output, no external font/resource fetch.
   - citation-js: parses `.bib` as data only.
2. **No egress** (Principle X): a shim MUST NOT perform network I/O. A source referencing a remote
   resource yields `{ ok:false, diagnostic:{ code:'remote-skipped' } }`.
3. **Raster fallback** (R3): when `preferredFormat:'svg'` output would hit a prawn-svg-unsupported
   feature, the shim (or orchestrator post-check) returns `format:'png'` with `rasterFallback:true`
   and a diagnostic is recorded — never a hard failure.
4. **Determinism** (R6/XII): given identical `source`+`params`+`version`, `render` MUST produce
   identical `bytes`. No `Date.now()`/random in output.
5. **Malformed source** (spec edge case): return `{ ok:false, diagnostic }` (localized), letting the
   rest of the document still export.

## citation-js specialization

The citations shim additionally exposes a batch entry (parse `.bib` once, rewrite all
`cite:/citenp:/bibitem:/bibliography::`) rather than per-block, to preserve ordering (appearance vs
alphabetical) and cross-references/back-links — see research R4.
