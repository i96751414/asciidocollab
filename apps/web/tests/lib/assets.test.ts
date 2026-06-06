function mockOk(body: unknown) {
  return Promise.resolve({ ok: true, status: 200, json: jest.fn().mockResolvedValue(body) });
}

function mockErr(status: number, body: unknown) {
  return Promise.resolve({ ok: false, status, json: jest.fn().mockResolvedValue(body) });
}

describe('uploadAsset', () => {
  let fetchMock: jest.Mock;
  let uploadAsset: typeof import('@/lib/api/assets').uploadAsset;

  beforeEach(() => {
    jest.resetModules();
    fetchMock = jest.fn();
    globalThis.fetch = fetchMock;
    ({ uploadAsset } = require('@/lib/api/assets'));
  });

  function makeFile(name: string, type: string, size: number): File {
    const blob = new Blob(['x'.repeat(size)], { type });
    return new File([blob], name, { type });
  }

  test('sends multipart POST and returns AssetMetadata on success', async () => {
    fetchMock.mockReturnValueOnce(
      mockOk({ assetId: 'a1', storagePath: '/uploads/img.png' }),
    );
    const file = makeFile('img.png', 'image/png', 1024);
    const result = await uploadAsset('p1', 'folder1', file);

    expect(fetchMock.mock.calls[0][1].method).toBe('POST');
    expect(String(fetchMock.mock.calls[0][0])).toContain('/projects/p1/assets');
    expect(String(fetchMock.mock.calls[0][0])).toContain('parentId=folder1');
    expect(result.assetId).toBe('a1');
    expect(result.filename).toBe('img.png');
    expect(result.mimeType).toBe('image/png');
    expect(result.sizeBytes).toBe(1024);
  });

  test('throws an error with status and code on non-ok response', async () => {
    fetchMock.mockReturnValueOnce(
      mockErr(413, { error: { code: 'FILE_TOO_LARGE', message: 'File exceeds limit' } }),
    );
    const file = makeFile('big.png', 'image/png', 99_999_999);
    const error = await uploadAsset('p1', 'folder1', file).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error & { status?: number }).status).toBe(413);
    expect((error as Error & { code?: string }).code).toBe('FILE_TOO_LARGE');
  });

  test('falls back to generic error message when error body is empty', async () => {
    fetchMock.mockReturnValueOnce(mockErr(500, {}));
    const file = makeFile('file.png', 'image/png', 100);
    const error = await uploadAsset('p1', 'f', file).catch((e: unknown) => e);
    expect((error as Error).message).toContain('500');
  });

  test('falls back to empty object when json() rejects on error response', async () => {
    fetchMock.mockReturnValueOnce(
      Promise.resolve({
        ok: false,
        status: 500,
        json: jest.fn().mockRejectedValue(new Error('parse error')),
      }),
    );
    const file = makeFile('file.png', 'image/png', 100);
    const error = await uploadAsset('p1', 'f', file).catch((e: unknown) => e);
    expect((error as Error).message).toContain('500');
  });
});
