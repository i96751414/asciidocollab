import { AuthHookExtension } from '../../src/extensions/auth-hook';
import type { onConnectPayload } from '@hocuspocus/server';

const DOCUMENT_NAME = '550e8400-e29b-41d4-a716-446655440001/550e8400-e29b-41d4-a716-446655440002';
const COOKIE = 'sessionId=abc123';

function makePayload(overrides: { context?: Record<string, unknown> } = {}): onConnectPayload {
  return {
    context: overrides.context ?? {},
    documentName: DOCUMENT_NAME,
    requestHeaders: { cookie: COOKIE },
    requestParameters: new URLSearchParams(),
    instance: {} as onConnectPayload['instance'],
    request: {} as onConnectPayload['request'],
    socketId: 'test-socket',
    connection: { readOnly: false, isAuthenticated: true, onClose: [], },
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
      json: async () => ({ role: 'editor' }),
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
      json: async () => ({ role: 'observer' }),
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
      expect.objectContaining({ documentName: DOCUMENT_NAME }),
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
      expect.objectContaining({ documentName: DOCUMENT_NAME }),
      expect.any(String),
    );
    const warnArgument = JSON.stringify(mockLogger.warn.mock.calls[0]);
    expect(warnArgument).not.toContain('abc123');
    expect(warnArgument).not.toContain('Cookie');
  });
});
