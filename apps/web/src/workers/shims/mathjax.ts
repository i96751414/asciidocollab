// The MathJax math shim: turns one block of inert TeX/LaTeX or AsciiMath source into a
// prawn-svg-friendly, fully self-contained SVG asset for the client-side PDF export pipeline.
//
// It implements the environment-agnostic `RenderShim` port from `@asciidocollab/asciidoc-pdf`, so the
// pre-processing pipeline drives it without importing any DOM API. The actual MathJax engine call is
// isolated behind an injectable {@link MathSvgConverter} seam: the composition root wires the real,
// browser-only converter (self-hosted MathJax 3, SVG output), while unit tests inject an in-memory
// fake. Malformed source or an engine failure is returned as a `malformed-math` diagnostic — this
// shim never throws across the boundary and never performs network I/O.
//
// Offline by construction (Constitution VI/VIII/IX): the browser converter loads MathJax from the web
// app's OWN `public/vendor/mathjax/` (copied from the `mathjax` npm package at build time by
// scripts/build-mathjax-assets.mjs) via a real same-origin `<script>` tag, mirroring the preview
// renderer in src/components/math/render-math.ts. No CDN, no font URL, no network.
//
// Notation handling mirrors that preview renderer's TeX/AsciiMath split: the diagrams-math pipeline
// stage tags each block with its AsciiDoc notation (`latexmath`/`asciimath`/`stem`) in `params`, and
// this shim maps that to the TeX or AsciiMath input jax. Per Asciidoctor, an unqualified `stem` block
// defaults to AsciiMath.

import mathjaxPackage from 'mathjax/package.json';

import type { DiagnosticCode, RenderShim, ShimAssetFormat, ShimInput, ShimKind, ShimOutput } from '@asciidocollab/asciidoc-pdf';

// ---------------------------------------------------------------------------
// Shim identity, output format, and diagnostic code (named — never bare literals).
// ---------------------------------------------------------------------------

/** This shim's family. */
const SHIM_KIND: ShimKind = 'math';

/** The concrete engine name; also the key the diagrams-math stage resolves the math shim by. */
const SHIM_NAME = 'mathjax';

/** The format this shim emits. SVG-first; the separate raster-fallback guard handles PNG downgrades. */
const OUTPUT_FORMAT: ShimAssetFormat = 'svg';

/** The diagnostic returned when the source is not renderable math. */
const MALFORMED_MATH: DiagnosticCode = 'malformed-math';

// ---------------------------------------------------------------------------
// Render params (set by the diagrams-math pipeline stage) this shim reads.
// ---------------------------------------------------------------------------

/** Render param naming the block's AsciiDoc math notation (`latexmath`/`asciimath`/`stem`). */
export const MATH_NOTATION_PARAM = 'asciidoc-block-notation';

/** Render param carrying block(display) vs inline layout: `'true'` (default) renders display math. */
export const MATH_DISPLAY_PARAM = 'asciidoc-math-display';

/** The param value that selects display layout. */
const DISPLAY_VALUE = 'true';

// ---------------------------------------------------------------------------
// Notation model — mirrors the preview renderer's `Notation` split.
// ---------------------------------------------------------------------------

/** The math input notation MathJax converts — selects the TeX vs AsciiMath input jax. */
export type MathNotation = 'tex' | 'asciimath';

/** AsciiDoc notation param values that map to a specific MathJax input jax. */
const NOTATION_BY_PARAM: Readonly<Record<string, MathNotation>> = Object.freeze({
  latexmath: 'tex',
  asciimath: 'asciimath',
});

/** Asciidoctor treats an unqualified `stem` (and any unknown notation) as AsciiMath. */
const DEFAULT_NOTATION: MathNotation = 'asciimath';

function resolveNotation(parameters: Readonly<Record<string, string>>): MathNotation {
  const raw = parameters[MATH_NOTATION_PARAM]?.toLowerCase();
  if (raw !== undefined && raw in NOTATION_BY_PARAM) {
    return NOTATION_BY_PARAM[raw];
  }
  return DEFAULT_NOTATION;
}

function resolveDisplay(parameters: Readonly<Record<string, string>>): boolean {
  const raw = parameters[MATH_DISPLAY_PARAM]?.toLowerCase();
  return raw === undefined ? true : raw === DISPLAY_VALUE;
}

// ---------------------------------------------------------------------------
// The engine seam.
// ---------------------------------------------------------------------------

/** One inert math expression to convert, with the notation and layout it should render in. */
export interface MathConversion {
  /** The raw math source, treated purely as data (delimiters already stripped by the caller). */
  readonly expression: string;
  /** Which MathJax input jax converts it. */
  readonly notation: MathNotation;
  /** True for block (display) layout, false for inline. */
  readonly display: boolean;
}

/**
 * The seam that turns one inert math expression into a standalone SVG document string. The default
 * implementation ({@link createBrowserMathSvgConverter}) drives self-hosted MathJax 3 and is
 * BROWSER-ONLY; unit tests inject an in-memory fake so the shim contract is testable without a browser.
 */
export interface MathSvgConverter {
  /**
   * Convert one expression to a serialized `<svg>…</svg>` string. May reject on a MathJax failure.
   *
   * @param conversion - The inert math expression, its input format, and its display mode.
   * @returns The serialized standalone SVG document string.
   */
  toSvg(conversion: MathConversion): Promise<string>;
}

/** Dependencies for {@link createMathJaxShim} — the composition root injects the browser converter. */
export interface MathJaxShimDeps {
  /** The engine seam that produces SVG from math source. */
  readonly converter: MathSvgConverter;
}

// ---------------------------------------------------------------------------
// Offline MathJax configuration (self-hosted, no external resource fetch).
// ---------------------------------------------------------------------------

/** Base URL of the self-hosted MathJax bundle (same-origin, copied into public/ at build). */
const MATHJAX_BASE = '/vendor/mathjax';

/** The SVG-output entry bundle: TeX + MathML input, SVG output, plus the loader/startup. */
export const MATHJAX_SVG_SCRIPT = `${MATHJAX_BASE}/tex-mml-svg.js`;

/** Loader component id for the AsciiMath input jax, fetched same-origin from the bundle base. */
const ASCIIMATH_INPUT_COMPONENT = 'input/asciimath';

/**
 * The offline MathJax 3 configuration installed before the bundle script runs. It performs no network
 * I/O: inputs/output come from the self-hosted bundle, `loader.load` fetches the AsciiMath jax from the
 * same same-origin base (MathJax derives the base from the script `src`), page-wide auto-typeset is
 * disabled (we convert per expression), and `svg.fontCache: 'local'` makes every produced SVG embed its
 * own glyph paths so a standalone SVG file is self-contained.
 */
export interface OfflineMathJaxConfig {
  /** The TeX input delimiters for inline and display math (Asciidoctor's latexmath markup). */
  readonly tex: {
    readonly inlineMath: readonly (readonly string[])[];
    readonly displayMath: readonly (readonly string[])[];
  };
  /** The AsciiMath input delimiters (Asciidoctor's asciimath markup). */
  readonly asciimath: { readonly delimiters: readonly (readonly string[])[] };
  /** The extra input-jax components loaded same-origin from the self-hosted bundle base. */
  readonly loader: { readonly load: readonly string[] };
  /** The startup options; page-wide auto-typeset is disabled because we convert per expression. */
  readonly startup: { readonly typeset: boolean };
  /** The SVG output options; a local font cache makes every produced SVG self-contained. */
  readonly svg: { readonly fontCache: 'local' };
}

/** Build the offline MathJax configuration (see {@link OfflineMathJaxConfig}). */
export function createOfflineMathJaxConfig(): OfflineMathJaxConfig {
  return {
    // TeX (latexmath): standard inline `\(…\)` and display `\[…\]` delimiters (Asciidoctor's markup).
    tex: {
      inlineMath: [[String.raw`\(`, String.raw`\)`]],
      displayMath: [[String.raw`\[`, String.raw`\]`]],
    },
    // AsciiMath: Asciidoctor wraps asciimath in `\$…\$`.
    asciimath: { delimiters: [[String.raw`\$`, String.raw`\$`]] },
    // The SVG bundle does not include the AsciiMath input jax — fetch it from the same self-hosted base.
    loader: { load: [ASCIIMATH_INPUT_COMPONENT] },
    // We convert each expression explicitly, so disable the page-wide auto-typeset on startup.
    startup: { typeset: false },
    // Per-expression local font cache → each standalone SVG embeds its own glyphs (no shared page defs).
    svg: { fontCache: 'local' },
  };
}

// ---------------------------------------------------------------------------
// The default browser converter (BROWSER-ONLY — not exercised by the node unit tests).
// ---------------------------------------------------------------------------

/** A MathJax SVG conversion helper exposed by the bundle after startup. */
type SvgConvert = (math: string, options: { readonly display: boolean }) => Promise<Element>;

/** Minimal structural shape of the MathJax 3 global once the SVG bundle has started up. */
interface MathJaxSvgApi {
  /** Convert a TeX (latexmath) expression to an `mjx-container` holding the produced `<svg>`. */
  readonly tex2svgPromise: SvgConvert;
  /** Convert an AsciiMath expression to an `mjx-container` holding the produced `<svg>`. */
  readonly asciimath2svgPromise: SvgConvert;
  /** Startup handshake (component loading + document build) exposed by the component bundle. */
  readonly startup?: { readonly promise?: Promise<unknown> };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isSvgApi(value: unknown): value is MathJaxSvgApi {
  return (
    isRecord(value) &&
    typeof value.tex2svgPromise === 'function' &&
    typeof value.asciimath2svgPromise === 'function'
  );
}

/**
 * Structural view of the global object's MathJax handle, so this module reads/writes it without
 * re-declaring the cross-module `var MathJax` global augmentation that render-math.ts already owns.
 */
function globalHandle(): { MathJax?: unknown } {
  return globalThis;
}

/** Install the offline configuration onto the MathJax global before the bundle script runs. */
function installOfflineConfig(): void {
  const handle = globalHandle();
  const existing = handle.MathJax;
  handle.MathJax = { ...(isRecord(existing) ? existing : {}), ...createOfflineMathJaxConfig() };
}

/** Await the startup handshake (if present) and return the ready SVG API, or undefined. */
async function readSvgApiAfterStartup(): Promise<MathJaxSvgApi | undefined> {
  const startup = isRecord(globalHandle().MathJax) ? globalHandle().MathJax : undefined;
  if (isRecord(startup) && isRecord(startup.startup) && startup.startup.promise instanceof Promise) {
    await startup.startup.promise;
  }
  const ready = globalHandle().MathJax;
  return isSvgApi(ready) ? ready : undefined;
}

/** Inject the self-hosted SVG bundle and resolve once MathJax is ready (browser-only). */
function injectSvgMathJax(): Promise<MathJaxSvgApi | undefined> {
  installOfflineConfig();
  return new Promise<MathJaxSvgApi | undefined>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = MATHJAX_SVG_SCRIPT;
    script.async = true;
    script.addEventListener('load', () => {
      readSvgApiAfterStartup().then(resolve, reject);
    }, { once: true });
    script.addEventListener(
      'error',
      () => reject(new Error(`Failed to load MathJax from ${MATHJAX_SVG_SCRIPT}`)),
      { once: true },
    );
    document.head.append(script);
  });
}

/**
 * The production converter: lazily loads self-hosted MathJax 3 (SVG output) and serializes each
 * expression to an SVG document string. BROWSER-ONLY — it needs a DOM to inject the `<script>` and
 * serialize the result, so it is verified in a real browser/integration test, not the node unit suite.
 */
function createBrowserMathSvgConverter(): MathSvgConverter {
  let load: Promise<MathJaxSvgApi | undefined> | null = null;
  const ready = (): Promise<MathJaxSvgApi | undefined> => {
    if (load) {
      return load;
    }
    // No DOM (SSR / worker with no document): the browser converter cannot run here.
    if (typeof document === 'undefined') {
      return Promise.resolve(undefined);
    }
    load = injectSvgMathJax();
    // On failure, drop the cached promise so a later call can retry a transient load error.
    load.catch(() => {
      load = null;
    });
    return load;
  };

  return {
    async toSvg({ expression, notation, display }: MathConversion): Promise<string> {
      const api = await ready();
      if (api === undefined) {
        throw new Error('MathJax is unavailable in this environment.');
      }
      const convert = notation === 'asciimath' ? api.asciimath2svgPromise : api.tex2svgPromise;
      const container = await convert(expression, { display });
      const svg = container.querySelector('svg');
      if (svg === null) {
        throw new Error('MathJax produced no SVG element for the expression.');
      }
      return new XMLSerializer().serializeToString(svg);
    },
  };
}

// ---------------------------------------------------------------------------
// The shim.
// ---------------------------------------------------------------------------

function malformed(message: string): ShimOutput {
  return { ok: false, diagnostic: { code: MALFORMED_MATH, message } };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function renderMath(converter: MathSvgConverter, input: ShimInput): Promise<ShimOutput> {
  const expression = input.source.trim();
  if (expression.length === 0) {
    return malformed('Empty math source.');
  }
  try {
    const rendered = await converter.toSvg({
      expression,
      notation: resolveNotation(input.params),
      display: resolveDisplay(input.params),
    });
    const svg = rendered.trim();
    if (svg.length === 0) {
      return malformed('MathJax produced no SVG output for the expression.');
    }
    return {
      ok: true,
      asset: { format: OUTPUT_FORMAT, bytes: new TextEncoder().encode(svg), rasterFallback: false },
    };
  } catch (error) {
    return malformed(messageOf(error));
  }
}

/**
 * Build the MathJax math {@link RenderShim}. With no arguments it uses the browser converter
 * (self-hosted MathJax 3, SVG output) at the composition root; tests inject an in-memory converter.
 */
export function createMathJaxShim(dependencies?: MathJaxShimDeps): RenderShim {
  const converter = dependencies?.converter ?? createBrowserMathSvgConverter();
  return {
    kind: SHIM_KIND,
    name: SHIM_NAME,
    version: mathjaxPackage.version,
    render: (input) => renderMath(converter, input),
  };
}
