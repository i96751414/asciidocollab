import Fastify, { type FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { renderConfigRoutes } from '../../../src/routes/projects/render-config';

jest.mock('../../../src/plugins/require-auth', () => ({
  requireAuth: jest.fn((_request: unknown, _rep: unknown, done: () => void) => done()),
  getAuthenticatedUserId: jest.fn(() => '550e8400-e29b-41d4-a716-446655440001'),
}));

const PROJECT_ID = '550e8400-e29b-41d4-a716-446655440002';

interface ServerOptions {
  role?: string | null;
  stored?: Record<string, unknown> | null;
}

function buildServer(options: ServerOptions = {}): {
  app: Promise<FastifyInstance>;
  save: jest.Mock;
  auditSave: jest.Mock;
} {
  const { role = 'editor', stored = null } = options;
  const save = jest.fn();
  const auditSave = jest.fn();
  const app = (async (): Promise<FastifyInstance> => {
    const instance = Fastify();
    await instance.register(rateLimit, { global: false });
    instance.decorate('config', {
      project: { renderConfig: { rateLimitMax: 120, rateLimitWindow: 60_000 } },
    } as never);
    instance.decorate('repos', {
      projectRenderConfig: {
        findByProjectId: jest.fn(async () =>
          stored === null ? null : { config: stored, projectId: { value: PROJECT_ID } },
        ),
        save,
      },
      projectMember: {
        findByCompositeKey: jest.fn(async () => (role === null ? null : { role: { value: role } })),
      },
      auditLog: { save: auditSave },
    } as never);
    await instance.register(renderConfigRoutes);
    return instance;
  })();
  return { app, save, auditSave };
}

describe('GET /projects/:projectId/render-config', () => {
  it('returns an empty object when nothing is stored', async () => {
    const { app } = buildServer({ role: 'viewer', stored: null });
    const instance = await app;
    const response = await instance.inject({ method: 'GET', url: `/api/projects/${PROJECT_ID}/render-config` });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: {} });
    await instance.close();
  });

  it('returns the stored config for a member', async () => {
    const { app } = buildServer({ role: 'viewer', stored: { doctype: 'book' } });
    const instance = await app;
    const response = await instance.inject({ method: 'GET', url: `/api/projects/${PROJECT_ID}/render-config` });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: { doctype: 'book' } });
    await instance.close();
  });

  it('returns 403 for a non-member', async () => {
    const { app } = buildServer({ role: null });
    const instance = await app;
    const response = await instance.inject({ method: 'GET', url: `/api/projects/${PROJECT_ID}/render-config` });
    expect(response.statusCode).toBe(403);
    await instance.close();
  });
});

describe('PUT /projects/:projectId/render-config', () => {
  it('saves a valid config for an editor and echoes it back', async () => {
    const { app, save } = buildServer({ role: 'editor' });
    const instance = await app;
    const response = await instance.inject({
      method: 'PUT',
      url: `/api/projects/${PROJECT_ID}/render-config`,
      payload: { doctype: 'book', toc: true, customAttributes: { company: 'Acme' } },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: { doctype: 'book', toc: true, customAttributes: { company: 'Acme' } } });
    expect(save).toHaveBeenCalledTimes(1);
    await instance.close();
  });

  it('rejects a semantically invalid config with 400', async () => {
    const { app, save } = buildServer({ role: 'editor' });
    const instance = await app;
    const response = await instance.inject({
      method: 'PUT',
      url: `/api/projects/${PROJECT_ID}/render-config`,
      payload: { toclevels: 99 },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('ValidationFailed');
    expect(save).not.toHaveBeenCalled();
    await instance.close();
  });

  it('rejects an unknown option key with 400', async () => {
    const { app } = buildServer({ role: 'editor' });
    const instance = await app;
    const response = await instance.inject({
      method: 'PUT',
      url: `/api/projects/${PROJECT_ID}/render-config`,
      payload: { notAnOption: true },
    });
    expect(response.statusCode).toBe(400);
    await instance.close();
  });

  it('returns 403 for a viewer and does not save', async () => {
    const { app, save } = buildServer({ role: 'viewer' });
    const instance = await app;
    const response = await instance.inject({
      method: 'PUT',
      url: `/api/projects/${PROJECT_ID}/render-config`,
      payload: { doctype: 'book' },
    });
    expect(response.statusCode).toBe(403);
    expect(save).not.toHaveBeenCalled();
    await instance.close();
  });
});
