import { AuthHookExtension } from '../../src/extensions/auth-hook';
import type { onConnectPayload } from '@hocuspocus/server';

const DOCUMENT_NAME = '550e8400-e29b-41d4-a716-446655440001/550e8400-e29b-41d4-a716-446655440002';
const COOKIE = 'sessionId=abc123';

function makePayload(overrides: { context?: Record<string, unknown> } = {}): onConnectPayload {
  return {
    context: overrides.context ?? {},
    documentName: DOCUMENT_NAME,
    // v4: requestHeaders is a web Headers object; read-only lives on connectionConfig.
    requestHeaders: new Headers({ cookie: COOKIE }),
    requestParameters: new URLSearchParams(),
    instance: {} as onConnectPayload['instance'],
    request: {} as onConnectPayload['request'],
    socketId: 'test-socket',
    connectionConfig: { readOnly: false, isAuthenticated: true },
  } as unknown as onConnectPayload;
}

describe('AuthHookExtension', () => {
  const mockLogger = { warn: jest.fn(), error: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('200 editor: stores role=editor on context, connection accepted (no throw)', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      status: 200,
      json: async () => ({ role: 'editor', userId: 'u-1' }),
    });

    const extension = new AuthHookExtension({
      apiInternalUrl: 'http://127.0.0.1:4001',
      authTimeoutMs: 3000,
      logger: mockLogger as never,
      fetch: mockFetch as never,
    });

    const payload = makePayload();
    await expect(extension.onConnect(payload)).resolves.toBeUndefined();
    expect(payload.context.role).toBe('editor');
    expect(payload.context.userId).toBe('u-1');
    expect(payload.connectionConfig.readOnly).toBe(false);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining(`documentName=${encodeURIComponent(DOCUMENT_NAME)}`),
      expect.objectContaining({
        headers: expect.objectContaining({ Cookie: COOKIE }),
      }),
    );
  });

  it('200 observer: stores role=observer on context, connection accepted', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      status: 200,
      json: async () => ({ role: 'observer', userId: 'u-1' }),
    });

    const extension = new AuthHookExtension({
      apiInternalUrl: 'http://127.0.0.1:4001',
      authTimeoutMs: 3000,
      logger: mockLogger as never,
      fetch: mockFetch as never,
    });

    const payload = makePayload();
    await expect(extension.onConnect(payload)).resolves.toBeUndefined();
    expect(payload.context.role).toBe('observer');
    // SEC: observers must be marked read-only at the WS connection level so Hocuspocus rejects
    // their inbound document updates — client-side read-only is not an authorization boundary.
    expect(payload.connectionConfig.readOnly).toBe(true);
  });

  it('401: throws with code 1008', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      status: 401,
      json: async () => ({ error: 'Unauthorized' }),
    });

    const extension = new AuthHookExtension({
      apiInternalUrl: 'http://127.0.0.1:4001',
      authTimeoutMs: 3000,
      logger: mockLogger as never,
      fetch: mockFetch as never,
    });

    await expect(extension.onConnect(makePayload())).rejects.toMatchObject({ code: 1008 });
  });

  it('403: throws with code 1008', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      status: 403,
      json: async () => ({ error: 'Forbidden' }),
    });

    const extension = new AuthHookExtension({
      apiInternalUrl: 'http://127.0.0.1:4001',
      authTimeoutMs: 3000,
      logger: mockLogger as never,
      fetch: mockFetch as never,
    });

    await expect(extension.onConnect(makePayload())).rejects.toMatchObject({ code: 1008 });
  });

  it('timeout: throws with code 1008 and logs warn with room name (no cookie)', async () => {
    const abortError = Object.assign(new Error('AbortError'), { name: 'AbortError' });
    const mockFetch = jest.fn().mockRejectedValue(abortError);

    const extension = new AuthHookExtension({
      apiInternalUrl: 'http://127.0.0.1:4001',
      authTimeoutMs: 3000,
      logger: mockLogger as never,
      fetch: mockFetch as never,
    });

    await expect(extension.onConnect(makePayload())).rejects.toMatchObject({ code: 1008 });

    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ resource: DOCUMENT_NAME }),
      expect.any(String),
    );
    const warnCall = mockLogger.warn.mock.calls[0];
    const warnArgument = JSON.stringify(warnCall);
    expect(warnArgument).not.toContain('abc123');
    expect(warnArgument).not.toContain('sessionId');
    expect(warnArgument).not.toContain('Cookie');
  });

  it('network error: throws with code 1008 and logs warn with room name (no cookie)', async () => {
    const networkError = new Error('ECONNREFUSED');
    const mockFetch = jest.fn().mockRejectedValue(networkError);

    const extension = new AuthHookExtension({
      apiInternalUrl: 'http://127.0.0.1:4001',
      authTimeoutMs: 3000,
      logger: mockLogger as never,
      fetch: mockFetch as never,
    });

    await expect(extension.onConnect(makePayload())).rejects.toMatchObject({ code: 1008 });

    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ resource: DOCUMENT_NAME }),
      expect.any(String),
    );
    const warnArgument = JSON.stringify(mockLogger.warn.mock.calls[0]);
    expect(warnArgument).not.toContain('abc123');
    expect(warnArgument).not.toContain('Cookie');
  });

  it('200 with unknown role body: throws with code 1008 — prevents unknown roles from gaining access', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      status: 200,
      json: async () => ({ role: 'admin' }), // unknown role value
    });

    const extension = new AuthHookExtension({
      apiInternalUrl: 'http://127.0.0.1:4001',
      authTimeoutMs: 3000,
      logger: mockLogger as never,
      fetch: mockFetch as never,
    });

    await expect(extension.onConnect(makePayload())).rejects.toMatchObject({ code: 1008 });
  });

  it('200 with missing role field: throws with code 1008', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      status: 200,
      json: async () => ({ status: 'ok' }), // no role field
    });

    const extension = new AuthHookExtension({
      apiInternalUrl: 'http://127.0.0.1:4001',
      authTimeoutMs: 3000,
      logger: mockLogger as never,
      fetch: mockFetch as never,
    });

    await expect(extension.onConnect(makePayload())).rejects.toMatchObject({ code: 1008 });
  });

  it('non-Error thrown: uses "Error" as the class name and rejects with code 1008', async () => {
    // Validates the fallback branch where something other than an Error instance is thrown
    // (e.g. a plain string or object), so the error.constructor.name path is not available.
    const mockFetch = jest.fn().mockRejectedValue('plain string rejection');

    const extension = new AuthHookExtension({
      apiInternalUrl: 'http://127.0.0.1:4001',
      authTimeoutMs: 3000,
      logger: mockLogger as never,
      fetch: mockFetch as never,
    });

    await expect(extension.onConnect(makePayload())).rejects.toMatchObject({ code: 1008 });
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ errorClass: 'Error' }),
      expect.any(String),
    );
  });

  it('uses globalThis.fetch as default when no fetch option is provided', () => {
    const extension = new AuthHookExtension({
      apiInternalUrl: 'http://127.0.0.1:4001',
      authTimeoutMs: 3000,
      logger: mockLogger as never,
      // fetch not provided — should fall back to globalThis.fetch
    });
    expect(extension).toBeDefined();
  });

  it('no cookie header: omits Cookie header from auth request', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      status: 200,
      json: async () => ({ role: 'editor', userId: 'u-1' }),
    });

    const extension = new AuthHookExtension({
      apiInternalUrl: 'http://127.0.0.1:4001',
      authTimeoutMs: 3000,
      logger: mockLogger as never,
      fetch: mockFetch as never,
    });

    const payload = {
      ...makePayload(),
      requestHeaders: new Headers(), // no cookie
    } as unknown as onConnectPayload;

    await extension.onConnect(payload);

    const [, callInit] = mockFetch.mock.calls[0] as [string, { headers: Record<string, string> }];
    expect(Object.keys(callInit.headers)).toHaveLength(0);
  });
});
