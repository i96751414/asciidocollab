/**
 * Browser/worker shim that turns a Graphviz DOT source into a prawn-svg-friendly SVG asset.
 *
 * The DOT source is treated as INERT DATA: it is handed unchanged to the WebAssembly Graphviz
 * engine (`@hpcc-js/wasm`), which emits plain `<text>`/`<path>` SVG that the downstream Ruby PDF
 * renderer (prawn-svg) can draw directly — there is no `<foreignObject>` HTML to strip.
 *
 * The actual WASM call sits behind the {@link GraphvizRenderer} seam so the shim contract is
 * unit-testable without loading WebAssembly; the default renderer is only exercisable in a real
 * browser/worker (verified by e2e).
 */

import type {
  DiagnosticCode,
  RenderShim,
  ShimAssetFormat,
  ShimInput,
  ShimKind,
  ShimOutput,
} from '@asciidocollab/asciidoc-pdf';

const DIAGRAM_KIND: ShimKind = 'diagram';
const SVG_FORMAT: ShimAssetFormat = 'svg';
const MALFORMED_CODE: DiagnosticCode = 'malformed-diagram';

const ENGINE_NAME = 'graphviz';
/** The `@hpcc-js/wasm` build that bundles the Graphviz engine; participates in the cache hash. */
const ENGINE_VERSION = '2.34.5';

/**
 * The seam over the real (WebAssembly-bound) Graphviz engine: turn one DOT source string into an
 * SVG string. Unit tests inject a fake; the default drives the real WASM engine.
 */
export type GraphvizRenderer = (source: string) => Promise<string>;

/**
 * Single interop adapter over `@hpcc-js/wasm`: the loaded engine's published type re-exports an
 * unresolved sub-package here, so it surfaces as `any`. We pin it to this one narrow surface — the
 * synchronous DOT-to-SVG method — and touch the untyped engine nowhere else.
 */
interface GraphvizWasmEngine {
  dot(source: string): string;
}

/** Drives the real Graphviz WASM engine; only runnable in a browser/worker (loads WebAssembly). */
const defaultGraphvizRenderer: GraphvizRenderer = async (source) => {
  const { Graphviz } = await import('@hpcc-js/wasm');
  const engine: GraphvizWasmEngine = await Graphviz.load();
  return engine.dot(source);
};

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function succeed(svg: string): ShimOutput {
  return {
    ok: true,
    asset: { format: SVG_FORMAT, bytes: new TextEncoder().encode(svg), rasterFallback: false },
  };
}

function fail(error: unknown): ShimOutput {
  return { ok: false, diagnostic: { code: MALFORMED_CODE, message: messageOf(error) } };
}

/** Build a Graphviz {@link RenderShim}, optionally over an injected renderer seam (for tests). */
export function createGraphvizShim(
  renderer: GraphvizRenderer = defaultGraphvizRenderer,
): RenderShim {
  return {
    kind: DIAGRAM_KIND,
    name: ENGINE_NAME,
    version: ENGINE_VERSION,
    async render(input: ShimInput): Promise<ShimOutput> {
      try {
        const svg = await renderer(input.source);
        return succeed(svg);
      } catch (error) {
        return fail(error);
      }
    },
  };
}
