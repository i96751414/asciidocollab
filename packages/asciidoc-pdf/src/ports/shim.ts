/**
 * Port: the environment-agnostic seam every browser-side rendering shim implements, so the
 * pre-processing pipeline can drive mermaid/graphviz/vega/MathJax/citation-js **without importing any
 * DOM API**. Concrete implementations live in the web app (`apps/web/src/workers/shims/`); unit tests
 * inject in-memory fakes. A shim turns one block of inert source into an SVG|PNG asset (plus a raster
 * fallback flag) or, for malformed/remote source, a skip-and-warn diagnostic — it never throws across
 * the boundary and never performs network I/O.
 */

import type { DiagnosticCode,  } from '../protocol';

/** The families of shim the orchestrator drives, in a stable order. */
export const SHIM_KINDS = Object.freeze(['diagram', 'math', 'citations'] as const);

/** Which family a {@link RenderShim} belongs to. */
export type ShimKind = (typeof SHIM_KINDS)[number];

/** The output formats a shim may emit; SVG is asked first, PNG is the raster fallback. */
export const SHIM_ASSET_FORMATS = Object.freeze(['svg', 'png'] as const);

/** A rendered asset's byte format. */
export type ShimAssetFormat = (typeof SHIM_ASSET_FORMATS)[number];

/** One block of source handed to a shim. `source` is INERT DATA — never executed (Principle IX). */
export interface ShimInput {
  /** The raw block source, treated purely as data. */
  readonly source: string;
  /** Block attributes (e.g. Diagram sub-type, format hint) as string values. */
  readonly params: Readonly<Record<string, string>>;
  /** The format the orchestrator prefers; shims answer SVG-first and raster-fall-back to PNG. */
  readonly preferredFormat: ShimAssetFormat;
}

/**
 * The rendered bytes a shim produces on success — a {@link GeneratedAsset} without the caching
 * identity (`sourceHash`/`kind`), which the orchestrator assigns when it places and caches the asset.
 */
export interface ShimAsset {
  /** The emitted format; `png` means a raster fallback was taken. */
  readonly format: ShimAssetFormat;
  /** The rendered asset bytes. */
  readonly bytes: Uint8Array;
  /** True when the preferred SVG output hit an unsupported feature and PNG was produced instead. */
  readonly rasterFallback: boolean;
}

/** The non-fatal diagnostic a shim returns for malformed or remote-referencing source. */
export interface ShimDiagnostic {
  /** An enumerated diagnostic code (e.g. `malformed-diagram`, `remote-skipped`). */
  readonly code: DiagnosticCode;
  /** A localized, human-readable message. */
  readonly message: string;
}

/**
 * The result of rendering one block: either the asset bytes, or a skip-and-warn diagnostic. Modelled
 * as data (never a thrown exception) so a per-block problem lets the rest of the document still
 * export.
 */
export type ShimOutput =
  | { readonly ok: true; readonly asset: ShimAsset }
  | { readonly ok: false; readonly diagnostic: ShimDiagnostic };

/**
 * A single rendering shim. Given identical `source` + `params` + {@link RenderShim.version} it MUST
 * produce identical bytes (determinism, Principle XII) and MUST NOT perform network I/O.
 */
export interface RenderShim {
  /** The family this shim belongs to. */
  readonly kind: ShimKind;
  /** The concrete engine name (e.g. `mermaid`, `graphviz`, `vega`, `mathjax`, `citation-js`). */
  readonly name: string;
  /** The engine version; participates in the content-address hash so upgrades invalidate the cache. */
  readonly version: string;
  /**
   * Render one block of inert source to an asset or a skip-and-warn diagnostic.
   *
   * @param input - The block source, its attributes, and the preferred output format.
   * @returns The rendered asset bytes, or a diagnostic when the block is skipped.
   */
  render(input: ShimInput): Promise<ShimOutput>;
}

/** A lookup over the shims supplied at the composition root, so stages resolve the one they need. */
export interface ShimRegistry {
  /**
   * The shim registered under an engine name, or `undefined` if none.
   *
   * @param name - The concrete engine name to look up.
   * @returns The shim registered under that name, or `undefined` when none matches.
   */
  byName(name: string): RenderShim | undefined;
  /**
   * Every shim of a given family, in registration order.
   *
   * @param kind - The shim family to select.
   * @returns Every registered shim of that family, in registration order.
   */
  byKind(kind: ShimKind): readonly RenderShim[];
}

/** Build a {@link ShimRegistry} over a fixed set of shims (the last registration per name wins). */
export function createShimRegistry(shims: readonly RenderShim[]): ShimRegistry {
  const byNameMap = new Map<string, RenderShim>();
  for (const shim of shims) {
    byNameMap.set(shim.name, shim);
  }
  return {
    byName: (name) => byNameMap.get(name),
    byKind: (kind) => shims.filter((shim) => shim.kind === kind),
  };
}

/**
 * Re-exported for the stages/cache that promote a {@link ShimAsset} into a cached
 * {@link GeneratedAsset}; kept here so shim consumers need only import this port.
 */


export {type GeneratedAsset} from '../protocol';