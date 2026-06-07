/**
 * Creates the AsciiDoc render web worker.
 *
 * Using the `new URL(path, import.meta.url)` pattern causes Next.js/webpack to bundle
 * the worker file and all its npm dependencies (including asciidoctor) into a self-contained
 * asset, making it work reliably in browser contexts.
 *
 * This factory is extracted so tests can mock it without needing `import.meta.url` support.
 */
export function createRenderWorker(): Worker {
  return new Worker(new URL('../workers/asciidoc-render.worker.ts', import.meta.url));
}
