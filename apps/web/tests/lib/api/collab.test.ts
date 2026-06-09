// Tests for apps/web/src/lib/api/collab.ts
import { getCollabDocumentInfo } from '@/lib/api/collab';

const mockFetch = jest.fn();
globalThis.fetch = mockFetch;

beforeEach(() => {
  mockFetch.mockReset();
});

describe('getCollabDocumentInfo', () => {
  test('sends GET with credentials include to the collab endpoint', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ yjsStateId: 'yjs-1', role: 'editor' }),
    });
    await getCollabDocumentInfo('proj-1', 'file-1');
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/projects/proj-1/files/file-1/collab');
    expect(options.credentials).toBe('include');
  });

  test('parses and returns the 200 JSON body', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ yjsStateId: 'yjs-abc', role: 'observer' }),
    });
    const info = await getCollabDocumentInfo('proj-1', 'file-1');
    expect(info).toEqual({ yjsStateId: 'yjs-abc', role: 'observer' });
  });

  test('returns null on 404 (drives the legacy path)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ error: { code: 'NOT_FOUND' } }),
    });
    const info = await getCollabDocumentInfo('proj-1', 'file-1');
    expect(info).toBeNull();
  });

  test('throws on 401 unauthorized', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ error: { message: 'Authentication required' } }),
    });
    await expect(getCollabDocumentInfo('proj-1', 'file-1')).rejects.toThrow();
  });

  test('throws on 5xx server error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: { message: 'boom' } }),
    });
    await expect(getCollabDocumentInfo('proj-1', 'file-1')).rejects.toThrow();
  });

  test('throws with the status code in the message when the response body is not valid JSON', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 502,
      json: () => Promise.reject(new SyntaxError('Unexpected token')),
    });
    await expect(getCollabDocumentInfo('proj-1', 'file-1')).rejects.toThrow('502');
  });

  test('throws with the status code in the message when the error body has no message field', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: () => Promise.resolve({}),
    });
    await expect(getCollabDocumentInfo('proj-1', 'file-1')).rejects.toThrow('503');
  });

  test('throws with the status code when the error object has no message property', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 422,
      json: () => Promise.resolve({ error: { code: 'VALIDATION_FAILED' } }),
    });
    await expect(getCollabDocumentInfo('proj-1', 'file-1')).rejects.toThrow('422');
  });

  test('throws with the status code when the response body is null', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 504,
      json: () => Promise.resolve(null),
    });
    await expect(getCollabDocumentInfo('proj-1', 'file-1')).rejects.toThrow('504');
  });
});
