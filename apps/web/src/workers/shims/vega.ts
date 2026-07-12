/**
 * Browser/worker shim that turns a Vega or Vega-Lite spec into a prawn-svg-friendly SVG asset.
 *
 * The spec source is treated as INERT DATA: it is parsed as JSON (never evaluated), a Vega-Lite
 * spec is compiled to Vega, and the Vega runtime renders to a static SVG string. All remote and
 * filesystem data loading is DISABLED — the export runs offline, so a spec that reaches out to a
 * URL or a file fails its render rather than performing network/disk I/O.
 *
 * The engine sits behind the {@link VegaEngine} seam so the shim contract (JSON validation,
 * Vega-Lite detection, offline loading, diagnostics) is unit-testable without loading Vega; the
 * default engine is only exercisable in a real browser/worker.
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

const ENGINE_NAME = 'vega';
/** The bundled `vega` runtime version; participates in the cache hash so upgrades invalidate it. */
const ENGINE_VERSION = '6.2.0';

/** `$schema` substrings that classify a spec; the Vega-Lite marker is checked first (it contains "vega"). */
const VEGA_LITE_SCHEMA_MARKER = 'vega-lite';
const VEGA_SCHEMA_MARKER = '/vega/';

/** Top-level keys unique to Vega-Lite; used to classify a spec that carries no `$schema`. */
const VEGA_LITE_KEYS = [
  'mark',
  'encoding',
  'layer',
  'facet',
  'concat',
  'hconcat',
  'vconcat',
  'repeat',
] as const;

const NON_OBJECT_SPEC_MESSAGE = 'vega spec must be a JSON object';
const REMOTE_LOADING_DISABLED_MESSAGE = 'remote and file data loading is disabled for offline export';

/**
 * A data loader whose every entry point rejects: injected into the Vega runtime so remote (`http`,
 * `load`) and filesystem (`file`) references never resolve during an offline export.
 */
export interface RemoteBlockingLoader {
  /**
   * Rejects a `load()` reference so a spec's inline data reference never resolves during an export.
   *
   * @param uri - The data reference the spec asked the runtime to load.
   * @returns A promise that always rejects with the offline-export reason.
   */
  load(uri: string): Promise<string>;
  /**
   * Rejects an `http()` reference so no network request ever leaves the export process.
   *
   * @param uri - The remote URL the spec asked the runtime to fetch.
   * @param options - The runtime's request options, ignored because the call always rejects.
   * @returns A promise that always rejects with the offline-export reason.
   */
  http(uri: string, options: Record<string, unknown>): Promise<string>;
  /**
   * Rejects a `file()` reference so no filesystem read happens during an export.
   *
   * @param path - The filesystem path the spec asked the runtime to read.
   * @returns A promise that always rejects with the offline-export reason.
   */
  file(path: string): Promise<string>;
}

/**
 * The seam over the real Vega/Vega-Lite engine: compile a Vega-Lite spec to Vega, and render a Vega
 * spec to a static SVG string with the offline loader injected. Unit tests inject a fake.
 */
export interface VegaEngine {
  /**
   * Compiles a Vega-Lite spec down to the equivalent Vega spec the renderer understands.
   *
   * @param spec - The parsed Vega-Lite spec object.
   * @returns The compiled Vega spec.
   */
  compileVegaLite(spec: Record<string, unknown>): Promise<Record<string, unknown>>;
  /**
   * Renders a Vega spec to a static SVG string with the offline loader injected.
   *
   * @param spec - The parsed Vega spec object to render.
   * @param loader - The loader that blocks every remote and filesystem reference.
   * @returns The rendered SVG markup.
   */
  renderToSvg(spec: Record<string, unknown>, loader: RemoteBlockingLoader): Promise<string>;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Parse the block source as a JSON object, rejecting arrays/primitives/malformed JSON. */
function parseSpec(source: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(source);
  if (!isPlainObject(parsed)) {
    throw new Error(NON_OBJECT_SPEC_MESSAGE);
  }
  return parsed;
}

/** Classify a spec as Vega-Lite (needing compilation) vs. A ready-to-parse Vega spec. */
function isVegaLiteSpec(spec: Record<string, unknown>): boolean {
  const schema = spec.$schema;
  if (typeof schema === 'string') {
    if (schema.includes(VEGA_LITE_SCHEMA_MARKER)) {
      return true;
    }
    if (schema.includes(VEGA_SCHEMA_MARKER)) {
      return false;
    }
  }
  // No decisive `$schema`: a top-level `marks` array is Vega; the singular Vega-Lite keys are not.
  if (Array.isArray(spec.marks)) {
    return false;
  }
  return VEGA_LITE_KEYS.some((key) => key in spec);
}

// Every offline loader entry point shares this single rejection so no request ever leaves the process.
const rejectRemoteLoad = (): Promise<never> => Promise.reject(new Error(REMOTE_LOADING_DISABLED_MESSAGE));

/** A loader that blocks every remote/filesystem entry point (offline export). */
function createRemoteBlockingLoader(): RemoteBlockingLoader {
  return { load: rejectRemoteLoad, http: rejectRemoteLoad, file: rejectRemoteLoad };
}

/**
 * Single interop adapter over `vega-lite`: its published `compile` types don't match this narrow
 * seam, so we pin the dynamic import to the one method used and cast it here (and only here).
 */
interface VegaLiteModule {
  compile(spec: Record<string, unknown>): { spec: Record<string, unknown> };
}

/**
 * Single interop adapter over `vega`: its published types re-export an unresolved sub-package here,
 * so we pin the dynamic import to the narrow surface used (parse + a static-SVG View) in this one
 * place. The offline loader is passed as the View's `loader` so no request ever leaves the process.
 */
interface VegaView {
  toSVG(): Promise<string>;
  finalize(): void;
}

interface VegaModule {
  parse(spec: Record<string, unknown>): unknown;
  View: new (runtime: unknown, options: { renderer: 'none'; loader: unknown }) => VegaView;
}

/** Narrows the dynamically imported `vega-lite` module to the one method this seam relies on. */
function isVegaLiteModule(value: unknown): value is VegaLiteModule {
  return isPlainObject(value) && typeof value.compile === 'function';
}

/** Narrows the dynamically imported `vega` module to the parse/View surface this seam relies on. */
function isVegaModule(value: unknown): value is VegaModule {
  return isPlainObject(value) && typeof value.parse === 'function' && typeof value.View === 'function';
}

const defaultVegaEngine: VegaEngine = {
  async compileVegaLite(spec) {
    const vegaLite: unknown = await import('vega-lite');
    if (!isVegaLiteModule(vegaLite)) {
      throw new TypeError('vega-lite module does not expose the expected compile surface');
    }
    return vegaLite.compile(spec).spec;
  },
  async renderToSvg(spec, loader) {
    const vega: unknown = await import('vega');
    if (!isVegaModule(vega)) {
      throw new TypeError('vega module does not expose the expected parse/View surface');
    }
    const view = new vega.View(vega.parse(spec), { renderer: 'none', loader });
    try {
      return await view.toSVG();
    } finally {
      view.finalize();
    }
  },
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

/** Build a Vega {@link RenderShim}, optionally over an injected engine seam (for tests). */
export function createVegaShim(engine: VegaEngine = defaultVegaEngine): RenderShim {
  const loader = createRemoteBlockingLoader();
  return {
    kind: DIAGRAM_KIND,
    name: ENGINE_NAME,
    version: ENGINE_VERSION,
    async render(input: ShimInput): Promise<ShimOutput> {
      try {
        const spec = parseSpec(input.source);
        const vegaSpec = isVegaLiteSpec(spec) ? await engine.compileVegaLite(spec) : spec;
        const svg = await engine.renderToSvg(vegaSpec, loader);
        return succeed(svg);
      } catch (error) {
        return fail(error);
      }
    },
  };
}
