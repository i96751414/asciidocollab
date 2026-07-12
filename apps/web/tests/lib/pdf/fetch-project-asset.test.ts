import { projectAssetUrl, fetchProjectAsset } from '@/lib/pdf/fetch-project-asset';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

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
});
