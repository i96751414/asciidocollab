/* eslint-disable @typescript-eslint/no-explicit-any -- installs canvas globals absent in the node runtime. */
import { projectAssetUrl, fetchProjectAsset } from '@/lib/pdf/fetch-project-asset';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/** The bytes the mocked canvas re-encodes any raster image to. */
const REENCODED = new Uint8Array([9, 8, 7]);

/** Install canvas globals so the raster-normalisation path runs; `getContext` is configurable. */
function installCanvas(options: { context?: unknown } = {}): {
  close: jest.Mock;
  blobTypes: string[];
} {
  const close = jest.fn();
  const blobTypes: string[] = [];
  (globalThis as any).createImageBitmap = jest.fn(async () => ({ width: 2, height: 2, close }));
  (globalThis as any).OffscreenCanvas = class {
    constructor(public width: number, public height: number) {}
    getContext(): unknown {
      return options.context === undefined ? { drawImage: jest.fn() } : options.context;
    }
    convertToBlob(blobOptions?: { type?: string }): Promise<{ arrayBuffer: () => Promise<ArrayBuffer> }> {
      blobTypes.push(blobOptions?.type ?? '');
      const buffer = new ArrayBuffer(REENCODED.length);
      new Uint8Array(buffer).set(REENCODED);
      return Promise.resolve({ arrayBuffer: async () => buffer });
    }
  };
  return { close, blobTypes };
}

function uninstallCanvas(): void {
  delete (globalThis as any).createImageBitmap;
  delete (globalThis as any).OffscreenCanvas;
}

/** A minimal fetch Response stub for an asset request. */
function assetResponse(ok: boolean, status: number, bytes?: Uint8Array): Response {
  return {
    ok,
    status,
    arrayBuffer: async () => (bytes ?? new Uint8Array()).buffer,
  } as unknown as Response;
}

describe('projectAssetUrl', () => {
  it('percent-encodes each path segment while preserving separators', () => {
    expect(projectAssetUrl('p1', 'New Folder/Screenshot_20260608_164409.png')).toBe(
      `${API_BASE}/projects/p1/images/New%20Folder/Screenshot_20260608_164409.png`,
    );
  });

  it('encodes reserved characters within a segment', () => {
    expect(projectAssetUrl('p1', 'a&b/c d.png')).toBe(`${API_BASE}/projects/p1/images/a%26b/c%20d.png`);
  });
});

describe('fetchProjectAsset', () => {
  const originalFetch = globalThis.fetch;
  const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  afterEach(() => {
    globalThis.fetch = originalFetch;
    warnSpy.mockClear();
  });
  afterAll(() => warnSpy.mockRestore());

  it('returns the asset bytes on a successful fetch', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    globalThis.fetch = jest.fn(async () => assetResponse(true, 200, bytes)) as never;
    const result = await fetchProjectAsset('p1', 'New Folder/x.png');
    expect(result).toEqual(bytes);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      `${API_BASE}/projects/p1/images/New%20Folder/x.png`,
      { credentials: 'include' },
    );
  });

  it('warns and returns null on a non-OK response (one missing image must not break the export)', async () => {
    globalThis.fetch = jest.fn(async () => assetResponse(false, 404)) as never;
    const result = await fetchProjectAsset('p1', 'missing.png');
    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
  });

  it('warns and returns null when the network request throws', async () => {
    globalThis.fetch = jest.fn(async () => {
      throw new Error('offline');
    }) as never;
    const result = await fetchProjectAsset('p1', 'x.png');
    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
  });

  describe('raster-image normalisation', () => {
    afterEach(() => uninstallCanvas());

    it('re-encodes a PNG to a clean PNG via canvas when available', async () => {
      const { blobTypes } = installCanvas();
      globalThis.fetch = jest.fn(async () => assetResponse(true, 200, new Uint8Array([1, 2, 3]))) as never;

      const result = await fetchProjectAsset('p1', 'New Folder/shot.png');

      expect(result).toEqual(REENCODED);
      expect((globalThis as any).createImageBitmap).toHaveBeenCalledTimes(1);
      expect(blobTypes).toEqual(['image/png']);
    });

    it('re-encodes a JPEG back to baseline JPEG, never PNG (a photo balloons as PNG past the size guard)', async () => {
      const { blobTypes } = installCanvas();
      globalThis.fetch = jest.fn(async () => assetResponse(true, 200, new Uint8Array([0xFF, 0xD8, 0xFF]))) as never;

      const result = await fetchProjectAsset('p1', 'photos/holiday.jpg');

      expect(result).toEqual(REENCODED);
      expect(blobTypes).toEqual(['image/jpeg']);
    });

    it('leaves a webp untouched — the PDF image-guard rejects it, so normalising is pointless', async () => {
      installCanvas();
      const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46]);
      globalThis.fetch = jest.fn(async () => assetResponse(true, 200, webp)) as never;

      const result = await fetchProjectAsset('p1', 'diagram.webp');

      expect(result).toEqual(webp);
      expect((globalThis as any).createImageBitmap).not.toHaveBeenCalled();
    });

    it('leaves an SVG untouched (vector — never rasterised)', async () => {
      installCanvas();
      const svg = new Uint8Array([60, 115, 118, 103]);
      globalThis.fetch = jest.fn(async () => assetResponse(true, 200, svg)) as never;

      const result = await fetchProjectAsset('p1', 'diagram.svg');

      expect(result).toEqual(svg);
      expect((globalThis as any).createImageBitmap).not.toHaveBeenCalled();
    });

    it('leaves a non-image asset (font) untouched', async () => {
      installCanvas();
      const ttf = new Uint8Array([0, 1, 0, 0]);
      globalThis.fetch = jest.fn(async () => assetResponse(true, 200, ttf)) as never;

      const result = await fetchProjectAsset('p1', 'fonts/Brand.ttf');

      expect(result).toEqual(ttf);
      expect((globalThis as any).createImageBitmap).not.toHaveBeenCalled();
    });

    it('falls back to the original bytes when the image cannot be decoded', async () => {
      installCanvas();
      (globalThis as any).createImageBitmap = jest.fn(async () => {
        throw new Error('undecodable');
      });
      const original = new Uint8Array([5, 6, 7]);
      globalThis.fetch = jest.fn(async () => assetResponse(true, 200, original)) as never;

      const result = await fetchProjectAsset('p1', 'broken.png');

      expect(result).toEqual(original);
    });

    it('falls back to the original bytes when a 2D context is unavailable', async () => {
      const { close } = installCanvas({ context: null });
      const original = new Uint8Array([5, 6, 7]);
      globalThis.fetch = jest.fn(async () => assetResponse(true, 200, original)) as never;

      const result = await fetchProjectAsset('p1', 'shot.png');

      expect(result).toEqual(original);
      expect(close).toHaveBeenCalledTimes(1);
    });
  });
});
