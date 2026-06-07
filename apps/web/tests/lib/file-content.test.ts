// Tests for apps/web/src/lib/api/file-content.ts
import { saveDocumentContent, getDocumentContent } from '@/lib/api/file-content';

const mockFetch = jest.fn();
globalThis.fetch = mockFetch;

beforeEach(() => {
  mockFetch.mockReset();
});

// Issue 6: saveDocumentContent must return the ETag from the PUT response so
// callers can seed storedEtag for external-change polling. Previously it
// returned void and discarded the header, making any caller that used this
// helper instead of raw fetch blind to concurrent edits.
describe('saveDocumentContent', () => {
  test('sends PUT with credentials include and Content-Type text/plain', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 204,
      headers: { get: () => null },
    });
    await saveDocumentContent('proj-1', 'file-1', 'content');
    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(options.method).toBe('PUT');
    expect(options.credentials).toBe('include');
    expect((options.headers as Record<string, string>)['Content-Type']).toBe('text/plain');
  });

  test('returns the ETag from the PUT response when the save succeeds', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 204,
      headers: { get: (name: string) => name === 'ETag' ? '"abc-uuid-123"' : null },
      json: () => Promise.resolve({}),
    });

    const result = await saveDocumentContent('proj-1', 'file-1', 'content');

    expect(result).toEqual({ etag: '"abc-uuid-123"' });
  });

  test('returns null etag when the response has no ETag header', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 204,
      headers: { get: () => null },
      json: () => Promise.resolve({}),
    });

    const result = await saveDocumentContent('proj-1', 'file-1', 'content');

    expect(result).toEqual({ etag: null });
  });

  test('throws on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      headers: { get: () => null },
      json: () => Promise.resolve({ error: { message: 'Forbidden' } }),
    });

    await expect(saveDocumentContent('proj-1', 'file-1', 'content')).rejects.toThrow('Forbidden');
  });
});

describe('getDocumentContent', () => {
  test('sends GET with credentials include', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve('content'),
    });
    await getDocumentContent('proj-1', 'file-1');
    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(options.credentials).toBe('include');
  });

  test('falls back when response.json() returns null on error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.resolve(null),
    });
    await expect(getDocumentContent('proj-1', 'file-1')).rejects.toThrow('Failed to fetch content: 500');
  });

  test('returns text content on success', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve('= Hello World'),
    });
    const content = await getDocumentContent('proj-1', 'file-1');
    expect(content).toBe('= Hello World');
  });

  test('throws with server message on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ error: { message: 'File not found' } }),
    });
    await expect(getDocumentContent('proj-1', 'file-1')).rejects.toThrow('File not found');
  });

  test('falls back to status code message when json parse fails', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error('parse')),
    });
    await expect(getDocumentContent('proj-1', 'file-1')).rejects.toThrow('Failed to fetch content: 500');
  });
});

describe('saveDocumentContent — error path fallback', () => {
  test('falls back to status code message when json parse fails', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      headers: { get: () => null },
      json: () => Promise.reject(new Error('parse')),
    });
    await expect(saveDocumentContent('proj-1', 'file-1', 'x')).rejects.toThrow('Failed to save content: 503');
  });

  test('falls back to status code message when json() returns null', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      headers: { get: () => null },
      json: () => Promise.resolve(null),
    });
    await expect(saveDocumentContent('proj-1', 'file-1', 'x')).rejects.toThrow('Failed to save content: 500');
  });
});

// Issue 6: saveDocumentContent and getDocumentContent must use the same base URL
// constant so callers hit the same server. Verifying this prevents the two
// helpers from drifting (e.g. one picking up a new env var name and the other not).
describe('API helpers use the same base URL', () => {
  test('saveDocumentContent and getDocumentContent hit the same host', async () => {
    const capturedUrls: string[] = [];
    mockFetch.mockImplementation((url: string) => {
      capturedUrls.push(url);
      return Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve('content text'),
        headers: { get: () => '"etag"' },
      });
    });

    await getDocumentContent('proj', 'file');
    await saveDocumentContent('proj', 'file', 'text');

    const [getUrl, putUrl] = capturedUrls;
    // Both should share the same base URL (host + path prefix)
    expect(new URL(getUrl).host).toBe(new URL(putUrl).host);
    expect(new URL(getUrl).pathname).toBe(new URL(putUrl).pathname);
  });
});

// Issue 3: use-auto-save must not define its own API base URL — it must import
// from lib/api/file-content so polling/keepalive and saves share one constant.
describe('use-auto-save must not duplicate the API base URL constant', () => {
  test('use-auto-save.ts does not define its own API_BASE constant', () => {
    const fs = require('node:fs');
    const source: string = fs.readFileSync(
      require.resolve('@/hooks/use-auto-save'),
      'utf8',
    );
    // After the fix the hook must import contentUrl or API_BASE_URL from file-content,
    // not declare its own NEXT_PUBLIC_API_URL expression.
    expect(source).not.toContain('process.env.NEXT_PUBLIC_API_URL');
  });
});
