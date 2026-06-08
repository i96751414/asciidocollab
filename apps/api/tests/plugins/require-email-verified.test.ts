import Fastify from 'fastify';
import { requireEmailVerified } from '../../src/plugins/require-email-verified';

function buildTestServer(session: Record<string, unknown> = {}) {
  const app = Fastify();
  app.addHook('preHandler', async (request) => {
    (request as unknown as { session: Record<string, unknown> }).session = session;
  });
  app.addHook('preHandler', requireEmailVerified);
  app.get('/test', async (_request, reply) => reply.status(200).send({ ok: true }));
  return app;
}

describe('requireEmailVerified', () => {
  it('passes when userId is set and emailVerified is true', async () => {
    const app = buildTestServer({ userId: 'user-1', emailVerified: true });
    const res = await app.inject({ method: 'GET', url: '/test' });
    expect(res.statusCode).toBe(200);
  });

  it('rejects with 403 when userId is set but emailVerified is false', async () => {
    const app = buildTestServer({ userId: 'user-1', emailVerified: false });
    const res = await app.inject({ method: 'GET', url: '/test' });
    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe('EMAIL_NOT_VERIFIED');
  });

  it('passes when there is no userId (unauthenticated request)', async () => {
    const app = buildTestServer({});
    const res = await app.inject({ method: 'GET', url: '/test' });
    expect(res.statusCode).toBe(200);
  });

  it('rejects with 403 when userId is set and emailVerified is undefined', async () => {
    const app = buildTestServer({ userId: 'user-1' });
    const res = await app.inject({ method: 'GET', url: '/test' });
    expect(res.statusCode).toBe(403);
  });
});
