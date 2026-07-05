import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import * as Y from 'yjs';
import { Re2RegexEngine } from '@asciidocollab/infrastructure';
import {
  APPLY_EDITS_PATH,
  APPLY_STRUCTURED_REPLACEMENT_PATH,
  READ_CONTENT_PATH,
  parseApplyEditsBody,
  parseStructuredApplyBody,
  parseReadContentBody,
  startInternalEditServer,
} from '../src/internal-edit-server';

const PROJECT_ID = '770e8400-e29b-41d4-a716-446655440003';
const YJS_STATE_ID = '11111111-e29b-41d4-a716-446655440111';

const regexEngine = new Re2RegexEngine();
const silentLogger = { info: () => {}, error: () => {} } as unknown as import('pino').Logger;

// A YjsStateStore stub — used by the read endpoint for dormant rooms; the apply-edits tests below
// never read a dormant room, so a load() that returns null is fine.
function fakeStateStore(): never {
  return { load: async () => null, save: async () => {}, delete: async () => {}, deleteAllForProject: async () => {} } as never;
}

// A fake Hocuspocus whose DirectConnection edits an in-memory string, so the real
// applyEditsToDocument runs end to end without a live collaboration server. `documents` is the
// in-memory room map the read endpoint consults; seed it via `loadedRooms` for read tests.
function fakeHocuspocus(initial = 'a', loadedRooms: Map<string, Y.Doc> = new Map()): never {
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
  return { openDirectConnection: jest.fn().mockResolvedValue(connection), documents: loadedRooms } as never;
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

describe('parseStructuredApplyBody', () => {
  const valid = {
    projectId: PROJECT_ID,
    yjsStateId: YJS_STATE_ID,
    query: { text: 'foo', mode: 'literal', caseSensitive: true, wholeWord: false },
    replacement: 'bar',
    selections: [{ ordinal: 0, expectedText: 'foo' }],
  };

  it('accepts a well-formed body', () => {
    expect(parseStructuredApplyBody(JSON.stringify(valid))).toEqual(valid);
  });

  it('rejects a non-UUID id, an unknown mode, and a malformed selection', () => {
    expect(parseStructuredApplyBody(JSON.stringify({ ...valid, projectId: '../etc' }))).toBeNull();
    expect(parseStructuredApplyBody(JSON.stringify({ ...valid, query: { ...valid.query, mode: 'glob' } }))).toBeNull();
    expect(parseStructuredApplyBody(JSON.stringify({ ...valid, selections: [{ ordinal: -1, expectedText: 'foo' }] }))).toBeNull();
    expect(parseStructuredApplyBody(JSON.stringify({ ...valid, selections: [{ ordinal: 0 }] }))).toBeNull();
  });

  it('rejects a missing replacement or query', () => {
    expect(parseStructuredApplyBody(JSON.stringify({ ...valid, replacement: 5 }))).toBeNull();
    expect(parseStructuredApplyBody(JSON.stringify({ ...valid, query: 'nope' }))).toBeNull();
  });
});

describe('parseReadContentBody', () => {
  it('accepts a well-formed body', () => {
    expect(parseReadContentBody(JSON.stringify({ projectId: PROJECT_ID, yjsStateId: YJS_STATE_ID }))).toEqual({
      projectId: PROJECT_ID,
      yjsStateId: YJS_STATE_ID,
    });
  });

  it('rejects malformed JSON and non-UUID ids', () => {
    expect(parseReadContentBody('{nope')).toBeNull();
    expect(parseReadContentBody(JSON.stringify({ projectId: '../etc', yjsStateId: YJS_STATE_ID }))).toBeNull();
    expect(parseReadContentBody(JSON.stringify({ projectId: PROJECT_ID, yjsStateId: 'x' }))).toBeNull();
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
    server = await startInternalEditServer({
      hocuspocus: fakeHocuspocus(),
      yjsStateStore: fakeStateStore(),
      regexEngine,
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

  it('applies a structured replacement and returns the applied count', async () => {
    await startWith();
    const response = await fetch(`${baseUrl}${APPLY_STRUCTURED_REPLACEMENT_PATH}`, {
      method: 'POST',
      headers: { connection: 'close' },
      body: JSON.stringify({
        projectId: PROJECT_ID,
        yjsStateId: YJS_STATE_ID,
        query: { text: 'a', mode: 'literal', caseSensitive: true, wholeWord: false },
        replacement: 'Z',
        selections: [{ ordinal: 0, expectedText: 'a' }],
      }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ applied: 1 });
  });

  it('returns 400 for an invalid structured-apply body', async () => {
    await startWith();
    const response = await fetch(`${baseUrl}${APPLY_STRUCTURED_REPLACEMENT_PATH}`, {
      method: 'POST',
      headers: { connection: 'close' },
      body: JSON.stringify({ projectId: PROJECT_ID, yjsStateId: YJS_STATE_ID, query: 'nope', replacement: '', selections: [] }),
    });
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

  it('rejects a same-length but wrong secret (constant-time compare still denies)', async () => {
    await startWith({ secret: 'top-secret' });
    const wrong = await fetch(`${baseUrl}${APPLY_EDITS_PATH}`, {
      method: 'POST',
      headers: { 'x-collab-internal-secret': 'TOP-SECRET', connection: 'close' },
      body,
    });
    expect(wrong.status).toBe(401);
    await wrong.text();
  });

  it('returns 413 for a body larger than the cap without crashing the connection', async () => {
    await startWith();
    const huge = 'x'.repeat(5 * 1024 * 1024); // exceeds MAX_BODY_BYTES (4 MiB)
    const response = await fetch(`${baseUrl}${APPLY_EDITS_PATH}`, {
      method: 'POST',
      headers: { connection: 'close' },
      body: huge,
    });
    expect(response.status).toBe(413);
  });

  it('rejects (does not crash) when the port is already in use', async () => {
    await startWith();
    const inUsePort = (server.address() as AddressInfo).port;
    await expect(
      startInternalEditServer({
        hocuspocus: fakeHocuspocus(),
        yjsStateStore: fakeStateStore(),
        regexEngine,
        host: '127.0.0.1',
        port: inUsePort,
        logger: silentLogger,
      }),
    ).rejects.toMatchObject({ code: 'EADDRINUSE' });
  });

  it('reads live document content via the read-content endpoint', async () => {
    // Seed the in-memory room map with a loaded doc; the read endpoint must return its text verbatim.
    const document = new Y.Doc();
    document.getText('codemirror').insert(0, 'live-text');
    const rooms = new Map<string, Y.Doc>([[`${PROJECT_ID}/${YJS_STATE_ID}`, document]]);
    server = await startInternalEditServer({
      hocuspocus: fakeHocuspocus('a', rooms),
      yjsStateStore: fakeStateStore(),
      regexEngine,
      host: '127.0.0.1',
      port: 0,
      logger: silentLogger,
    });
    await waitListening(server);
    const address = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${address.port}${READ_CONTENT_PATH}`, {
      method: 'POST',
      body: JSON.stringify({ projectId: PROJECT_ID, yjsStateId: YJS_STATE_ID }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ content: 'live-text' });
  });

  it('returns 400 for an invalid read-content body', async () => {
    await startWith();
    const response = await fetch(`${baseUrl}${READ_CONTENT_PATH}`, { method: 'POST', body: '{bad' });
    expect(response.status).toBe(400);
  });

  it('returns 500 when applying the edits throws', async () => {
    // openDirectConnection rejects → applyEditsToDocument throws → 500 (no secret required here).
    const hocuspocus = { openDirectConnection: jest.fn().mockRejectedValue(new Error('room boom')), documents: new Map() } as never;
    server = await startInternalEditServer({ hocuspocus, yjsStateStore: fakeStateStore(), regexEngine, host: '127.0.0.1', port: 0, logger: silentLogger });
    await waitListening(server);
    const address = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${address.port}${APPLY_EDITS_PATH}`, { method: 'POST', body });
    expect(response.status).toBe(500);
  });
});
