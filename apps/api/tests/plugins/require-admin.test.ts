import Fastify from 'fastify';
import { requireAdmin } from '../../src/plugins/require-admin';

function buildTestServer(session: Record<string, unknown> = {}) {
  const app = Fastify();
  app.addHook('preHandler', async (request) => {
    (request as unknown as { session: Record<string, unknown> }).session = session;
  });
  app.addHook('preHandler', requireAdmin);
  app.get('/test', async (_request, reply) => reply.status(200).send({ ok: true }));
  return app;
}

describe('requireAdmin', () => {
  it('passes when session.isAdmin is true', async () => {
    const app = buildTestServer({ isAdmin: true });
    const res = await app.inject({ method: 'GET', url: '/test' });
    expect(res.statusCode).toBe(200);
  });

  it('rejects with 403 when session.isAdmin is false', async () => {
    const app = buildTestServer({ isAdmin: false });
    const res = await app.inject({ method: 'GET', url: '/test' });
    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe('PERMISSION_DENIED');
  });

  it('rejects with 403 when session.isAdmin is undefined', async () => {
    const app = buildTestServer({});
    const res = await app.inject({ method: 'GET', url: '/test' });
    expect(res.statusCode).toBe(403);
  });
});
