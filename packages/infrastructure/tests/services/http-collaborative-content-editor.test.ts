import { ProjectId, YjsStateId } from '@asciidocollab/domain';
import {
  HttpCollaborativeContentEditor,
  COLLAB_APPLY_EDITS_PATH,
} from '../../src/services/http-collaborative-content-editor';

describe('HttpCollaborativeContentEditor', () => {
  const projectId = ProjectId.create('770e8400-e29b-41d4-a716-446655440003');
  const yjsStateId = YjsStateId.create('11111111-e29b-41d4-a716-446655440111');
  const replacements = [{ find: 'include::intro.adoc[]', replace: 'include::overview.adoc[]' }];

  it('POSTs the replacements to the collab apply-edits endpoint and returns ok on 200', async () => {
    const fetchMock = jest.fn().mockResolvedValue(new Response(null, { status: 200 }));
    const editor = new HttpCollaborativeContentEditor({
      baseUrl: 'http://127.0.0.1:4003/',
      secret: 's3cret',
      fetch: fetchMock as unknown as typeof globalThis.fetch,
    });

    const result = await editor.applyReplacements(projectId, yjsStateId, replacements);

    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    // Trailing slash on baseUrl is normalised so the path is not doubled.
    expect(url).toBe(`http://127.0.0.1:4003${COLLAB_APPLY_EDITS_PATH}`);
    expect(init.method).toBe('POST');
    expect(init.headers['content-type']).toBe('application/json');
    expect(init.headers['x-collab-internal-secret']).toBe('s3cret');
    expect(JSON.parse(init.body)).toEqual({
      projectId: projectId.value,
      yjsStateId: yjsStateId.value,
      replacements,
    });
  });

  it('omits the secret header when none is configured', async () => {
    const fetchMock = jest.fn().mockResolvedValue(new Response(null, { status: 200 }));
    const editor = new HttpCollaborativeContentEditor({
      baseUrl: 'http://127.0.0.1:4003',
      fetch: fetchMock as unknown as typeof globalThis.fetch,
    });

    await editor.applyReplacements(projectId, yjsStateId, replacements);
    expect(fetchMock.mock.calls[0][1].headers['x-collab-internal-secret']).toBeUndefined();
  });

  it('returns an error result on a non-2xx response', async () => {
    const fetchMock = jest.fn().mockResolvedValue(new Response(null, { status: 503 }));
    const editor = new HttpCollaborativeContentEditor({
      baseUrl: 'http://127.0.0.1:4003',
      fetch: fetchMock as unknown as typeof globalThis.fetch,
    });

    const result = await editor.applyReplacements(projectId, yjsStateId, replacements);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.message).toContain('503');
  });

  it('returns an error result (never throws) when the request fails', async () => {
    const fetchMock = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const editor = new HttpCollaborativeContentEditor({
      baseUrl: 'http://127.0.0.1:4003',
      fetch: fetchMock as unknown as typeof globalThis.fetch,
    });

    const result = await editor.applyReplacements(projectId, yjsStateId, replacements);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.message).toContain('ECONNREFUSED');
  });

  it('short-circuits with ok and makes no request when there are no replacements', async () => {
    const fetchMock = jest.fn();
    const editor = new HttpCollaborativeContentEditor({
      baseUrl: 'http://127.0.0.1:4003',
      fetch: fetchMock as unknown as typeof globalThis.fetch,
    });

    const result = await editor.applyReplacements(projectId, yjsStateId, []);
    expect(result.success).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('constructs an mTLS fetch when tls is provided and no explicit fetch', () => {
    expect(
      () =>
        new HttpCollaborativeContentEditor({
          baseUrl: 'https://collab.internal:4003',
          tls: { cert: Buffer.from('cert'), key: Buffer.from('key'), ca: Buffer.from('ca') },
        }),
    ).not.toThrow();
  });

  it('prefers an injected fetch over tls', async () => {
    const fetchMock = jest.fn().mockResolvedValue(new Response(null, { status: 200 }));
    const editor = new HttpCollaborativeContentEditor({
      baseUrl: 'https://collab.internal:4003',
      tls: { cert: Buffer.from('cert'), key: Buffer.from('key'), ca: Buffer.from('ca') },
      fetch: fetchMock as unknown as typeof globalThis.fetch,
    });
    await editor.applyReplacements(projectId, yjsStateId, replacements);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
