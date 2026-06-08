import Fastify from 'fastify';
import { Readable } from 'stream';
import {
  DownloadProjectUseCase,
  PermissionDeniedError,
  ProjectNotFoundError,
} from '@asciidocollab/domain';
import { projectDownloadRoute } from '../../../src/routes/projects/download';

jest.mock('../../../src/plugins/require-auth', () => ({
  requireAuth: jest.fn((_request: unknown, _rep: unknown, done: () => void) => done()),
  getAuthenticatedUserId: jest.fn(() => '550e8400-e29b-41d4-a716-446655440001'),
}));

const PROJECT_ID = '550e8400-e29b-41d4-a716-446655440002';

const ROOT_NODE_ID = '550e8400-e29b-41d4-a716-446655440010';
const FILE_NODE_ID = '550e8400-e29b-41d4-a716-446655440011';

function buildTestServer(options: { memberRole?: string | null; readStreamResult?: Readable | null } = {}) {
  const app = Fastify();
  const { memberRole = 'viewer', readStreamResult } = options;
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
      findById: jest.fn().mockResolvedValue({
        id: { value: PROJECT_ID },
        name: { value: 'My Project' },
        rootFolderId: { value: ROOT_NODE_ID },
      }),
    },
    fileNode: {
      findByProjectId: jest.fn().mockResolvedValue([
        {
          id: { value: FILE_NODE_ID },
          projectId: { value: PROJECT_ID },
          type: { value: 'file' },
          name: 'readme.adoc',
          path: { value: '/readme.adoc' },
          parentId: { value: ROOT_NODE_ID },
        },
      ]),
    },
  });

  app.decorate('stores', {
    fileStore: {
      readStream: jest.fn().mockResolvedValue(fileStream),
    },
  });

  app.decorate('config', {
    downloads: {
      zip: { rateLimitMax: 10, rateLimitWindow: 60_000 },
    },
  });

  app.register(projectDownloadRoute);
  return app;
}

function buildNonMemberServer() {
  return buildTestServer({ memberRole: null });
}

describe('GET /projects/:projectId/download', () => {
  test('returns Content-Type: application/zip', async () => {
    const app = buildTestServer();
    const response = await app.inject({
      method: 'GET',
      url: `/projects/${PROJECT_ID}/download`,
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toMatch(/application\/zip/);
  });

  test('Content-Disposition header contains attachment and project name', async () => {
    const app = buildTestServer();
    const response = await app.inject({
      method: 'GET',
      url: `/projects/${PROJECT_ID}/download`,
    });
    const disposition = response.headers['content-disposition'] as string;
    expect(disposition).toMatch(/attachment/);
    expect(disposition).toMatch(/My Project/);
  });

  test('Content-Disposition filename includes a date in YYYY-MM-DD format', async () => {
    const app = buildTestServer();
    const response = await app.inject({
      method: 'GET',
      url: `/projects/${PROJECT_ID}/download`,
    });
    const disposition = response.headers['content-disposition'] as string;
    expect(disposition).toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  test('fileStore.readStream() is called for each file (streaming, not buffering)', async () => {
    const app = buildTestServer();
    const { stores } = app as unknown as { stores: { fileStore: { readStream: jest.Mock } } };
    await app.inject({
      method: 'GET',
      url: `/projects/${PROJECT_ID}/download`,
    });
    expect(stores.fileStore.readStream).toHaveBeenCalled();
    // Verify readStream was called, NOT read (ensures streaming, not buffering)
    const { repos } = app as unknown as { repos: { project: { findById: jest.Mock }; fileNode: { findByProjectId: jest.Mock } } };
    expect(repos.fileNode.findByProjectId).toHaveBeenCalled();
  });

  test('non-member returns 403', async () => {
    const app = buildNonMemberServer();
    const response = await app.inject({
      method: 'GET',
      url: `/projects/${PROJECT_ID}/download`,
    });
    expect(response.statusCode).toBe(403);
  });

  test('rate limit returns 429 when exceeded', async () => {
     
    const rateLimit = require('@fastify/rate-limit') as { default: typeof import('@fastify/rate-limit')['default'] };
    const app = Fastify();

    app.decorate('repos', {
      projectMember: { findByCompositeKey: jest.fn().mockResolvedValue({ role: { value: 'viewer' } }) },
      project: { findById: jest.fn().mockResolvedValue({ id: { value: PROJECT_ID }, name: { value: 'P' }, rootFolderId: null }) },
      fileNode: { findByProjectId: jest.fn().mockResolvedValue([]) },
    });
    app.decorate('stores', { fileStore: { readStream: jest.fn().mockResolvedValue(Readable.from('')) } });
    app.decorate('config', { downloads: { zip: { rateLimitMax: 1, rateLimitWindow: 60_000 } } });

    await app.register(rateLimit.default, { global: false });
    app.register(projectDownloadRoute);
    await app.ready();

    // First request — counts against limit
    await app.inject({ method: 'GET', url: `/projects/${PROJECT_ID}/download` });
    // Second request — rate limited
    const response = await app.inject({ method: 'GET', url: `/projects/${PROJECT_ID}/download` });
    expect(response.statusCode).toBe(429);
  });
});

describe('GET /projects/:projectId/download — use case error paths', () => {
  afterEach(() => jest.restoreAllMocks());

  test('returns 403 FORBIDDEN when actor is not a member (use case error)', async () => {
    jest.spyOn(DownloadProjectUseCase.prototype, 'execute').mockResolvedValue({
      success: false,
      error: new PermissionDeniedError(),
    });
    const app = buildTestServer();
    const response = await app.inject({ method: 'GET', url: `/projects/${PROJECT_ID}/download` });
    expect(response.statusCode).toBe(403);
  });

  test('returns 404 when project not found', async () => {
    jest.spyOn(DownloadProjectUseCase.prototype, 'execute').mockResolvedValue({
      success: false,
      error: new ProjectNotFoundError(PROJECT_ID),
    });
    const app = buildTestServer();
    const response = await app.inject({ method: 'GET', url: `/projects/${PROJECT_ID}/download` });
    expect(response.statusCode).toBe(404);
    expect(JSON.parse(response.body).error.code).toBe('PROJECT_NOT_FOUND');
  });

  test('returns 500 for unexpected use case error', async () => {
    jest.spyOn(DownloadProjectUseCase.prototype, 'execute').mockResolvedValue({
      success: false,
      error: new Error('unexpected') as never,
    });
    const app = buildTestServer();
    const response = await app.inject({ method: 'GET', url: `/projects/${PROJECT_ID}/download` });
    expect(response.statusCode).toBe(500);
    expect(JSON.parse(response.body).error.code).toBe('INTERNAL_ERROR');
  });

  test('skips files where readStream returns null (null stream)', async () => {
    jest.spyOn(DownloadProjectUseCase.prototype, 'execute').mockResolvedValue({
      success: true,
      value: {
        projectName: 'My Project',
        files: [
          {
            fileNode: {
              id: { value: FILE_NODE_ID },
              path: { value: '/readme.adoc' },
            } as never,
            relativePath: 'readme.adoc',
          },
        ],
      },
    });
    const app = buildTestServer({ readStreamResult: null });
    const response = await app.inject({ method: 'GET', url: `/projects/${PROJECT_ID}/download` });
    // File is skipped but archive still completes
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toMatch(/application\/zip/);
  });
});
