import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Fastify from 'fastify';
import { assetsRoutes } from '../../src/routes/projects/assets';

jest.mock('../../src/plugins/require-auth', () => ({
  requireAuth: jest.fn((_req: unknown, _reply: unknown, done: () => void) => done()),
  getAuthenticatedUserId: jest.fn(() => '550e8400-e29b-41d4-a716-446655440001'),
}));

async function buildAssetsTestServer() {
  const app = Fastify();
  app.decorate('repos', {
    projectMember: { findByCompositeKey: jest.fn().mockResolvedValue({ role: { value: 'editor' } }) },
    fileNode: { findById: jest.fn().mockResolvedValue(null) },
    asset: { findById: jest.fn().mockResolvedValue(null), save: jest.fn(), findByProjectId: jest.fn().mockResolvedValue([]) },
    systemSetting: { get: jest.fn().mockResolvedValue(null) },
  } as never);
  app.decorate('stores', { fileStore: {} } as never);
  app.decorate('config', { storage: { maxUploadSizeBytes: 20_971_520 } } as never);
  app.decorate('fileTreeEventBus', { emit: jest.fn() } as never);
  await app.register(assetsRoutes);
  await app.ready();
  return app;
}

describe('assets route — runtime validation', () => {
  it('returns 400 when parentId query param is missing', async () => {
    const app = await buildAssetsTestServer();
    const response = await app.inject({
      method: 'POST',
      url: '/projects/770e8400-e29b-41d4-a716-446655440003/assets',
      // multipart with no parentId in query string
      headers: { 'content-type': 'multipart/form-data; boundary=boundary' },
      payload: [
        '--boundary',
        'Content-Disposition: form-data; name="file"; filename="test.png"',
        'Content-Type: image/png',
        '',
        'hello',
        '--boundary--',
      ].join('\r\n'),
    });
    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    await app.close();
  });
});

describe('assets route — ValidationError branching', () => {
  const source = readFileSync(
    join(__dirname, '../../src/routes/projects/assets.ts'),
    'utf8',
  );

  it('source contains explicit handling for the empty-file message', () => {
    expect(source).toMatch(/File must not be empty/);
  });

  it('ValidationError block contains a 400 response for the empty-file case', () => {
    // Find the ValidationError handler block and verify it has a status(400) branch
    const validationBlock = source.match(
      /instanceof ValidationError\)([\s\S]*?)(?=if \(result\.error instanceof FileConflictError)/
    )?.[1] ?? '';
    expect(validationBlock).toMatch(/status\(400\)/);
  });

  it('route validates parentId presence before passing to FileNodeId.create', () => {
    // The route must either have a Fastify schema requiring parentId,
    // or an explicit guard before FileNodeId.create
    const hasGuard =
      source.includes("if (!request.query.parentId)") ||
      source.includes('if (!parentId)') ||
      source.includes('parentId == null') ||
      source.includes('parentId === undefined') ||
      source.includes("required: ['parentId']") ||
      source.includes('required: ["parentId"]');
    expect(hasGuard).toBe(true);
  });
});
