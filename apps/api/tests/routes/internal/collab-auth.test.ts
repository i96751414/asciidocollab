import Fastify from 'fastify';
import { collabAuthRoute } from '../../../src/routes/internal/collab-auth';

const USER_ID = '550e8400-e29b-41d4-a716-446655440001';
const PROJECT_ID = '550e8400-e29b-41d4-a716-446655440002';
const FILE_NODE_ID = '550e8400-e29b-41d4-a716-446655440005';
const YJS_STATE_ID = '550e8400-e29b-41d4-a716-446655440003';
const DOC_ID = '550e8400-e29b-41d4-a716-446655440004';
const DOCUMENT_NAME = `${PROJECT_ID}/${YJS_STATE_ID}`;

const mockDocument = {
  id: { value: DOC_ID },
  fileNodeId: { value: FILE_NODE_ID },
};

function makeProjectId(value: string) {
  return { value, equals: (other: { value: string }) => other.value === value };
}

function buildTestServer(options: {
  authenticated?: boolean;
  memberRole?: string | null;
  fileNodeProjectId?: string;
} = {}) {
  const { authenticated = true, memberRole = 'editor', fileNodeProjectId = PROJECT_ID } = options;
  const app = Fastify();

  app.addHook('preHandler', async (request) => {
    (request as unknown as { session: { userId: string } }).session = authenticated ? { userId: USER_ID } : {};
  });

  const document = mockDocument;
  const member = memberRole === null ? null : { role: { value: memberRole } };
  const fileNode = { id: { value: FILE_NODE_ID }, projectId: makeProjectId(fileNodeProjectId) };

  app.decorate('repos', {
    document: {
      findByYjsStateId: jest.fn().mockResolvedValue(document),
    },
    fileNode: {
      findById: jest.fn().mockResolvedValue(fileNode),
    },
    projectMember: {
      findByCompositeKey: jest.fn().mockResolvedValue(member),
    },
  });

  app.register(collabAuthRoute);
  return app;
}

describe('GET /internal/collab/auth', () => {
  describe('valid member (editor/owner) → 200 { role: "editor" }', () => {
    test('editor role returns 200 with role editor', async () => {
      const app = buildTestServer({ authenticated: true, memberRole: 'editor' });
      const response = await app.inject({
        method: 'GET',
        url: `/internal/collab/auth?documentName=${DOCUMENT_NAME}`,
      });
      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toEqual({ role: 'editor', userId: USER_ID });
    });

    test('findByCompositeKey is called with (projectId, userId) — args not swapped', async () => {
      const app = buildTestServer({ authenticated: true, memberRole: 'editor' });
      await app.inject({
        method: 'GET',
        url: `/internal/collab/auth?documentName=${DOCUMENT_NAME}`,
      });
      const mock = (app as unknown as { repos: { projectMember: { findByCompositeKey: jest.Mock } } })
        .repos.projectMember.findByCompositeKey;
      expect(mock).toHaveBeenCalledWith(
        expect.objectContaining({ value: PROJECT_ID }),
        expect.objectContaining({ value: USER_ID }),
      );
    });

    test('owner role returns 200 with role editor', async () => {
      const app = buildTestServer({ authenticated: true, memberRole: 'owner' });
      const response = await app.inject({
        method: 'GET',
        url: `/internal/collab/auth?documentName=${DOCUMENT_NAME}`,
      });
      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toEqual({ role: 'editor', userId: USER_ID });
    });
  });

  test('viewer → 200 { role: "observer" }', async () => {
    const app = buildTestServer({ authenticated: true, memberRole: 'viewer' });
    const response = await app.inject({
      method: 'GET',
      url: `/internal/collab/auth?documentName=${DOCUMENT_NAME}`,
    });
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ role: 'observer', userId: USER_ID });
  });

  test('unauthenticated → 401', async () => {
    const app = buildTestServer({ authenticated: false });
    const response = await app.inject({
      method: 'GET',
      url: `/internal/collab/auth?documentName=${DOCUMENT_NAME}`,
    });
    expect(response.statusCode).toBe(401);
  });

  test('non-member → 403', async () => {
    const app = buildTestServer({ authenticated: true, memberRole: null });
    const response = await app.inject({
      method: 'GET',
      url: `/internal/collab/auth?documentName=${DOCUMENT_NAME}`,
    });
    expect(response.statusCode).toBe(403);
  });

  // T060 / SEC4 / §Audit: authorization denials are logged with actor, resource, reason.
  test('a 403 denial is logged with actor (userId), resource (documentName), and reason', async () => {
    const warn = jest.fn();
    const recordingLogger = {
      level: 'info',
      fatal: jest.fn(), error: jest.fn(), warn, info: jest.fn(), debug: jest.fn(),
      trace: jest.fn(), silent: jest.fn(),
      child() { return recordingLogger; },
    };
    const app = Fastify({ loggerInstance: recordingLogger });
    app.addHook('preHandler', async (request) => {
      (request as unknown as { session: { userId: string } }).session = { userId: USER_ID };
    });
    app.decorate('repos', {
      document: { findByYjsStateId: jest.fn().mockResolvedValue(null) },
      fileNode: { findById: jest.fn().mockResolvedValue(null) },
      projectMember: { findByCompositeKey: jest.fn().mockResolvedValue(null) },
    });
    app.register(collabAuthRoute);

    await app.inject({ method: 'GET', url: `/internal/collab/auth?documentName=${DOCUMENT_NAME}` });

    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ actor: USER_ID, resource: DOCUMENT_NAME, reason: expect.any(String) }),
      expect.any(String),
    );
    expect(JSON.stringify(warn.mock.calls)).not.toContain('Cookie');
  });

  test('malformed documentName (not UUIDs) → 400', async () => {
    const app = buildTestServer({ authenticated: true });
    const response = await app.inject({
      method: 'GET',
      url: `/internal/collab/auth?documentName=not-a-uuid/not-a-uuid`,
    });
    expect(response.statusCode).toBe(400);
  });

  test('missing documentName → 400', async () => {
    const app = buildTestServer({ authenticated: true });
    const response = await app.inject({
      method: 'GET',
      url: `/internal/collab/auth`,
    });
    expect(response.statusCode).toBe(400);
  });

  test('unknown yjsStateId (document not found) → 403', async () => {
    const app = Fastify();
    app.addHook('preHandler', async (request) => {
      (request as unknown as { session: { userId: string } }).session = { userId: USER_ID };
    });
    app.decorate('repos', {
      document: {
        findByYjsStateId: jest.fn().mockResolvedValue(null),
      },
      fileNode: {
        findById: jest.fn().mockResolvedValue(null),
      },
      projectMember: {
        findByCompositeKey: jest.fn().mockResolvedValue(null),
      },
    });
    app.register(collabAuthRoute);

    const response = await app.inject({
      method: 'GET',
      url: `/internal/collab/auth?documentName=${DOCUMENT_NAME}`,
    });
    expect(response.statusCode).toBe(403);
  });

  test('cross-project bypass attempt → 403 (document belongs to different project)', async () => {
    const OTHER_PROJECT_ID = '550e8400-e29b-41d4-a716-446655440099';
    // Room name claims PROJECT_ID but the document's file node belongs to OTHER_PROJECT_ID.
    const app = buildTestServer({ fileNodeProjectId: OTHER_PROJECT_ID, memberRole: 'editor' });
    const response = await app.inject({
      method: 'GET',
      url: `/internal/collab/auth?documentName=${DOCUMENT_NAME}`,
    });
    expect(response.statusCode).toBe(403);
  });
});
