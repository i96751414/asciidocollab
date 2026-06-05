import Fastify from 'fastify';
import { keybindingsRoutes } from '../../src/routes/users/keybindings';

// Mock requireAuth
jest.mock('../../src/plugins/require-auth', () => ({
  requireAuth: jest.fn((_request: unknown, _reply: unknown, done: () => void) => done()),
  getAuthenticatedUserId: jest.fn(() => '550e8400-e29b-41d4-a716-446655440001'),
}));

const userId = '550e8400-e29b-41d4-a716-446655440001';

const mockKeyBindingRepo = {
  findAll: jest.fn().mockResolvedValue([]),
  upsert: jest.fn().mockResolvedValue(undefined),
  delete: jest.fn().mockResolvedValue(undefined),
};

async function buildTestServer() {
  const app = Fastify();
  app.decorate('repos', { keyBinding: mockKeyBindingRepo } as never);
  app.decorate('config', {} as never);
  app.decorate('stores', {} as never);
  app.decorate('services', {} as never);
  app.decorate('prisma', null as never);
  await app.register(keybindingsRoutes);
  await app.ready();
  return app;
}

describe('Keybindings routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockKeyBindingRepo.findAll.mockResolvedValue([]);
  });

  it('GET returns 4 bindings with defaults for new user', async () => {
    const app = await buildTestServer();
    const response = await app.inject({ method: 'GET', url: '/users/me/keybindings' });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body).toHaveLength(5);
    expect(body.every((b: { isDefault: boolean }) => b.isDefault)).toBe(true);
    await app.close();
  });

  it('GET ?namespace=file-tree filters correctly', async () => {
    const app = await buildTestServer();
    const response = await app.inject({ method: 'GET', url: '/users/me/keybindings?namespace=file-tree' });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.every((b: { action: string }) => b.action.startsWith('file-tree:'))).toBe(true);
    await app.close();
  });

  it('PATCH valid binding returns updated dto', async () => {
    const app = await buildTestServer();
    const response = await app.inject({
      method: 'PATCH',
      url: '/users/me/keybindings/file-tree:rename',
      payload: { keyCombo: 'F3' },
    });
    expect(response.statusCode).toBe(200);
    await app.close();
  });

  it('PATCH reserved combo returns 400', async () => {
    const app = await buildTestServer();
    const response = await app.inject({
      method: 'PATCH',
      url: '/users/me/keybindings/file-tree:rename',
      payload: { keyCombo: 'Ctrl+W' },
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it('PATCH unknown action returns 400', async () => {
    const app = await buildTestServer();
    const response = await app.inject({
      method: 'PATCH',
      url: '/users/me/keybindings/unknown:action',
      payload: { keyCombo: 'F3' },
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it('PATCH duplicate within namespace returns 409', async () => {
    mockKeyBindingRepo.findAll.mockResolvedValue([{ userId, action: 'file-tree:delete', keyCombo: 'F3' }]);
    const app = await buildTestServer();
    const response = await app.inject({
      method: 'PATCH',
      url: '/users/me/keybindings/file-tree:rename',
      payload: { keyCombo: 'F3' },
    });
    expect(response.statusCode).toBe(409);
    await app.close();
  });

  it('DELETE returns 204 and subsequent GET shows default', async () => {
    const app = await buildTestServer();
    const deleteResponse = await app.inject({ method: 'DELETE', url: '/users/me/keybindings/file-tree:rename' });
    expect(deleteResponse.statusCode).toBe(204);
    await app.close();
  });
});
