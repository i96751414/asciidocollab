// getSession() and getProfile() — server-side session and profile lookups with cookie forwarding

jest.mock('next/headers', () => ({
  cookies: jest.fn(),
}));

import { getSession, getProfile } from '@/lib/auth';

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

describe('getProfile', () => {
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

  test('returns full profile including displayName and email', async () => {
    const profileData = { userId: 'user-123', displayName: 'Alice', email: 'alice@example.com' };
    fetchMock.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue(profileData),
    });

    const result = await getProfile();

    expect(result).toEqual(profileData);
  });

  test('forwards browser cookies to the API as a Cookie header', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ userId: 'u', displayName: 'U', email: 'u@e.com' }),
    });

    await getProfile();

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/auth/me'),
      expect.objectContaining({
        headers: expect.objectContaining({ Cookie: 'sessionId=test-session-id' }),
      }),
    );
  });

  test('returns null when the API responds with a non-2xx status', async () => {
    fetchMock.mockResolvedValue({ ok: false });

    const result = await getProfile();

    expect(result).toBeNull();
  });

  test('returns null on network failure', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));

    const result = await getProfile();

    expect(result).toBeNull();
  });

  test('getSession returns { userId } extracted from the same API response as getProfile', async () => {
    const profileData = { userId: 'user-456', displayName: 'Bob', email: 'bob@example.com' };
    fetchMock.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue(profileData),
    });

    const session = await getSession();

    expect(session).toEqual({ userId: 'user-456' });
    expect(session).not.toHaveProperty('displayName');
    expect(session).not.toHaveProperty('email');
  });
});

describe('auth API base URL', () => {
  const ORIGINAL_ENV = process.env;

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    jest.resetModules();
    jest.clearAllMocks();
  });

  test('uses NEXT_PUBLIC_API_URL when it is set', async () => {
    process.env = { ...ORIGINAL_ENV, NEXT_PUBLIC_API_URL: 'https://api.test' };
    jest.resetModules();

    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ userId: 'u' }),
    });
    globalThis.fetch = fetchMock;
    const { cookies } = require('next/headers');
    (cookies as jest.Mock).mockResolvedValue({ getAll: () => [] });

    const { getProfile: freshGetProfile } = require('@/lib/auth');
    await freshGetProfile();

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.test/auth/me',
      expect.anything(),
    );
  });

  test('falls back to the localhost default when NEXT_PUBLIC_API_URL is unset', async () => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.NEXT_PUBLIC_API_URL;
    jest.resetModules();

    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ userId: 'u' }),
    });
    globalThis.fetch = fetchMock;
    const { cookies } = require('next/headers');
    (cookies as jest.Mock).mockResolvedValue({ getAll: () => [] });

    const { getProfile: freshGetProfile } = require('@/lib/auth');
    await freshGetProfile();

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4000/auth/me',
      expect.anything(),
    );
  });
});
