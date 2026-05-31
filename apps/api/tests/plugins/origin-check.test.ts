import Fastify from 'fastify';
import { originCheckPlugin } from '../../src/plugins/origin-check';

const ALLOWED_ORIGIN = 'http://localhost:3000';

async function buildTestApp(): Promise<ReturnType<typeof Fastify>> {
  const app = Fastify();
  process.env.ASCIIDOCOLLAB_API_FRONTEND_URL = ALLOWED_ORIGIN;
  await app.register(originCheckPlugin);
  app.post('/test', async (_request, reply) => reply.status(200).send({ ok: true }));
  app.patch('/test', async (_request, reply) => reply.status(200).send({ ok: true }));
  app.delete('/test', async (_request, reply) => reply.status(200).send({ ok: true }));
  app.get('/test', async (_request, reply) => reply.status(200).send({ ok: true }));
  await app.ready();
  return app;
}

describe('originCheckPlugin', () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>;
  let originalNodeEnvironment: string | undefined;

  beforeAll(async () => {
    originalNodeEnvironment = process.env.NODE_ENV;
    // Enable origin check enforcement (plugin skips in test mode)
    process.env.NODE_ENV = 'production';
    app = await buildTestApp();
  });

  afterAll(async () => {
    process.env.NODE_ENV = originalNodeEnvironment;
    await app.close();
  });

  test('GET request passes without Origin check', async () => {
    const response = await app.inject({ method: 'GET', url: '/test' });
    expect(response.statusCode).toBe(200);
  });

  test('POST with correct Origin passes', async () => {
    const response = await app.inject({
      method: 'POST', url: '/test',
      headers: { origin: ALLOWED_ORIGIN },
    });
    expect(response.statusCode).toBe(200);
  });

  test('PATCH with correct Origin passes', async () => {
    const response = await app.inject({
      method: 'PATCH', url: '/test',
      headers: { origin: ALLOWED_ORIGIN },
    });
    expect(response.statusCode).toBe(200);
  });

  test('DELETE with correct Origin passes', async () => {
    const response = await app.inject({
      method: 'DELETE', url: '/test',
      headers: { origin: ALLOWED_ORIGIN },
    });
    expect(response.statusCode).toBe(200);
  });

  test('POST with wrong Origin returns 403', async () => {
    const response = await app.inject({
      method: 'POST', url: '/test',
      headers: { origin: 'http://evil.example.com' },
    });
    expect(response.statusCode).toBe(403);
    expect(JSON.parse(response.body).error.code).toBe('FORBIDDEN_ORIGIN');
  });

  test('POST with missing Origin passes (non-browser clients are not CSRF-vulnerable)', async () => {
    const response = await app.inject({ method: 'POST', url: '/test' });
    expect(response.statusCode).toBe(200);
  });

  test('DELETE with missing Origin passes (non-browser clients are not CSRF-vulnerable)', async () => {
    const response = await app.inject({ method: 'DELETE', url: '/test' });
    expect(response.statusCode).toBe(200);
  });
});
