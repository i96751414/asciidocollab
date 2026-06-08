import https from 'node:https';
import { createMtlsFetch } from '../../src/extensions/mtls-fetch';

jest.mock('node:https');

const mockHttps = https as jest.Mocked<typeof https>;

function makeFakeResponse(statusCode: number, body: Buffer) {
  const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
  const res = {
    statusCode,
    headers: { 'content-type': 'application/json' },
    on(event: string, cb: (...args: unknown[]) => void) {
      (listeners[event] ??= []).push(cb);
      return res;
    },
    emit(event: string, ...args: unknown[]) {
      for (const cb of listeners[event] ?? []) cb(...args);
    },
  };
  return res;
}

function makeFakeRequest() {
  const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
  const req = {
    on(event: string, cb: (...args: unknown[]) => void) {
      (listeners[event] ??= []).push(cb);
      return req;
    },
    emit(event: string, ...args: unknown[]) {
      for (const cb of listeners[event] ?? []) cb(...args);
    },
    destroy: jest.fn(),
    end: jest.fn(),
  };
  return req;
}

describe('createMtlsFetch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates an https.Agent with the provided cert, key, and ca', () => {
    const cert = Buffer.from('cert-pem');
    const key = Buffer.from('key-pem');
    const ca = Buffer.from('ca-pem');

    const AgentMock = jest.fn();
    (mockHttps.Agent as unknown) = AgentMock;
    (mockHttps.request as jest.Mock).mockImplementation(() => {
      const req = makeFakeRequest();
      setImmediate(() => {
        const res = makeFakeResponse(200, Buffer.from('{}'));
        const [, cb] = (mockHttps.request as jest.Mock).mock.calls[0];
        cb(res);
        res.emit('data', Buffer.from('{}'));
        res.emit('end');
      });
      return req;
    });

    createMtlsFetch(cert, key, ca);

    expect(AgentMock).toHaveBeenCalledWith(
      expect.objectContaining({ cert, key, ca, rejectUnauthorized: true }),
    );
  });

  it('makes a GET request and resolves with status + json() from the response', async () => {
    const cert = Buffer.from('cert');
    const key = Buffer.from('key');
    const ca = Buffer.from('ca');
    const responseBody = JSON.stringify({ role: 'editor' });

    (mockHttps.Agent as unknown) = jest.fn().mockReturnValue({});
    (mockHttps.request as jest.Mock).mockImplementation((_opts: unknown, cb: (res: unknown) => void) => {
      const req = makeFakeRequest();
      setImmediate(() => {
        const res = makeFakeResponse(200, Buffer.from(responseBody));
        cb(res);
        res.emit('data', Buffer.from(responseBody));
        res.emit('end');
      });
      return req;
    });

    const fetchFn = createMtlsFetch(cert, key, ca);
    const response = await fetchFn('https://127.0.0.1:4001/internal/collab/auth?doc=x', {
      headers: { Cookie: 'session=abc' },
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ role: 'editor' });
  });

  it('rejects when the request emits an error', async () => {
    const cert = Buffer.from('cert');
    const key = Buffer.from('key');
    const ca = Buffer.from('ca');

    (mockHttps.Agent as unknown) = jest.fn().mockReturnValue({});
    (mockHttps.request as jest.Mock).mockImplementation(() => {
      const req = makeFakeRequest();
      setImmediate(() => req.emit('error', new Error('ECONNREFUSED')));
      return req;
    });

    const fetchFn = createMtlsFetch(cert, key, ca);
    await expect(fetchFn('https://127.0.0.1:4001/path')).rejects.toThrow('ECONNREFUSED');
  });

  it('calls req.destroy() when the AbortSignal fires before the response arrives', async () => {
    const cert = Buffer.from('cert');
    const key = Buffer.from('key');
    const ca = Buffer.from('ca');

    (mockHttps.Agent as unknown) = jest.fn().mockReturnValue({});
    let capturedReq: ReturnType<typeof makeFakeRequest> | null = null;
    (mockHttps.request as jest.Mock).mockImplementation(() => {
      capturedReq = makeFakeRequest();
      return capturedReq;
    });

    const controller = new AbortController();
    const fetchFn = createMtlsFetch(cert, key, ca);
    const fetchPromise = fetchFn('https://127.0.0.1:4001/path', { signal: controller.signal });

    controller.abort();
    expect(capturedReq!.destroy).toHaveBeenCalled();

    // Let the promise settle (it may reject due to the abort)
    await fetchPromise.catch(() => undefined);
  });

  it('accepts a URL object as input and extracts hostname/path correctly', async () => {
    const cert = Buffer.from('cert');
    const key = Buffer.from('key');
    const ca = Buffer.from('ca');

    (mockHttps.Agent as unknown) = jest.fn().mockReturnValue({});
    let capturedOptions: { hostname?: string; path?: string } | null = null;
    (mockHttps.request as jest.Mock).mockImplementation((opts: { hostname?: string; path?: string }, cb: (res: unknown) => void) => {
      capturedOptions = opts;
      const req = makeFakeRequest();
      setImmediate(() => {
        const res = makeFakeResponse(200, Buffer.from('{}'));
        cb(res);
        res.emit('data', Buffer.from('{}'));
        res.emit('end');
      });
      return req;
    });

    const fetchFn = createMtlsFetch(cert, key, ca);
    await fetchFn(new URL('https://127.0.0.1:4001/internal/auth?doc=x'));

    expect(capturedOptions!.hostname).toBe('127.0.0.1');
    expect(capturedOptions!.path).toBe('/internal/auth?doc=x');
  });

  it('accepts a Request object as input and extracts its URL', async () => {
    const cert = Buffer.from('cert');
    const key = Buffer.from('key');
    const ca = Buffer.from('ca');

    (mockHttps.Agent as unknown) = jest.fn().mockReturnValue({});
    let capturedOptions: { hostname?: string } | null = null;
    (mockHttps.request as jest.Mock).mockImplementation((opts: { hostname?: string }, cb: (res: unknown) => void) => {
      capturedOptions = opts;
      const req = makeFakeRequest();
      setImmediate(() => {
        const res = makeFakeResponse(200, Buffer.from('{}'));
        cb(res);
        res.emit('data', Buffer.from('{}'));
        res.emit('end');
      });
      return req;
    });

    const fetchFn = createMtlsFetch(cert, key, ca);
    await fetchFn(new Request('https://127.0.0.1:4001/internal/auth'));

    expect(capturedOptions!.hostname).toBe('127.0.0.1');
  });

  it('accepts array-form headers and forwards each entry', async () => {
    const cert = Buffer.from('cert');
    const key = Buffer.from('key');
    const ca = Buffer.from('ca');

    (mockHttps.Agent as unknown) = jest.fn().mockReturnValue({});
    let capturedOptions: { headers?: Record<string, string> } | null = null;
    (mockHttps.request as jest.Mock).mockImplementation((opts: { headers?: Record<string, string> }, cb: (res: unknown) => void) => {
      capturedOptions = opts;
      const req = makeFakeRequest();
      setImmediate(() => {
        const res = makeFakeResponse(200, Buffer.from('{}'));
        cb(res);
        res.emit('data', Buffer.from('{}'));
        res.emit('end');
      });
      return req;
    });

    const fetchFn = createMtlsFetch(cert, key, ca);
    await fetchFn('https://127.0.0.1:4001/path', { headers: [['x-token', 'abc'], ['x-other', 'def']] });

    expect(capturedOptions!.headers?.['x-token']).toBe('abc');
    expect(capturedOptions!.headers?.['x-other']).toBe('def');
  });

  it('forwards Headers instance fields as plain header strings', async () => {
    const cert = Buffer.from('cert');
    const key = Buffer.from('key');
    const ca = Buffer.from('ca');
    const responseBody = '{}';

    (mockHttps.Agent as unknown) = jest.fn().mockReturnValue({});
    let capturedOptions: { headers?: Record<string, string> } | null = null;
    (mockHttps.request as jest.Mock).mockImplementation((opts: { headers?: Record<string, string> }, cb: (res: unknown) => void) => {
      capturedOptions = opts;
      const req = makeFakeRequest();
      setImmediate(() => {
        const res = makeFakeResponse(200, Buffer.from(responseBody));
        cb(res);
        res.emit('data', Buffer.from(responseBody));
        res.emit('end');
      });
      return req;
    });

    const fetchFn = createMtlsFetch(cert, key, ca);
    const headers = new Headers({ 'x-custom': 'value' });
    await fetchFn('https://127.0.0.1:4001/path', { headers });

    expect(capturedOptions!.headers?.['x-custom']).toBe('value');
  });
});
