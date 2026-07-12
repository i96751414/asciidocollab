import {
  DEFAULT_RASTER_DPI,
  PRAWN_SVG_UNSUPPORTED_REASONS,
  detectUnsupportedSvgFeatures,
  guardSvgForPrawn,
  rasterizeSvgToPng,
  type SvgRasterizer,
} from '@/workers/shims/prawn-svg-guard';

/** A recording fake for the browser-only canvas seam, so the routing decision stays unit-testable. */
function fakeRasterizer(): { rasterize: SvgRasterizer; calls: Array<{ svg: string; dpi: number }> } {
  const calls: Array<{ svg: string; dpi: number }> = [];
  const rasterize: SvgRasterizer = async (svg, options) => {
    calls.push({ svg, dpi: options.dpi });
    // PNG magic number — stand-in bytes; the real canvas render is exercised only in a browser.
    return new Uint8Array([0x89, 0x50, 0x4E, 0x47]);
  };
  return { rasterize, calls };
}

const PLAIN_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80" viewBox="0 0 120 80">' +
  '<text x="10" y="20">Node</text>' +
  '<path d="M0 0 L10 10" stroke="black"/>' +
  '</svg>';

describe('detectUnsupportedSvgFeatures — prawn-svg-unsupported construct scan', () => {
  test('plain SVG with text and paths is supported (no reasons)', () => {
    const result = detectUnsupportedSvgFeatures(PLAIN_SVG);
    expect(result.supported).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  test('a supported linearGradient stays supported', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg"><defs>' +
      '<linearGradient id="g"><stop offset="0" stop-color="red"/><stop offset="1" stop-color="blue"/></linearGradient>' +
      '</defs><rect fill="url(#g)" width="10" height="10"/></svg>';
    expect(detectUnsupportedSvgFeatures(svg).supported).toBe(true);
  });

  test('a simple concentric radialGradient stays supported', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg"><defs>' +
      '<radialGradient id="g" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="red"/></radialGradient>' +
      '</defs><circle fill="url(#g)" r="5"/></svg>';
    expect(detectUnsupportedSvgFeatures(svg).supported).toBe(true);
  });

  test('a clipPath containing only a rect stays supported', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg"><clipPath id="c"><rect x="0" y="0" width="10" height="10"/></clipPath></svg>';
    expect(detectUnsupportedSvgFeatures(svg).supported).toBe(true);
  });

  test('the word "filter" inside an id does not false-trigger', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><g id="unfiltered-layer"><text>ok</text></g></svg>';
    expect(detectUnsupportedSvgFeatures(svg).supported).toBe(true);
  });

  test('foreignObject is unsupported (foreign-object reason)', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><div xmlns="http://www.w3.org/1999/xhtml">x</div></foreignObject></svg>';
    const result = detectUnsupportedSvgFeatures(svg);
    expect(result.supported).toBe(false);
    expect(result.reasons).toContain(PRAWN_SVG_UNSUPPORTED_REASONS.foreignObject);
  });

  test('a <filter> element is unsupported', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><filter id="f"><feGaussianBlur stdDeviation="2"/></filter></svg>';
    const result = detectUnsupportedSvgFeatures(svg);
    expect(result.supported).toBe(false);
    expect(result.reasons).toContain(PRAWN_SVG_UNSUPPORTED_REASONS.filter);
  });

  test('a filter= attribute is unsupported', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><rect filter="url(#f)" width="10" height="10"/></svg>';
    const result = detectUnsupportedSvgFeatures(svg);
    expect(result.supported).toBe(false);
    expect(result.reasons).toContain(PRAWN_SVG_UNSUPPORTED_REASONS.filter);
  });

  test('a CSS filter: property is unsupported', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><style>.a{filter:blur(2px)}</style><rect class="a"/></svg>';
    expect(detectUnsupportedSvgFeatures(svg).supported).toBe(false);
  });

  test('a <pattern> fill is unsupported (gradient-or-pattern reason)', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg"><defs><pattern id="p" width="4" height="4"><rect width="2" height="2"/></pattern></defs>' +
      '<rect fill="url(#p)" width="10" height="10"/></svg>';
    const result = detectUnsupportedSvgFeatures(svg);
    expect(result.supported).toBe(false);
    expect(result.reasons).toContain(PRAWN_SVG_UNSUPPORTED_REASONS.gradientOrPattern);
  });

  test('a radialGradient with a focal point (fx/fy) is beyond the supported set', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg"><defs>' +
      '<radialGradient id="g" cx="0.5" cy="0.5" r="0.5" fx="0.2" fy="0.3"><stop offset="0" stop-color="red"/></radialGradient>' +
      '</defs></svg>';
    const result = detectUnsupportedSvgFeatures(svg);
    expect(result.supported).toBe(false);
    expect(result.reasons).toContain(PRAWN_SVG_UNSUPPORTED_REASONS.gradientOrPattern);
  });

  test('a gradient with spreadMethod reflect/repeat is beyond the supported set', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg"><defs>' +
      '<linearGradient id="g" spreadMethod="reflect"><stop offset="0"/></linearGradient></defs></svg>';
    expect(detectUnsupportedSvgFeatures(svg).supported).toBe(false);
  });

  test('a clipPath containing a non-rect child is unsupported (clip-path reason)', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg"><clipPath id="c"><circle cx="5" cy="5" r="5"/></clipPath></svg>';
    const result = detectUnsupportedSvgFeatures(svg);
    expect(result.supported).toBe(false);
    expect(result.reasons).toContain(PRAWN_SVG_UNSUPPORTED_REASONS.clipPath);
  });

  test('multiple triggers accumulate distinct reasons', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg">' +
      '<foreignObject><div>x</div></foreignObject>' +
      '<rect filter="url(#f)"/>' +
      '<clipPath id="c"><path d="M0 0"/></clipPath>' +
      '</svg>';
    const result = detectUnsupportedSvgFeatures(svg);
    expect(result.supported).toBe(false);
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        PRAWN_SVG_UNSUPPORTED_REASONS.foreignObject,
        PRAWN_SVG_UNSUPPORTED_REASONS.filter,
        PRAWN_SVG_UNSUPPORTED_REASONS.clipPath,
      ]),
    );
    // reasons are de-duplicated
    expect(new Set(result.reasons).size).toBe(result.reasons.length);
  });
});

describe('guardSvgForPrawn — SVG-first, raster-fallback routing', () => {
  test('supported SVG returns svg bytes without invoking the rasterizer', async () => {
    const { rasterize, calls } = fakeRasterizer();
    const asset = await guardSvgForPrawn(PLAIN_SVG, { dpi: 200, rasterize });
    expect(asset.format).toBe('svg');
    expect(asset.rasterFallback).toBe(false);
    expect(asset.reasons).toEqual([]);
    expect(asset.bytes).toEqual(new TextEncoder().encode(PLAIN_SVG));
    expect(calls).toHaveLength(0);
  });

  test('unsupported SVG is rasterized to PNG with the given DPI and carries reasons', async () => {
    const { rasterize, calls } = fakeRasterizer();
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><div>x</div></foreignObject></svg>';
    const asset = await guardSvgForPrawn(svg, { dpi: 200, rasterize });
    expect(asset.format).toBe('png');
    expect(asset.rasterFallback).toBe(true);
    expect(asset.reasons).toContain(PRAWN_SVG_UNSUPPORTED_REASONS.foreignObject);
    expect(asset.bytes).toEqual(new Uint8Array([0x89, 0x50, 0x4E, 0x47]));
    expect(calls).toEqual([{ svg, dpi: 200 }]);
  });

  test('DPI defaults to the print-fidelity constant when omitted', async () => {
    const { rasterize, calls } = fakeRasterizer();
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><rect filter="url(#f)"/></svg>';
    await guardSvgForPrawn(svg, { rasterize });
    expect(calls[0]?.dpi).toBe(DEFAULT_RASTER_DPI);
  });

  test('falls back to the real canvas rasterizer when no seam is injected', async () => {
    const canvas = installCanvasMocks();
    try {
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><foreignObject/></svg>';
      const asset = await guardSvgForPrawn(svg);
      expect(asset.format).toBe('png');
      expect(asset.rasterFallback).toBe(true);
      // The default DPI scales the 120x80 user-unit box onto the device canvas.
      expect(canvas.records[0]).toEqual({
        width: Math.round((120 * DEFAULT_RASTER_DPI) / 96),
        height: Math.round((80 * DEFAULT_RASTER_DPI) / 96),
      });
    } finally {
      canvas.uninstall();
    }
  });
});

// --- rasterizeSvgToPng — the real canvas render over mocked browser APIs -------------------------

interface CanvasSizeRecord {
  readonly width: number;
  readonly height: number;
}

/** A mutable view of the two browser globals the rasterizer relies on. */
interface GlobalCanvasApis {
  OffscreenCanvas?: unknown;
  createImageBitmap?: unknown;
}

/**
 * Install in-memory stand-ins for `OffscreenCanvas` and `createImageBitmap` so the real
 * {@link rasterizeSvgToPng} sizing and drawing path runs under the unit-test runtime.
 */
function installCanvasMocks(options: { readonly contextNull?: boolean } = {}) {
  const records: CanvasSizeRecord[] = [];
  const drawImageCalls: unknown[][] = [];
  const bitmapClose = jest.fn();

  class FakeOffscreenCanvas {
    constructor(
      public readonly width: number,
      public readonly height: number,
    ) {
      records.push({ width, height });
    }

    getContext(_kind: string): unknown {
      if (options.contextNull) return null;
      return { drawImage: (...drawArguments: unknown[]) => void drawImageCalls.push(drawArguments) };
    }

    convertToBlob(): Promise<{ arrayBuffer: () => Promise<ArrayBuffer> }> {
      const bytes = new Uint8Array([0x89, 0x50, 0x4E, 0x47]);
      return Promise.resolve({ arrayBuffer: () => Promise.resolve(bytes.buffer) });
    }
  }

  const createImageBitmap = jest.fn(() => Promise.resolve({ close: bitmapClose, width: 1, height: 1 }));
  const globalApis = globalThis as unknown as GlobalCanvasApis;
  globalApis.OffscreenCanvas = FakeOffscreenCanvas;
  globalApis.createImageBitmap = createImageBitmap;

  return {
    records,
    drawImageCalls,
    bitmapClose,
    createImageBitmap,
    uninstall: () => {
      delete globalApis.OffscreenCanvas;
      delete globalApis.createImageBitmap;
    },
  };
}

describe('rasterizeSvgToPng — canvas render over mocked browser APIs', () => {
  const globalApis = globalThis as unknown as GlobalCanvasApis;

  afterEach(() => {
    delete globalApis.OffscreenCanvas;
    delete globalApis.createImageBitmap;
  });

  test('throws when the browser canvas APIs are unavailable', async () => {
    delete globalApis.OffscreenCanvas;
    delete globalApis.createImageBitmap;
    await expect(rasterizeSvgToPng('<svg/>', { dpi: 300 })).rejects.toThrow(/OffscreenCanvas/);
  });

  test('sizes the canvas from explicit width/height scaled by the DPI', async () => {
    const canvas = installCanvasMocks();
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"/>';
    const bytes = await rasterizeSvgToPng(svg, { dpi: 192 });
    // scale = 192 / 96 = 2, so 120x80 user units become a 240x160 device canvas.
    expect(canvas.records[0]).toEqual({ width: 240, height: 160 });
    expect(bytes).toEqual(new Uint8Array([0x89, 0x50, 0x4E, 0x47]));
    expect(canvas.drawImageCalls).toHaveLength(1);
    // The decoded bitmap is always released.
    expect(canvas.bitmapClose).toHaveBeenCalledTimes(1);
  });

  test('sizes the canvas from the viewBox when width/height are absent', async () => {
    const canvas = installCanvasMocks();
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 25"/>';
    await rasterizeSvgToPng(svg, { dpi: 96 });
    expect(canvas.records[0]).toEqual({ width: 50, height: 25 });
  });

  test('falls back to a square canvas when the SVG carries no intrinsic size', async () => {
    const canvas = installCanvasMocks();
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"/>';
    await rasterizeSvgToPng(svg, { dpi: 96 });
    // The 300x300 user-unit fallback, unscaled at 96 DPI.
    expect(canvas.records[0]).toEqual({ width: 300, height: 300 });
  });

  test('never sizes the canvas below a single device pixel', async () => {
    const canvas = installCanvasMocks();
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="0.1" height="0.1"/>';
    await rasterizeSvgToPng(svg, { dpi: 1 });
    expect(canvas.records[0]).toEqual({ width: 1, height: 1 });
  });

  test('throws and still releases the bitmap when no 2d context can be acquired', async () => {
    const canvas = installCanvasMocks({ contextNull: true });
    await expect(
      rasterizeSvgToPng('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>', { dpi: 96 }),
    ).rejects.toThrow(/2d canvas context/);
    expect(canvas.bitmapClose).toHaveBeenCalledTimes(1);
  });
});
