import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import {
  APPLY_EDITS_PATH,
  parseApplyEditsBody,
  startInternalEditServer,
} from '../src/internal-edit-server';

const PROJECT_ID = '770e8400-e29b-41d4-a716-446655440003';
const YJS_STATE_ID = '11111111-e29b-41d4-a716-446655440111';

const silentLogger = { info: () => {}, error: () => {} } as unknown as import('pino').Logger;

// A fake Hocuspocus whose DirectConnection edits an in-memory string, so the real
// applyEditsToDocument runs end to end without a live collaboration server.
function fakeHocuspocus(initial = 'a'): never {
  let text = initial;
  const ytext = {
    toString: () => text,
    delete: (index: number, length: number) => {
      text = text.slice(0, index) + text.slice(index + length);
    },
    insert: (index: number, value: string) => {
      text = text.slice(0, index) + value + text.slice(index);
    },
  };
  const connection = {
    transact: async (function_: (document: { getText: () => typeof ytext }) => void) =>
      function_({ getText: () => ytext }),
    disconnect: async () => {},
  };
  return { openDirectConnection: jest.fn().mockResolvedValue(connection) } as never;
}

describe('parseApplyEditsBody', () => {
  const valid = JSON.stringify({
    projectId: PROJECT_ID,
    yjsStateId: YJS_STATE_ID,
    replacements: [{ find: 'a', replace: 'b' }],
  });

  it('accepts a well-formed body', () => {
    expect(parseApplyEditsBody(valid)).toEqual({
      projectId: PROJECT_ID,
      yjsStateId: YJS_STATE_ID,
      replacements: [{ find: 'a', replace: 'b' }],
    });
  });

  it('rejects malformed JSON', () => {
    expect(parseApplyEditsBody('{not json')).toBeNull();
  });

  it('rejects non-UUID ids (which would yield a nonsensical room name)', () => {
    expect(parseApplyEditsBody(JSON.stringify({ projectId: '../etc', yjsStateId: YJS_STATE_ID, replacements: [] }))).toBeNull();
    expect(parseApplyEditsBody(JSON.stringify({ projectId: PROJECT_ID, yjsStateId: 'x', replacements: [] }))).toBeNull();
  });

  it('rejects replacements that are not {find,replace} string pairs', () => {
    expect(parseApplyEditsBody(JSON.stringify({ projectId: PROJECT_ID, yjsStateId: YJS_STATE_ID, replacements: 'nope' }))).toBeNull();
    expect(parseApplyEditsBody(JSON.stringify({ projectId: PROJECT_ID, yjsStateId: YJS_STATE_ID, replacements: [{ find: 1, replace: 'b' }] }))).toBeNull();
  });
});

describe('internal edit server (HTTP)', () => {
  let server: Server;
  let baseUrl: string;

  async function waitListening(target: Server): Promise<void> {
    if (target.listening) return;
    await new Promise<void>((resolve) => target.once('listening', () => resolve()));
  }

  async function startWith(options: { secret?: string } = {}): Promise<void> {
    server = startInternalEditServer({
      hocuspocus: fakeHocuspocus(),
      host: '127.0.0.1',
      port: 0,
      logger: silentLogger,
      ...options,
    });
    await waitListening(server);
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  }

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  const body = JSON.stringify({
    projectId: PROJECT_ID,
    yjsStateId: YJS_STATE_ID,
    replacements: [{ find: 'a', replace: 'b' }],
  });

  it('returns 404 for the wrong method or path', async () => {
    await startWith();
    const wrongMethod = await fetch(`${baseUrl}${APPLY_EDITS_PATH}`, { method: 'GET' });
    expect(wrongMethod.status).toBe(404);
    const wrongPath = await fetch(`${baseUrl}/nope`, { method: 'POST', body });
    expect(wrongPath.status).toBe(404);
  });

  it('returns 400 for an invalid body', async () => {
    await startWith();
    const response = await fetch(`${baseUrl}${APPLY_EDITS_PATH}`, { method: 'POST', body: '{bad' });
    expect(response.status).toBe(400);
  });

  it('enforces the shared secret when configured', async () => {
    await startWith({ secret: 'top-secret' });
    const noSecret = await fetch(`${baseUrl}${APPLY_EDITS_PATH}`, {
      method: 'POST',
      headers: { connection: 'close' },
      body,
    });
    expect(noSecret.status).toBe(401);
    await noSecret.text(); // fully consume the response before reconnecting

    const withSecret = await fetch(`${baseUrl}${APPLY_EDITS_PATH}`, {
      method: 'POST',
      headers: { 'x-collab-internal-secret': 'top-secret', connection: 'close' },
      body,
    });
    expect(withSecret.status).toBe(200);
    expect(await withSecret.json()).toEqual({ applied: expect.any(Number) });
  });

  it('returns 500 when applying the edits throws', async () => {
    // openDirectConnection rejects → applyEditsToDocument throws → 500 (no secret required here).
    const hocuspocus = { openDirectConnection: jest.fn().mockRejectedValue(new Error('room boom')) } as never;
    server = startInternalEditServer({ hocuspocus, host: '127.0.0.1', port: 0, logger: silentLogger });
    await waitListening(server);
    const address = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${address.port}${APPLY_EDITS_PATH}`, { method: 'POST', body });
    expect(response.status).toBe(500);
  });
});
