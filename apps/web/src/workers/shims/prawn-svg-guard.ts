/**
 * Guards SVG produced by the diagram/math shims against constructs the wasm engine's SVG renderer
 * (prawn-svg) cannot draw cleanly. Prawn-svg understands only a subset of SVG; when a shim emits a
 * construct outside that subset the guard rasterizes the SVG to a PNG at a print-fidelity DPI (via an
 * offscreen canvas in the worker) and records a raster-fallback so parity reviewers can see which
 * assets were rasterized — this is a diagnostic, never a hard failure.
 *
 * The module is split into two seams so the routing DECISION stays fully unit-testable off a real
 * canvas:
 *  - `detectUnsupportedSvgFeatures` is a pure markup scan (no DOM).
 *  - `rasterizeSvgToPng` is the browser-only canvas render, injected into `guardSvgForPrawn` so tests
 *    can substitute an in-memory fake.
 */

import type { ShimAsset, ShimAssetFormat } from '@asciidocollab/asciidoc-pdf';

/** The two asset formats, named once so the routing never repeats a bare string literal. */
const FORMAT_SVG: ShimAssetFormat = 'svg';
const FORMAT_PNG: ShimAssetFormat = 'png';

/**
 * Default rasterization density, in dots-per-inch, chosen for print fidelity: 300 DPI is the standard
 * print resolution, so a raster fallback still reproduces crisply against a vector reference.
 */
export const DEFAULT_RASTER_DPI = 300;

/** CSS reference density: SVG user units map to CSS pixels at 96 DPI, the raster-scale baseline. */
const CSS_PX_PER_INCH = 96;

/** Fallback raster dimension, in SVG user units, when neither width/height nor a viewBox is present. */
const FALLBACK_SVG_SIZE = 300;

/**
 * The machine-readable reasons an SVG is routed to a raster fallback. Exposed so consumers (and tests)
 * reference the codes symbolically rather than by literal, and so a diagnostic can name the trigger.
 */
export const PRAWN_SVG_UNSUPPORTED_REASONS = Object.freeze({
  /** `<foreignObject>` embeds foreign (HTML) content prawn-svg cannot render. */
  foreignObject: 'foreign-object',
  /** A `<filter>` element, `filter=` attribute, or CSS `filter:` — filter effects are unsupported. */
  filter: 'filter',
  /** A `<pattern>` fill or a gradient beyond the supported set (focal point / non-pad spreadMethod). */
  gradientOrPattern: 'gradient-or-pattern',
  /** A `<clipPath>` whose geometry is anything other than a plain rect. */
  clipPath: 'clip-path-non-rect',
} as const);

/** One of the {@link PRAWN_SVG_UNSUPPORTED_REASONS} codes. */
export type PrawnSvgUnsupportedReason =
  (typeof PRAWN_SVG_UNSUPPORTED_REASONS)[keyof typeof PRAWN_SVG_UNSUPPORTED_REASONS];

/** The result of scanning SVG markup for prawn-svg-unsupported constructs. */
export interface SvgSupportReport {
  /** True when the markup contains no rasterization-mandatory construct. */
  readonly supported: boolean;
  /** The distinct triggers found, in a stable order; empty when {@link supported} is true. */
  readonly reasons: readonly PrawnSvgUnsupportedReason[];
}

// --- pure detection -------------------------------------------------------------------------------

const FOREIGN_OBJECT = /<foreignObject[\s/>]/i;
const FILTER_ELEMENT = /<filter[\s/>]/i;
// `filter` as an attribute (`filter=`) or CSS property (`filter:`), but not `backdrop-filter`/ids.
const FILTER_REFERENCE = /(?:^|[^-\w])filter\s*[:=]/i;
const PATTERN_ELEMENT = /<pattern[\s/>]/i;
const NON_PAD_SPREAD = /spreadMethod\s*=\s*["'](?:reflect|repeat)["']/i;
const RADIAL_GRADIENT_OPEN_TAG = /<radialGradient\b[^<>]*>/gi;
const FOCAL_POINT_ATTR = /\bf[xy]\s*=/i;
const CLIP_PATH_OPEN_TAG = /<clipPath\b[^<>]*>/gi;
const CLIP_PATH_CLOSE_TAG = /<\/clipPath>/gi;
const CHILD_ELEMENT_NAME = /<\s*([a-zA-Z][\w.-]*)/g;
const SUPPORTED_CLIP_CHILD = 'rect';

function hasUnsupportedRadialGradient(svg: string): boolean {
  for (const match of svg.matchAll(RADIAL_GRADIENT_OPEN_TAG)) {
    if (FOCAL_POINT_ATTR.test(match[0])) {
      return true;
    }
  }
  return false;
}

function hasUnsupportedGradientOrPattern(svg: string): boolean {
  return PATTERN_ELEMENT.test(svg) || NON_PAD_SPREAD.test(svg) || hasUnsupportedRadialGradient(svg);
}

function hasNonRectClipPath(svg: string): boolean {
  // Locate each opening tag, then the nearest close via a literal scan. Splitting the two seams keeps
  // both regexes linear-time; a single open-body-close pattern backtracks quadratically on unclosed tags.
  for (const open of svg.matchAll(CLIP_PATH_OPEN_TAG)) {
    const bodyStart = (open.index ?? 0) + open[0].length;
    CLIP_PATH_CLOSE_TAG.lastIndex = bodyStart;
    const close = CLIP_PATH_CLOSE_TAG.exec(svg);
    if (close === null) {
      continue;
    }
    const body = svg.slice(bodyStart, close.index);
    for (const child of body.matchAll(CHILD_ELEMENT_NAME)) {
      if (child[1].toLowerCase() !== SUPPORTED_CLIP_CHILD) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Scans SVG markup for the constructs prawn-svg cannot render, returning every distinct trigger. Pure
 * string analysis — safe to run anywhere (no DOM), so the raster-fallback decision is unit-testable.
 */
export function detectUnsupportedSvgFeatures(svg: string): SvgSupportReport {
  const reasons: PrawnSvgUnsupportedReason[] = [];
  if (FOREIGN_OBJECT.test(svg)) {
    reasons.push(PRAWN_SVG_UNSUPPORTED_REASONS.foreignObject);
  }
  if (FILTER_ELEMENT.test(svg) || FILTER_REFERENCE.test(svg)) {
    reasons.push(PRAWN_SVG_UNSUPPORTED_REASONS.filter);
  }
  if (hasUnsupportedGradientOrPattern(svg)) {
    reasons.push(PRAWN_SVG_UNSUPPORTED_REASONS.gradientOrPattern);
  }
  if (hasNonRectClipPath(svg)) {
    reasons.push(PRAWN_SVG_UNSUPPORTED_REASONS.clipPath);
  }
  return { supported: reasons.length === 0, reasons };
}

// --- browser-only rasterization -------------------------------------------------------------------

/** Options controlling a raster fallback. */
export interface RasterizeOptions {
  /** Target print density, in dots-per-inch. */
  readonly dpi: number;
}

/**
 * The seam the guard calls to rasterize SVG to PNG bytes. The production implementation is
 * {@link rasterizeSvgToPng} (browser-only); tests inject an in-memory fake so routing stays testable.
 */
export type SvgRasterizer = (svg: string, options: RasterizeOptions) => Promise<Uint8Array>;

const SVG_ROOT_TAG = /<svg\b[^<>]*>/i;
const WIDTH_ATTR = /\bwidth\s*=\s*(?:["']\s*)?([\d.]+)/i;
const HEIGHT_ATTR = /\bheight\s*=\s*(?:["']\s*)?([\d.]+)/i;
const VIEW_BOX_ATTR = /\bviewBox\s*=\s*["']\s*[\d.+-]+\s+[\d.+-]+\s+([\d.]+)\s+([\d.]+)/i;

/** Intrinsic SVG size, in user units — from width/height, else the viewBox, else a square fallback. */
function intrinsicSize(svg: string): { readonly width: number; readonly height: number } {
  const root = SVG_ROOT_TAG.exec(svg)?.[0] ?? '';
  const width = WIDTH_ATTR.exec(root)?.[1];
  const height = HEIGHT_ATTR.exec(root)?.[1];
  if (width !== undefined && height !== undefined) {
    return { width: Number(width), height: Number(height) };
  }
  const viewBox = VIEW_BOX_ATTR.exec(root);
  if (viewBox) {
    return { width: Number(viewBox[1]), height: Number(viewBox[2]) };
  }
  return { width: FALLBACK_SVG_SIZE, height: FALLBACK_SVG_SIZE };
}

/** Device-pixel raster dimensions for the given DPI, scaling SVG user units from the 96-DPI baseline. */
function rasterPixelSize(svg: string, dpi: number): { readonly width: number; readonly height: number } {
  const { width, height } = intrinsicSize(svg);
  const scale = dpi / CSS_PX_PER_INCH;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/**
 * Rasterizes SVG markup to PNG bytes at the requested print DPI using an offscreen canvas.
 *
 * BROWSER-ONLY: relies on `OffscreenCanvas`, `createImageBitmap`, and `Blob`, which exist in the
 * worker/browser but not under the unit-test runtime. It is intentionally NOT faked in tests — the
 * routing decision is covered via the {@link SvgRasterizer} seam, and the real pixel output is
 * validated by the browser-based parity harness. Throws if the canvas APIs are unavailable.
 */
export async function rasterizeSvgToPng(svg: string, options: RasterizeOptions): Promise<Uint8Array> {
  if (typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined') {
    throw new TypeError('rasterizeSvgToPng requires a browser/worker environment with OffscreenCanvas');
  }
  const { width, height } = rasterPixelSize(svg, options.dpi);
  const source = new Blob([svg], { type: 'image/svg+xml' });
  const bitmap = await createImageBitmap(source);
  try {
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d');
    if (context === null) {
      throw new Error('rasterizeSvgToPng could not acquire a 2d canvas context');
    }
    context.drawImage(bitmap, 0, 0, width, height);
    const png = await canvas.convertToBlob({ type: 'image/png' });
    return new Uint8Array(await png.arrayBuffer());
  } finally {
    bitmap.close();
  }
}

// --- composition ----------------------------------------------------------------------------------

/** Options for {@link guardSvgForPrawn}. */
export interface GuardOptions {
  /** Print density for a raster fallback; defaults to {@link DEFAULT_RASTER_DPI}. */
  readonly dpi?: number;
  /** Override the rasterization seam (tests inject a fake); defaults to {@link rasterizeSvgToPng}. */
  readonly rasterize?: SvgRasterizer;
}

/**
 * A {@link ShimAsset} augmented with the raster-fallback triggers, so a diagnostic can name why the
 * asset was rasterized. Consumers that only need the asset destructure `{ format, bytes, rasterFallback }`.
 */
export interface GuardedSvgAsset extends ShimAsset {
  /** The unsupported-feature triggers that forced a raster fallback; empty for a passthrough SVG. */
  readonly reasons: readonly PrawnSvgUnsupportedReason[];
}

/**
 * Routes shim SVG output for the wasm engine: SVG-first, PNG raster-fallback. When the markup is
 * prawn-svg-safe it passes the SVG bytes through unchanged; otherwise it rasterizes to PNG at the
 * print DPI and flags {@link GuardedSvgAsset.rasterFallback} with the triggering reasons.
 */
export async function guardSvgForPrawn(svg: string, options: GuardOptions = {}): Promise<GuardedSvgAsset> {
  const { supported, reasons } = detectUnsupportedSvgFeatures(svg);
  if (supported) {
    return { format: FORMAT_SVG, bytes: new TextEncoder().encode(svg), rasterFallback: false, reasons: [] };
  }
  const rasterize = options.rasterize ?? rasterizeSvgToPng;
  const dpi = options.dpi ?? DEFAULT_RASTER_DPI;
  const bytes = await rasterize(svg, { dpi });
  return { format: FORMAT_PNG, bytes, rasterFallback: true, reasons };
}
