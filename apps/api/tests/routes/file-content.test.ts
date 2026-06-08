import Fastify from 'fastify';
import { fileContentRoutes } from '../../src/routes/projects/file-content';

jest.mock('../../src/plugins/require-auth', () => ({
  requireAuth: jest.fn((_request: unknown, _rep: unknown, done: () => void) => done()),
  getAuthenticatedUserId: jest.fn(() => '550e8400-e29b-41d4-a716-446655440001'),
}));

const PROJECT_ID = '550e8400-e29b-41d4-a716-446655440002';
const FILE_NODE_ID = '550e8400-e29b-41d4-a716-446655440003';
const CONTENT_ID = '660e8400-e29b-41d4-a716-446655440004';
const DOC_ID = '770e8400-e29b-41d4-a716-446655440005';
const YJS_STATE_ID = '880e8400-e29b-41d4-a716-446655440006';

function buildTestServer(options: { contentId?: string; activeSession?: boolean } = {}) {
  const app = Fastify();
  app.decorate('repos', {
    projectMember: { findByCompositeKey: jest.fn().mockResolvedValue({ role: { value: 'viewer' } }) },
    fileNode: { findById: jest.fn().mockResolvedValue({ projectId: { value: PROJECT_ID }, path: { value: '/test.adoc' } }) },
    document: {
      findByFileNodeId: jest.fn().mockResolvedValue({
        id: { value: DOC_ID },
        fileNodeId: { value: FILE_NODE_ID },
        contentId: { value: options.contentId ?? CONTENT_ID },
        yjsStateId: { value: YJS_STATE_ID },
        mimeType: { value: 'text/asciidoc' },
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      }),
      save: jest.fn().mockResolvedValue(undefined),
    },
    collaborationSession: {
      isActive: jest.fn().mockResolvedValue(options.activeSession ?? false),
    },
  });
  app.decorate('stores', {
    fileStore: {
      read: jest.fn().mockResolvedValue(Buffer.from('= Hello')),
      write: jest.fn().mockResolvedValue(undefined),
    },
  });
  app.addContentTypeParser('text/plain', { parseAs: 'buffer' }, (_request, body, done) => done(null, body));
  app.register(fileContentRoutes);
  return app;
}

describe('GET /projects/:projectId/files/:fileNodeId/content', () => {
  // Issue C10: ETag must be derived from contentId (a stable domain identifier)
  // not from an MD5 hash computed on every request.
  test('returns ETag header containing the document contentId', async () => {
    const app = buildTestServer({ contentId: CONTENT_ID });
    const response = await app.inject({
      method: 'GET',
      url: `/projects/${PROJECT_ID}/files/${FILE_NODE_ID}/content`,
    });
    expect(response.statusCode).toBe(200);
    const etag = response.headers['etag'];
    expect(etag).toBeDefined();
    // Must contain the contentId UUID, not an arbitrary hash
    expect(etag).toContain(CONTENT_ID);
  });

  test('ETag is stable across identical requests (same contentId → same ETag)', async () => {
    const app = buildTestServer({ contentId: CONTENT_ID });
    const first = await app.inject({ method: 'GET', url: `/projects/${PROJECT_ID}/files/${FILE_NODE_ID}/content` });
    const second = await app.inject({ method: 'GET', url: `/projects/${PROJECT_ID}/files/${FILE_NODE_ID}/content` });
    expect(first.headers['etag']).toBe(second.headers['etag']);
  });
});

describe('PUT /projects/:projectId/files/:fileNodeId/content', () => {
  // Issue 2: PUT must return an ETag so useAutoSave can seed storedEtag for
  // external-change polling. Without it storedEtag stays null and the HEAD
  // poll short-circuits on every tick, making collaborative sync dead.
  test('returns an ETag header after successfully saving content', async () => {
    const app = buildTestServer();
    const response = await app.inject({
      method: 'PUT',
      url: `/projects/${PROJECT_ID}/files/${FILE_NODE_ID}/content`,
      payload: '= Updated',
      headers: { 'content-type': 'text/plain' },
    });
    expect(response.statusCode).toBe(204);
    expect(response.headers['etag']).toBeDefined();
    expect(typeof response.headers['etag']).toBe('string');
    expect((response.headers['etag'] as string).length).toBeGreaterThan(0);
  });

  test('returns 409 with { error: { code, message } } when a collaboration session is active', async () => {
    const app = buildTestServer({ activeSession: true });
    const response = await app.inject({
      method: 'PUT',
      url: `/projects/${PROJECT_ID}/files/${FILE_NODE_ID}/content`,
      payload: '= Updated',
      headers: { 'content-type': 'text/plain' },
    });
    expect(response.statusCode).toBe(409);
    const body = JSON.parse(response.body);
    expect(body.error).toEqual(expect.objectContaining({ code: 'CONFLICT' }));
    expect(typeof body.error.message).toBe('string');
  });
});
