# Worker Protocol: `asciidoc-render.worker.ts`

## Overview

A Dedicated Web Worker. One instance per mounted `AsciiDocPreview`. Terminated on unmount.

- **Source**: `apps/web/src/workers/asciidoc-render.worker.ts`
- **Compiled output**: `apps/web/public/workers/asciidoc-render.worker.js` (via `build:worker` tsc)
- **Instantiation**: `new Worker('/workers/asciidoc-render.worker.js')`

---

## Inbound message: `RenderRequest`

```typescript
interface RenderRequest {
  requestId: number;   // monotonically increasing; echoed in response
  content: string;     // AsciiDoc source text to render
}
```

The worker processes messages sequentially. Each new message cancels any in-progress render (Asciidoctor.js is synchronous; "cancel" means the previous result is discarded by comparing requestId on the consumer side).

---

## Outbound message: `RenderResult`

```typescript
interface RenderResult {
  requestId: number;       // echoed from RenderRequest
  ok: boolean;
  html: string | null;     // rendered HTML with data-source-line attributes; null on failure
  error: string | null;    // Asciidoctor error message; null on success
}
```

---

## Worker initialisation

On first message, the worker:
1. Imports `asciidoctor` (dynamic import or top-level; the package supports worker scope).
2. Creates a processor instance: `const processor = Asciidoctor()`.
3. Registers a `TreeProcessor` extension that injects `data-source-line` attributes.
4. Reuses the same processor for all subsequent renders (no re-initialisation per message).

---

## TreeProcessor extension behaviour

The extension is registered once via `processor.Extensions.register(...)`. On each `process(doc)` call:

```
doc.findBy({}) → all blocks in the document
for each block:
  if block.getSourceLocation() is non-null:
    block.setAttribute('data-source-line', block.getSourceLocation().getLineNumber())
```

The `setAttribute` call on an Asciidoctor block node causes the attribute to appear on the outermost HTML element produced by that block's converter.

---

## Error handling

- If `processor.load()` or `doc.convert()` throws: post `{ requestId, ok: false, html: null, error: error.message }`.
- The consumer retains the previous `html` value on error (FR-007: no blank panel).
