// Tests for apps/web/src/lib/api/projects.ts
import { setProjectMainFile, findSymbolUsages, renameSymbol } from '@/lib/api/projects';

const mockFetch = jest.fn();
globalThis.fetch = mockFetch;

beforeEach(() => {
  mockFetch.mockReset();
});

describe('setProjectMainFile', () => {
  test('sends PUT with credentials + body to the main-file endpoint', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: { id: 'p1', mainFileNodeId: 'f1' } }),
    });
    await setProjectMainFile('p1', 'f1');
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/projects/p1/main-file');
    expect(options.method).toBe('PUT');
    expect(options.credentials).toBe('include');
    expect(JSON.parse(options.body as string)).toEqual({ mainFileNodeId: 'f1' });
  });

  test('returns the updated project DTO', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: { id: 'p1', mainFileNodeId: 'f1' } }),
    });
    const project = await setProjectMainFile('p1', 'f1');
    expect(project).toEqual({ id: 'p1', mainFileNodeId: 'f1' });
  });

  test('sends null to clear the main file', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: { id: 'p1', mainFileNodeId: null } }),
    });
    await setProjectMainFile('p1', null);
    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(options.body as string)).toEqual({ mainFileNodeId: null });
  });

  test('throws with status + code on a 403 (use-case PermissionDenied)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: () => Promise.resolve({ error: { code: 'FORBIDDEN', message: 'Permission denied' } }),
    });
    await expect(setProjectMainFile('p1', 'f1')).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
  });

  test('throws with the contract code on a 400 (non-adoc)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: { code: 'MainFileNotAsciiDoc', message: 'not adoc' } }),
    });
    await expect(setProjectMainFile('p1', 'f1')).rejects.toMatchObject({ status: 400, code: 'MainFileNotAsciiDoc' });
  });
});

describe('findSymbolUsages', () => {
  test('GETs the symbol-usages endpoint with the URL-encoded name and returns the usages', async () => {
    const usages = [{ fileNodeId: 'f1', path: 'a.adoc', kind: 'xref', range: { from: 1, to: 5 } }];
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ data: { usages } }) });
    const result = await findSymbolUsages('p1', 'my id');
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/projects/p1/symbol-usages?name=my%20id');
    expect(options.credentials).toBe('include');
    expect(result).toEqual(usages);
  });

  test('appends the kind query param when a symbol kind is given', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ data: { usages: [] } }) });
    await findSymbolUsages('p1', 'intro', 'attribute');
    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('name=intro');
    expect(url).toContain('kind=attribute');
  });

  test('throws with status + code on a 403', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: () => Promise.resolve({ error: { code: 'FORBIDDEN', message: 'denied' } }),
    });
    await expect(findSymbolUsages('p1', 'x')).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
  });
});

describe('renameSymbol', () => {
  test('POSTs the rename body and returns the outcome', async () => {
    const outcome = { rewrittenFiles: 2, updatedReferences: 3, warnings: [] };
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ data: outcome }) });
    const result = await renameSymbol('p1', { symbolKind: 'anchor', oldName: 'intro', newName: 'overview' });
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/projects/p1/symbol-rename');
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body as string)).toEqual({ symbolKind: 'anchor', oldName: 'intro', newName: 'overview' });
    expect(result).toEqual(outcome);
  });

  test('throws the contract code on a 400 (invalid name / conflict)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: { code: 'INVALID_SYMBOL_RENAME', message: 'bad' } }),
    });
    await expect(
      renameSymbol('p1', { symbolKind: 'anchor', oldName: 'a', newName: '1 bad' }),
    ).rejects.toMatchObject({ status: 400, code: 'INVALID_SYMBOL_RENAME' });
  });

  test('throws with status + code on a 403', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: () => Promise.resolve({ error: { code: 'FORBIDDEN', message: 'denied' } }),
    });
    await expect(
      renameSymbol('p1', { symbolKind: 'attribute', oldName: 'a', newName: 'b' }),
    ).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
  });

  test('falls back to REFACTORING_ERROR / a status-derived message when the body is empty', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500, json: () => Promise.resolve({}) });
    await expect(
      renameSymbol('p1', { symbolKind: 'anchor', oldName: 'a', newName: 'b' }),
    ).rejects.toMatchObject({ status: 500, code: 'REFACTORING_ERROR', message: 'Rename failed: 500' });
  });

  test('falls back when the error body is not valid JSON', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 502, json: () => Promise.reject(new Error('nope')) });
    await expect(
      renameSymbol('p1', { symbolKind: 'anchor', oldName: 'a', newName: 'b' }),
    ).rejects.toMatchObject({ status: 502, code: 'REFACTORING_ERROR', message: 'Rename failed: 502' });
  });
});

describe('setProjectMainFile fallback errors', () => {
  test('falls back to SET_MAIN_FILE_ERROR / a status-derived message when the body is empty', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500, json: () => Promise.resolve({}) });
    await expect(setProjectMainFile('p1', 'f1')).rejects.toMatchObject({
      status: 500,
      code: 'SET_MAIN_FILE_ERROR',
      message: 'Set main file failed: 500',
    });
  });

  test('falls back when the error body is not valid JSON', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 503, json: () => Promise.reject(new Error('nope')) });
    await expect(setProjectMainFile('p1', 'f1')).rejects.toMatchObject({
      status: 503,
      code: 'SET_MAIN_FILE_ERROR',
    });
  });
});

describe('findSymbolUsages fallback errors', () => {
  test('falls back to REFACTORING_ERROR / a status-derived message when the body is empty', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500, json: () => Promise.resolve({}) });
    await expect(findSymbolUsages('p1', 'x')).rejects.toMatchObject({
      status: 500,
      code: 'REFACTORING_ERROR',
      message: 'Find usages failed: 500',
    });
  });

  test('falls back when the error body is not valid JSON', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 502, json: () => Promise.reject(new Error('nope')) });
    await expect(findSymbolUsages('p1', 'x')).rejects.toMatchObject({
      status: 502,
      code: 'REFACTORING_ERROR',
    });
  });
});
