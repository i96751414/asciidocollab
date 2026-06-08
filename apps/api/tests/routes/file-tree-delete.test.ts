import Fastify from 'fastify';
import { fileTreeDeleteRoutes } from '../../src/routes/projects/file-tree-delete';

jest.mock('../../src/plugins/require-auth', () => ({
  requireAuth: jest.fn((_request: unknown, _rep: unknown, done: () => void) => done()),
  getAuthenticatedUserId: jest.fn(() => '550e8400-e29b-41d4-a716-446655440001'),
}));

const PROJECT_ID = '550e8400-e29b-41d4-a716-446655440002';
const FILE_NODE_ID = '550e8400-e29b-41d4-a716-446655440003';

function buildTestServer(options: { activeSession?: boolean; memberRole?: string } = {}) {
  const app = Fastify();

  app.decorate('repos', {
    projectMember: {
      findByCompositeKey: jest.fn().mockResolvedValue({ role: { value: options.memberRole ?? 'editor' } }),
    },
    fileNode: {
      findById: jest.fn().mockResolvedValue({
        id: { value: FILE_NODE_ID },
        projectId: { value: PROJECT_ID },
        parentId: { value: '550e8400-e29b-41d4-a716-446655440009' },
        type: { value: 'file' },
        name: 'doc.adoc',
        path: { value: '/doc.adoc' },
      }),
      findByParentId: jest.fn().mockResolvedValue([]),
      delete: jest.fn().mockResolvedValue(undefined),
    },
    document: {
      findByFileNodeId: jest.fn().mockResolvedValue(null),
      delete: jest.fn().mockResolvedValue(undefined),
    },
    auditLog: {
      save: jest.fn().mockResolvedValue(undefined),
    },
    collaborationSession: {
      isActive: jest.fn().mockResolvedValue(options.activeSession ?? false),
    },
  });

  app.decorate('stores', {
    fileStore: {
      remove: jest.fn().mockResolvedValue(undefined),
      removeDirectory: jest.fn().mockResolvedValue(undefined),
    },
    yjsStateStore: {
      delete: jest.fn().mockResolvedValue(undefined),
    },
  });

  app.decorate('fileTreeEventBus', {
    emit: jest.fn(),
    on: jest.fn(),
    off: jest.fn(),
  });

  app.register(fileTreeDeleteRoutes);
  return app;
}

describe('DELETE /projects/:projectId/files/:fileNodeId', () => {
  test('returns 204 on successful deletion', async () => {
    const app = buildTestServer();
    const response = await app.inject({
      method: 'DELETE',
      url: `/projects/${PROJECT_ID}/files/${FILE_NODE_ID}`,
    });
    expect(response.statusCode).toBe(204);
  });

  test('returns 409 with { error: { code, message } } when a collaboration session is active', async () => {
    const app = buildTestServer({ activeSession: true });
    // Need a document so the session check fires
    const mockDocument = { id: { value: '550e8400-e29b-41d4-a716-446655440010' } };
    const repos = (app as unknown as { repos: { document: { findByFileNodeId: jest.Mock } } }).repos;
    repos.document.findByFileNodeId.mockResolvedValue(mockDocument);

    const response = await app.inject({
      method: 'DELETE',
      url: `/projects/${PROJECT_ID}/files/${FILE_NODE_ID}`,
    });
    expect(response.statusCode).toBe(409);
    const body = JSON.parse(response.body);
    expect(body.error).toEqual(expect.objectContaining({ code: 'CONFLICT' }));
    expect(typeof body.error.message).toBe('string');
  });
});
