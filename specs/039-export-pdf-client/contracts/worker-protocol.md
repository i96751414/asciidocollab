# Contract: PDF Worker Message Protocol

Defines the `postMessage` protocol between the main thread (`use-pdf-export` / `use-pdf-preview`
hooks) and the PDF Web Worker (`asciidoc-pdf.worker.ts`). Raw structured-clone messages (no Comlink),
mirroring the existing `asciidoc-render.worker.ts` convention. Types live in
`packages/asciidoc-pdf/src/protocol.ts`.

## Direction: main → worker

```ts
type ToWorker =
  | { type: 'render'; request: RenderRequest }   // see data-model.md
  | { type: 'cancel'; requestId: string }        // best-effort supersede
  | { type: 'warmup' };                           // instantiate VM ahead of first render
```

- `render`: enqueue a render. Worker MUST honor only the latest `requestId` per `mode`; superseded
  requests are cancelled at the next stage boundary (staleness guard).
- `warmup`: instantiate the wasm VM (cold start) without rendering, so the first real export is warm.
- Transferables: none required inbound (snapshot is structured-cloned); large binary assets MAY be
  sent as `Uint8Array` (cloned).

## Direction: worker → main

```ts
type FromWorker =
  | { type: 'progress'; requestId: string; phase: RenderPhase; pct?: number }
  | { type: 'result'; result: RenderResult }     // pdf Blob + diagnostics + stats
  | { type: 'error'; error: RenderError };        // structured, fatal

type RenderPhase = 'vm-init' | 'preprocessing' | 'citations' | 'diagrams-math'
                 | 'converting' | 'optimizing' | 'done';
```

- `progress`: drives the spinner/phase UI; MUST be emitted at each stage boundary (cold start behind
  a spinner per plan).
- `result`: `result.pdf` transferred where possible (`Blob`/`ArrayBuffer` transfer) to avoid copy.
- `error`: only for whole-render failure; per-resource problems travel as `diagnostics` inside a
  successful `result` (spec FR-012 — partial success is the norm).

## Guarantees

1. **Staleness**: main thread discards any `result`/`progress` whose `requestId` is not the latest
   it issued for that `mode` (mirrors `use-asciidoc-preview` `requestId` guard).
2. **Non-blocking**: the worker never blocks the main thread; the protocol is fully async (Principle
   XIII).
3. **No egress**: the worker MUST NOT open network connections; the protocol carries no URLs to
   fetch (Principle X). Remote references surface as `remote-skipped` diagnostics.
4. **Idempotent warmup**: repeated `warmup`/first `render` MUST reuse the single warm VM.
