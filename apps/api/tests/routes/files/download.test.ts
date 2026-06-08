import Fastify from 'fastify';
import { Readable } from 'stream';
import { DownloadFileUseCase } from '@asciidocollab/domain';
import { fileDownloadRoute } from '../../../src/routes/files/download';

jest.mock('../../../src/plugins/require-auth', () => ({
  requireAuth: jest.fn((_request: unknown, _rep: unknown, done: () => void) => done()),
  getAuthenticatedUserId: jest.fn(() => '550e8400-e29b-41d4-a716-446655440001'),
}));

const PROJECT_ID   = '550e8400-e29b-41d4-a716-446655440002';
const FILE_NODE_ID = '550e8400-e29b-41d4-a716-446655440003';
const ROOT_NODE_ID = '550e8400-e29b-41d4-a716-446655440004';
// A file node that belongs to a DIFFERENT project — IDOR guard test
const OTHER_PID    = '550e8400-e29b-41d4-a716-446655440005';

function makeFileNode(projectId = PROJECT_ID) {
  return {
    id: { value: FILE_NODE_ID },
    projectId: { value: projectId },
    type: { value: 'file' },
    name: 'readme.adoc',
    path: { value: '/readme.adoc' },
    parentId: { value: ROOT_NODE_ID },
  };
}

function makeFolderNode() {
  return {
    id: { value: FILE_NODE_ID },
    projectId: { value: PROJECT_ID },
    type: { value: 'folder' },
    name: 'docs',
    path: { value: '/docs' },
    parentId: { value: ROOT_NODE_ID },
  };
}

function buildTestServer(options: {
  memberRole?: string | null;
  fileNode?: object | null;
  readStreamResult?: Readable | null;
} = {}) {
  const app = Fastify();
  const { memberRole = 'viewer', fileNode = makeFileNode(), readStreamResult } = options;
  const fileStream = readStreamResult === undefined
    ? Readable.from(Buffer.from('= Hello'))
    : readStreamResult;

  app.decorate('repos', {
    projectMember: {
      findByCompositeKey: jest.fn().mockResolvedValue(
        memberRole ? { role: { value: memberRole } } : null,
      ),
    },
    project: {
      findById: jest.fn().mockResolvedValue({ id: { value: PROJECT_ID }, name: { value: 'My Project' } }),
    },
    fileNode: {
      findById: jest.fn().mockResolvedValue(fileNode),
    },
  });

  app.decorate('stores', {
    fileStore: {
      readStream: jest.fn().mockResolvedValue(fileStream),
    },
  });

  app.decorate('config', {
    downloads: {
      file: { rateLimitMax: 30, rateLimitWindow: 60_000 },
    },
  });

  app.register(fileDownloadRoute);
  return app;
}

describe('GET /projects/:projectId/files/:fileNodeId/download', () => {
  test('member can download file — returns 200', async () => {
    const app = buildTestServer();
    const response = await app.inject({
      method: 'GET',
      url: `/projects/${PROJECT_ID}/files/${FILE_NODE_ID}/download`,
    });
    expect(response.statusCode).toBe(200);
  });

  test('Content-Disposition header contains attachment and filename', async () => {
    const app = buildTestServer();
    const response = await app.inject({
      method: 'GET',
      url: `/projects/${PROJECT_ID}/files/${FILE_NODE_ID}/download`,
    });
    const disposition = response.headers['content-disposition'] as string;
    expect(disposition).toMatch(/attachment/);
    expect(disposition).toMatch(/readme\.adoc/);
  });

  test('folder node returns 400', async () => {
    const app = buildTestServer({ fileNode: makeFolderNode() });
    const response = await app.inject({
      method: 'GET',
      url: `/projects/${PROJECT_ID}/files/${FILE_NODE_ID}/download`,
    });
    expect(response.statusCode).toBe(400);
  });

  test('non-member returns 403', async () => {
    const app = buildTestServer({ memberRole: null });
    const response = await app.inject({
      method: 'GET',
      url: `/projects/${PROJECT_ID}/files/${FILE_NODE_ID}/download`,
    });
    expect(response.statusCode).toBe(403);
  });

  test('file from different project returns 404 (IDOR guard)', async () => {
    // File node exists but belongs to a different project
    const app = buildTestServer({ fileNode: makeFileNode(OTHER_PID) });
    const response = await app.inject({
      method: 'GET',
      url: `/projects/${PROJECT_ID}/files/${FILE_NODE_ID}/download`,
    });
    expect(response.statusCode).toBe(404);
  });

  test('fileNode not found returns 404', async () => {
    const app = buildTestServer({ fileNode: null });
    const response = await app.inject({
      method: 'GET',
      url: `/projects/${PROJECT_ID}/files/${FILE_NODE_ID}/download`,
    });
    expect(response.statusCode).toBe(404);
  });

  test('fileStore.readStream() returns null → 404 (filesystem/DB desync)', async () => {
    const app = buildTestServer({ readStreamResult: null });
    const response = await app.inject({
      method: 'GET',
      url: `/projects/${PROJECT_ID}/files/${FILE_NODE_ID}/download`,
    });
    expect(response.statusCode).toBe(404);
  });

  test('rate limit returns 429 when exceeded', async () => {
     
    const rateLimit = require('@fastify/rate-limit') as { default: typeof import('@fastify/rate-limit')['default'] };
    const app = Fastify();

    app.decorate('repos', {
      projectMember: { findByCompositeKey: jest.fn().mockResolvedValue({ role: { value: 'viewer' } }) },
      project: { findById: jest.fn().mockResolvedValue({ id: { value: PROJECT_ID }, name: { value: 'P' } }) },
      fileNode: { findById: jest.fn().mockResolvedValue(makeFileNode()) },
    });
    app.decorate('stores', { fileStore: { readStream: jest.fn().mockResolvedValue(Readable.from('hello')) } });
    app.decorate('config', { downloads: { file: { rateLimitMax: 1, rateLimitWindow: 60_000 } } });

    await app.register(rateLimit.default, { global: false });
    app.register(fileDownloadRoute);
    await app.ready();

    // First request — counts against limit
    await app.inject({ method: 'GET', url: `/projects/${PROJECT_ID}/files/${FILE_NODE_ID}/download` });
    // Second request — rate limited
    const response = await app.inject({ method: 'GET', url: `/projects/${PROJECT_ID}/files/${FILE_NODE_ID}/download` });
    expect(response.statusCode).toBe(429);
  });
});

describe('GET /projects/:projectId/files/:fileNodeId/download — use case error paths', () => {
  afterEach(() => jest.restoreAllMocks());

  test('returns 500 INTERNAL_ERROR for unexpected use case error', async () => {
    jest.spyOn(DownloadFileUseCase.prototype, 'execute').mockResolvedValue({
      success: false,
      error: new Error('unexpected') as never,
    });
    const app = buildTestServer();
    const response = await app.inject({
      method: 'GET',
      url: `/projects/${PROJECT_ID}/files/${FILE_NODE_ID}/download`,
    });
    expect(response.statusCode).toBe(500);
    expect(JSON.parse(response.body).error.code).toBe('INTERNAL_ERROR');
  });
});
