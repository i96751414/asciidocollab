// Tests for apps/web/src/lib/api/projects.ts
import { setProjectMainFile } from '@/lib/api/projects';

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
