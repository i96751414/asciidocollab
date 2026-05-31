// authApi behavior — SameSite+Origin approach (no manual CSRF tokens)

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

describe('authApi behavior', () => {
  let fetchMock: jest.Mock;
  let authApi: typeof import('@/lib/api').authApi;
  let ApiError: typeof import('@/lib/api').ApiError;

  beforeEach(() => {
    jest.resetModules();
    fetchMock = jest.fn();
    globalThis.fetch = fetchMock;
    ({ authApi, ApiError } = require('@/lib/api'));
  });

  test('login sends credentials without a CSRF token fetch', async () => {
    fetchMock.mockReturnValueOnce(mockOkResponse({ message: 'Authenticated' }));

    await authApi.login('user@example.com', 'Password1!');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain('/auth/login');
    expect(fetchMock.mock.calls[0][1].headers).not.toHaveProperty('x-csrf-token');
  });

  test('register sends credentials without a CSRF token fetch', async () => {
    fetchMock.mockReturnValueOnce(mockOkResponse({ message: 'Account created' }));

    await authApi.register('user@example.com', 'Password1!', 'User');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain('/auth/register');
  });

  test('logout does not send a CSRF token', async () => {
    fetchMock.mockReturnValueOnce(mockOkResponse({ message: 'Logged out' }));

    await authApi.logout();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].headers).not.toHaveProperty('x-csrf-token');
  });

  test('login propagates API errors', async () => {
    fetchMock.mockReturnValueOnce(
      mockErrorResponse(401, { error: { code: 'INVALID_CREDENTIALS', message: 'Bad credentials' } }),
    );

    await expect(authApi.login('user@example.com', 'wrong')).rejects.toBeInstanceOf(ApiError);
  });

  test('multiple calls do not generate extra requests', async () => {
    fetchMock
      .mockReturnValueOnce(mockOkResponse({ message: 'Authenticated' }))
      .mockReturnValueOnce(mockOkResponse({ message: 'Authenticated' }));

    await authApi.login('user@example.com', 'Password1!');
    await authApi.login('user@example.com', 'Password1!');

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
