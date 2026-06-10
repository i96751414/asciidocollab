import Fastify from 'fastify';
import { sessionStatusRoute } from '../../../src/routes/auth/session-status';

type Session = {
  userId?: string;
  emailVerified?: boolean;
  isAdmin?: boolean;
};

function buildTestServer(session: Session = {}) {
  const app = Fastify();

  app.addHook('preHandler', async (request) => {
    (request as unknown as { session: Session }).session = session;
  });

  app.register(sessionStatusRoute);
  return app;
}

describe('GET /auth/session-status', () => {
  test('returns { authenticated: false } when session has no userId', async () => {
    const app = buildTestServer({});
    const response = await app.inject({
      method: 'GET',
      url: '/auth/session-status',
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body).toEqual({ authenticated: false });
  });

  test('returns authenticated=true with emailVerified and isAdmin when session has userId', async () => {
    const app = buildTestServer({
      userId: '550e8400-e29b-41d4-a716-446655440001',
      emailVerified: true,
      isAdmin: false,
    });
    const response = await app.inject({
      method: 'GET',
      url: '/auth/session-status',
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body).toEqual({ authenticated: true, emailVerified: true, isAdmin: false });
  });

  test('defaults emailVerified to false when not set on session', async () => {
    const app = buildTestServer({ userId: '550e8400-e29b-41d4-a716-446655440001' });
    const response = await app.inject({
      method: 'GET',
      url: '/auth/session-status',
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.authenticated).toBe(true);
    expect(body.emailVerified).toBe(false);
  });

  test('defaults isAdmin to false when not set on session', async () => {
    const app = buildTestServer({ userId: '550e8400-e29b-41d4-a716-446655440001', emailVerified: true });
    const response = await app.inject({
      method: 'GET',
      url: '/auth/session-status',
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.isAdmin).toBe(false);
  });

  test('returns isAdmin=true when session has isAdmin set', async () => {
    const app = buildTestServer({
      userId: '550e8400-e29b-41d4-a716-446655440001',
      emailVerified: true,
      isAdmin: true,
    });
    const response = await app.inject({
      method: 'GET',
      url: '/auth/session-status',
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.isAdmin).toBe(true);
  });
});
