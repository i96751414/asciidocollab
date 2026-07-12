/**
 * Creates the PDF render web worker.
 *
 * Using the `new URL(path, import.meta.url)` pattern causes Next.js/webpack to bundle the worker file
 * and all its npm dependencies (including `@asciidocollab/asciidoc-pdf` and the wasm/WASI interop) into
 * a self-contained asset, so it works reliably in browser contexts.
 *
 * This factory is extracted so tests can mock it without needing `import.meta.url` support — the export
 * and preview hooks depend on {@link createPdfWorker} and inject a fake worker in unit tests.
 */
export function createPdfWorker(): Worker {
  return new Worker(new URL('../workers/asciidoc-pdf.worker.ts', import.meta.url));
}
