import { AuthHookExtension } from '../../src/extensions/auth-hook';
import type { onConnectPayload } from '@hocuspocus/server';

const DOCUMENT_NAME = '550e8400-e29b-41d4-a716-446655440001/550e8400-e29b-41d4-a716-446655440002';
const ALLOWED = 'https://app.example.com';

function makePayload(origin?: string): onConnectPayload {
  return {
    context: {},
    documentName: DOCUMENT_NAME,
    requestHeaders: new Headers({ cookie: 'sessionId=abc', ...(origin ? { origin } : {}) }),
    requestParameters: new URLSearchParams(),
    instance: {} as onConnectPayload['instance'],
    request: {} as onConnectPayload['request'],
    socketId: 'test-socket',
    connectionConfig: { readOnly: false, isAuthenticated: true },
  } as unknown as onConnectPayload;
}

function makeExtension(
  allowedOrigins: string[],
  fetchMock: jest.Mock,
  logger?: { warn: jest.Mock; error: jest.Mock },
) {
  return new AuthHookExtension({
    apiInternalUrl: 'http://127.0.0.1:4001',
    authTimeoutMs: 3000,
    logger: (logger ?? { warn: jest.fn(), error: jest.fn() }) as never,
    allowedOrigins,
    fetch: fetchMock as never,
  });
}

// Reject handshakes whose Origin is not in the allowlist (CSWSH defence).
describe('AuthHookExtension Origin allowlist', () => {
  it('rejects (1008) a disallowed Origin before contacting the auth endpoint', async () => {
    const fetchMock = jest.fn();
    const logger = { warn: jest.fn(), error: jest.fn() };
    const extension = makeExtension([ALLOWED], fetchMock, logger);

    await expect(extension.onConnect(makePayload('https://evil.example.com'))).rejects.toMatchObject({ code: 1008 });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ resource: DOCUMENT_NAME, reason: 'origin_not_allowed' }),
      expect.any(String),
    );
  });

  it('rejects (1008) when the Origin header is missing and an allowlist is set', async () => {
    const fetchMock = jest.fn();
    const extension = makeExtension([ALLOWED], fetchMock);
    await expect(extension.onConnect(makePayload(undefined))).rejects.toMatchObject({ code: 1008 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('allows an Origin that is in the allowlist (proceeds to auth)', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ status: 200, json: async () => ({ role: 'editor', userId: 'u-1' }) });
    const extension = makeExtension([ALLOWED], fetchMock);
    const payload = makePayload(ALLOWED);
    await expect(extension.onConnect(payload)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalled();
    expect(payload.context.role).toBe('editor');
  });

  it('skips the Origin check entirely when the allowlist is empty (development)', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ status: 200, json: async () => ({ role: 'editor', userId: 'u-1' }) });
    const extension = makeExtension([], fetchMock);
    await expect(extension.onConnect(makePayload('https://anything.example.com'))).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalled();
  });
});
