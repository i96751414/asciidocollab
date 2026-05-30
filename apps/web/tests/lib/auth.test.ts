// getSession() — server-side session lookup with cookie forwarding

jest.mock('next/headers', () => ({
  cookies: jest.fn(),
}));

import { getSession } from '@/lib/auth';

describe('getSession', () => {
  let fetchMock: jest.Mock;
  let getAll: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    globalThis.fetch = fetchMock;

    getAll = jest.fn().mockReturnValue([{ name: 'sessionId', value: 'test-session-id' }]);
    const { cookies } = require('next/headers');
    (cookies as jest.Mock).mockResolvedValue({ getAll });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('returns userId when the API responds with session data', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ userId: 'user-123' }),
    });

    const result = await getSession();

    expect(result).toEqual({ userId: 'user-123' });
  });

  test('forwards browser cookies to the API as a Cookie header', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ userId: 'user-123' }),
    });

    await getSession();

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/auth/me'),
      expect.objectContaining({
        headers: expect.objectContaining({
          Cookie: 'sessionId=test-session-id',
        }),
      }),
    );
  });

  test('joins multiple cookies with semicolon-space separator', async () => {
    getAll.mockReturnValue([
      { name: 'sessionId', value: 'abc' },
      { name: '_csrf', value: 'xyz' },
    ]);
    fetchMock.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ userId: 'user-123' }),
    });

    await getSession();

    expect(fetchMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        headers: expect.objectContaining({
          Cookie: 'sessionId=abc; _csrf=xyz',
        }),
      }),
    );
  });

  test('returns null when the API responds with a non-2xx status', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: jest.fn().mockResolvedValue({ error: { code: 'UNAUTHORIZED' } }),
    });

    const result = await getSession();

    expect(result).toBeNull();
  });

  test('returns null on network failure', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));

    const result = await getSession();

    expect(result).toBeNull();
  });

  test('disables Next.js caching for the auth check', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ userId: 'user-123' }),
    });

    await getSession();

    expect(fetchMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ cache: 'no-store' }),
    );
  });
});
