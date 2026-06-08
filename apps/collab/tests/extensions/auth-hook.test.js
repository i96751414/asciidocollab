"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const auth_hook_1 = require("../../src/extensions/auth-hook");
const DOCUMENT_NAME = '550e8400-e29b-41d4-a716-446655440001/550e8400-e29b-41d4-a716-446655440002';
const COOKIE = 'sessionId=abc123';
function makePayload(overrides = {}) {
    return {
        context: overrides.context ?? {},
        documentName: DOCUMENT_NAME,
        requestHeaders: { cookie: COOKIE },
        requestParameters: new URLSearchParams(),
        instance: {},
        request: {},
        socketId: 'test-socket',
        connection: { readOnly: false, isAuthenticated: true, onClose: [], },
    };
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
        const ext = new auth_hook_1.AuthHookExtension({
            apiInternalUrl: 'http://127.0.0.1:4001',
            authTimeoutMs: 3000,
            logger: mockLogger,
            fetch: mockFetch,
        });
        const payload = makePayload();
        await expect(ext.onConnect(payload)).resolves.toBeUndefined();
        expect(payload.context.role).toBe('editor');
        expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining(`documentName=${encodeURIComponent(DOCUMENT_NAME)}`), expect.objectContaining({
            headers: expect.objectContaining({ Cookie: COOKIE }),
        }));
    });
    it('200 observer: stores role=observer on context, connection accepted', async () => {
        const mockFetch = jest.fn().mockResolvedValue({
            status: 200,
            json: async () => ({ role: 'observer' }),
        });
        const ext = new auth_hook_1.AuthHookExtension({
            apiInternalUrl: 'http://127.0.0.1:4001',
            authTimeoutMs: 3000,
            logger: mockLogger,
            fetch: mockFetch,
        });
        const payload = makePayload();
        await expect(ext.onConnect(payload)).resolves.toBeUndefined();
        expect(payload.context.role).toBe('observer');
    });
    it('401: throws with code 1008', async () => {
        const mockFetch = jest.fn().mockResolvedValue({
            status: 401,
            json: async () => ({ error: 'Unauthorized' }),
        });
        const ext = new auth_hook_1.AuthHookExtension({
            apiInternalUrl: 'http://127.0.0.1:4001',
            authTimeoutMs: 3000,
            logger: mockLogger,
            fetch: mockFetch,
        });
        await expect(ext.onConnect(makePayload())).rejects.toMatchObject({ code: 1008 });
    });
    it('403: throws with code 1008', async () => {
        const mockFetch = jest.fn().mockResolvedValue({
            status: 403,
            json: async () => ({ error: 'Forbidden' }),
        });
        const ext = new auth_hook_1.AuthHookExtension({
            apiInternalUrl: 'http://127.0.0.1:4001',
            authTimeoutMs: 3000,
            logger: mockLogger,
            fetch: mockFetch,
        });
        await expect(ext.onConnect(makePayload())).rejects.toMatchObject({ code: 1008 });
    });
    it('timeout: throws with code 1008 and logs warn with room name (no cookie)', async () => {
        const abortError = Object.assign(new Error('AbortError'), { name: 'AbortError' });
        const mockFetch = jest.fn().mockRejectedValue(abortError);
        const ext = new auth_hook_1.AuthHookExtension({
            apiInternalUrl: 'http://127.0.0.1:4001',
            authTimeoutMs: 3000,
            logger: mockLogger,
            fetch: mockFetch,
        });
        await expect(ext.onConnect(makePayload())).rejects.toMatchObject({ code: 1008 });
        expect(mockLogger.warn).toHaveBeenCalledWith(expect.objectContaining({ documentName: DOCUMENT_NAME }), expect.any(String));
        const warnCall = mockLogger.warn.mock.calls[0];
        const warnArg = JSON.stringify(warnCall);
        expect(warnArg).not.toContain('abc123');
        expect(warnArg).not.toContain('sessionId');
        expect(warnArg).not.toContain('Cookie');
    });
    it('network error: throws with code 1008 and logs warn with room name (no cookie)', async () => {
        const networkError = new Error('ECONNREFUSED');
        const mockFetch = jest.fn().mockRejectedValue(networkError);
        const ext = new auth_hook_1.AuthHookExtension({
            apiInternalUrl: 'http://127.0.0.1:4001',
            authTimeoutMs: 3000,
            logger: mockLogger,
            fetch: mockFetch,
        });
        await expect(ext.onConnect(makePayload())).rejects.toMatchObject({ code: 1008 });
        expect(mockLogger.warn).toHaveBeenCalledWith(expect.objectContaining({ documentName: DOCUMENT_NAME }), expect.any(String));
        const warnArg = JSON.stringify(mockLogger.warn.mock.calls[0]);
        expect(warnArg).not.toContain('abc123');
        expect(warnArg).not.toContain('Cookie');
    });
});
//# sourceMappingURL=auth-hook.test.js.map