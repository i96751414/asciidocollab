// authApi CSRF token acquisition and caching behavior

function mockOkResponse(body: unknown) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: jest.fn().mockResolvedValue(body),
  });
}

function mockErrorResponse(status: number, body: unknown) {
  return Promise.resolve({
    ok: false,
    status,
    json: jest.fn().mockResolvedValue(body),
  });
}

describe('authApi CSRF token behavior', () => {
  let fetchMock: jest.Mock;
  let authApi: typeof import('@/lib/api').authApi;

  beforeEach(() => {
    jest.resetModules();
    fetchMock = jest.fn();
    globalThis.fetch = fetchMock;
    // require after resetModules to get a fresh module with csrfToken = null
    ({ authApi } = require('@/lib/api'));
  });

  test('login fetches CSRF token before submitting credentials', async () => {
    fetchMock
      .mockReturnValueOnce(mockOkResponse({ token: 'csrf-abc' }))
      .mockReturnValueOnce(mockOkResponse({ message: 'Authenticated' }));

    await authApi.login('user@example.com', 'Password1!');

    expect(String(fetchMock.mock.calls[0][0])).toContain('/auth/csrf-token');
    expect(fetchMock.mock.calls[1][1].headers).toMatchObject({ 'x-csrf-token': 'csrf-abc' });
  });

  test('register fetches CSRF token before submitting', async () => {
    fetchMock
      .mockReturnValueOnce(mockOkResponse({ token: 'csrf-xyz' }))
      .mockReturnValueOnce(mockOkResponse({ message: 'Account created' }));

    await authApi.register('user@example.com', 'Password1!', 'User');

    expect(String(fetchMock.mock.calls[0][0])).toContain('/auth/csrf-token');
    expect(fetchMock.mock.calls[1][1].headers).toMatchObject({ 'x-csrf-token': 'csrf-xyz' });
  });

  test('logout sends CSRF token and then invalidates it', async () => {
    fetchMock
      .mockReturnValueOnce(mockOkResponse({ token: 'csrf-logout' }))
      .mockReturnValueOnce(mockOkResponse({ message: 'Logged out' }));

    await authApi.logout();

    expect(fetchMock.mock.calls[1][1].headers).toMatchObject({ 'x-csrf-token': 'csrf-logout' });
  });

  test('CSRF token is reused across multiple calls without re-fetching', async () => {
    fetchMock
      .mockReturnValueOnce(mockOkResponse({ token: 'csrf-cached' }))
      .mockReturnValueOnce(mockOkResponse({ message: 'Authenticated' }))
      .mockReturnValueOnce(mockOkResponse({ message: 'Authenticated' }));

    await authApi.login('user@example.com', 'Password1!');
    await authApi.login('user@example.com', 'Password1!');

    const csrfFetches = fetchMock.mock.calls.filter((call) =>
      String(call[0]).includes('/auth/csrf-token'),
    );
    expect(csrfFetches).toHaveLength(1);
  });

  test('CSRF token is preserved when logout fails, allowing retry without re-fetching', async () => {
    const { ApiError } = require('@/lib/api');

    fetchMock
      .mockReturnValueOnce(mockOkResponse({ token: 'csrf-cached' }))
      .mockReturnValueOnce(mockErrorResponse(503, { error: { code: 'SERVICE_UNAVAILABLE', message: 'Unavailable' } }))
      .mockReturnValueOnce(mockOkResponse({ message: 'Logged out' }));

    await expect(authApi.logout()).rejects.toBeInstanceOf(ApiError);

    // Token must still be cached — retry should not re-fetch
    await authApi.logout();
    const csrfFetches = fetchMock.mock.calls.filter((call) =>
      String(call[0]).includes('/auth/csrf-token'),
    );
    expect(csrfFetches).toHaveLength(1);
  });

  test('CSRF token is re-fetched after logout invalidates the cache', async () => {
    fetchMock
      .mockReturnValueOnce(mockOkResponse({ token: 'csrf-first' }))
      .mockReturnValueOnce(mockOkResponse({ message: 'Logged out' }))
      .mockReturnValueOnce(mockOkResponse({ token: 'csrf-second' }))
      .mockReturnValueOnce(mockOkResponse({ message: 'Authenticated' }));

    await authApi.logout();
    await authApi.login('user@example.com', 'Password1!');

    const csrfFetches = fetchMock.mock.calls.filter((call) =>
      String(call[0]).includes('/auth/csrf-token'),
    );
    expect(csrfFetches).toHaveLength(2);
    expect(fetchMock.mock.calls[3][1].headers).toMatchObject({ 'x-csrf-token': 'csrf-second' });
  });

  test('login propagates API errors after obtaining CSRF token', async () => {
    const { ApiError } = require('@/lib/api');

    fetchMock
      .mockReturnValueOnce(mockOkResponse({ token: 'csrf-abc' }))
      .mockReturnValueOnce(mockErrorResponse(401, { error: { code: 'INVALID_CREDENTIALS', message: 'Bad credentials' } }));

    await expect(authApi.login('user@example.com', 'wrong')).rejects.toBeInstanceOf(ApiError);
  });
});
