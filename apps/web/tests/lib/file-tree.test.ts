// Issue 4: file-tree.ts must not define its own NEXT_PUBLIC_API_URL constant —
// the same divergence risk that was just fixed in use-auto-save.ts and
// use-file-selection.ts. It must import API_BASE_URL from lib/api/file-content.
describe('file-tree module must not duplicate API_BASE_URL', () => {
  test('file-tree.ts does not define its own NEXT_PUBLIC_API_URL expression', () => {
    const fs = require('node:fs');
    const source: string = fs.readFileSync(
      require.resolve('@/lib/api/file-tree'),
      'utf8',
    );
    expect(source).not.toContain('process.env.NEXT_PUBLIC_API_URL');
    expect(source).toContain('API_BASE_URL');
  });
});

// ── file-tree API function behaviour ─────────────────────────────────────────

function mockOk(body: unknown) {
  return Promise.resolve({ ok: true, status: 200, json: jest.fn().mockResolvedValue(body) });
}

function mockErr(status: number, body: unknown) {
  return Promise.resolve({ ok: false, status, json: jest.fn().mockResolvedValue(body) });
}

describe('createFolder', () => {
  let fetchMock: jest.Mock;
  let createFolder: typeof import('@/lib/api/file-tree').createFolder;
  let FileTreeApiError: typeof import('@/lib/api/file-tree').FileTreeApiError;

  beforeEach(() => {
    jest.resetModules();
    fetchMock = jest.fn();
    globalThis.fetch = fetchMock;
    ({ createFolder, FileTreeApiError } = require('@/lib/api/file-tree'));
  });

  test('sends POST and returns fileNodeId and path on success', async () => {
    fetchMock.mockReturnValueOnce(mockOk({ fileNodeId: 'fn1', path: '/docs' }));
    const result = await createFolder('p1', 'root', 'docs');
    expect(fetchMock.mock.calls[0][1].method).toBe('POST');
    expect(String(fetchMock.mock.calls[0][0])).toContain('/projects/p1/files');
    expect(result.fileNodeId).toBe('fn1');
  });

  test('throws FileTreeApiError on non-ok response', async () => {
    fetchMock.mockReturnValueOnce(mockErr(409, { error: { code: 'CONFLICT', message: 'Already exists' }, existingFileNodeId: 'fn0' }));
    await expect(createFolder('p1', 'root', 'docs')).rejects.toBeInstanceOf(FileTreeApiError);
  });

  test('throws FileTreeApiError with fallback code when error body is missing', async () => {
    fetchMock.mockReturnValueOnce(mockErr(500, {}));
    const error = await createFolder('p1', 'root', 'docs').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(FileTreeApiError);
    expect((error as InstanceType<typeof FileTreeApiError>).code).toBe('ERROR');
  });
});

describe('createFileNode', () => {
  let fetchMock: jest.Mock;
  let createFileNode: typeof import('@/lib/api/file-tree').createFileNode;
  let FileTreeApiError: typeof import('@/lib/api/file-tree').FileTreeApiError;

  beforeEach(() => {
    jest.resetModules();
    fetchMock = jest.fn();
    globalThis.fetch = fetchMock;
    ({ createFileNode, FileTreeApiError } = require('@/lib/api/file-tree'));
  });

  test('sends POST and returns fileNodeId and path on success', async () => {
    fetchMock.mockReturnValueOnce(mockOk({ fileNodeId: 'fn2', path: '/readme.adoc' }));
    const result = await createFileNode('p1', 'root', 'readme.adoc');
    expect(result.fileNodeId).toBe('fn2');
    expect(fetchMock.mock.calls[0][1].method).toBe('POST');
  });

  test('throws FileTreeApiError on non-ok response', async () => {
    fetchMock.mockReturnValueOnce(mockErr(403, { error: { code: 'FORBIDDEN', message: 'No permission' } }));
    await expect(createFileNode('p1', 'root', 'file.adoc')).rejects.toBeInstanceOf(FileTreeApiError);
  });
});

describe('renameFileNode', () => {
  let fetchMock: jest.Mock;
  let renameFileNode: typeof import('@/lib/api/file-tree').renameFileNode;
  let FileTreeApiError: typeof import('@/lib/api/file-tree').FileTreeApiError;

  beforeEach(() => {
    jest.resetModules();
    fetchMock = jest.fn();
    globalThis.fetch = fetchMock;
    ({ renameFileNode, FileTreeApiError } = require('@/lib/api/file-tree'));
  });

  test('sends PATCH to /projects/:id/files/:nodeId', async () => {
    fetchMock.mockReturnValueOnce(mockOk({}));
    await renameFileNode('p1', 'fn1', 'new-name.adoc');
    expect(fetchMock.mock.calls[0][1].method).toBe('PATCH');
    expect(String(fetchMock.mock.calls[0][0])).toContain('/files/fn1');
  });

  test('throws FileTreeApiError on non-ok response', async () => {
    fetchMock.mockReturnValueOnce(mockErr(404, { error: { code: 'NOT_FOUND', message: 'Node not found' } }));
    await expect(renameFileNode('p1', 'fn1', 'x')).rejects.toBeInstanceOf(FileTreeApiError);
  });
});

describe('moveFileNode', () => {
  let fetchMock: jest.Mock;
  let moveFileNode: typeof import('@/lib/api/file-tree').moveFileNode;
  let FileTreeApiError: typeof import('@/lib/api/file-tree').FileTreeApiError;

  beforeEach(() => {
    jest.resetModules();
    fetchMock = jest.fn();
    globalThis.fetch = fetchMock;
    ({ moveFileNode, FileTreeApiError } = require('@/lib/api/file-tree'));
  });

  test('sends PATCH to /projects/:id/files/:nodeId', async () => {
    fetchMock.mockReturnValueOnce(mockOk({}));
    await moveFileNode('p1', 'fn1', 'parent2');
    expect(fetchMock.mock.calls[0][1].method).toBe('PATCH');
    expect(String(fetchMock.mock.calls[0][0])).toContain('/files/fn1');
  });

  test('throws FileTreeApiError on non-ok response', async () => {
    fetchMock.mockReturnValueOnce(mockErr(409, { error: { code: 'CYCLE', message: 'Would create cycle' } }));
    await expect(moveFileNode('p1', 'fn1', 'fn1')).rejects.toBeInstanceOf(FileTreeApiError);
  });
});

describe('deleteFileNode', () => {
  let fetchMock: jest.Mock;
  let deleteFileNode: typeof import('@/lib/api/file-tree').deleteFileNode;
  let FileTreeApiError: typeof import('@/lib/api/file-tree').FileTreeApiError;

  beforeEach(() => {
    jest.resetModules();
    fetchMock = jest.fn();
    globalThis.fetch = fetchMock;
    ({ deleteFileNode, FileTreeApiError } = require('@/lib/api/file-tree'));
  });

  test('sends DELETE to /projects/:id/files/:nodeId', async () => {
    fetchMock.mockReturnValueOnce(mockOk({}));
    await deleteFileNode('p1', 'fn1');
    expect(fetchMock.mock.calls[0][1].method).toBe('DELETE');
    expect(String(fetchMock.mock.calls[0][0])).toContain('/files/fn1');
  });

  test('throws FileTreeApiError on non-ok response', async () => {
    fetchMock.mockReturnValueOnce(mockErr(403, { error: { code: 'FORBIDDEN', message: 'No permission' } }));
    await expect(deleteFileNode('p1', 'fn1')).rejects.toBeInstanceOf(FileTreeApiError);
  });
});
