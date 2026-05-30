import { buildServer } from '../../src/index';
import { loginRoute } from '../../src/routes/login';
import { registerRoute } from '../../src/routes/register';
import { logoutRoute } from '../../src/routes/logout';
import { startTestContainer, stopTestContainer } from '@asciidocollab/testing';
import { setupTestEnvironment } from '../helpers/test-environment';
import type { FastifyInstance } from 'fastify';

describe('CSRF enforcement on POST auth routes', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  let testContext: Awaited<ReturnType<typeof startTestContainer>>;

  beforeAll(async () => {
    setupTestEnvironment();

    testContext = await startTestContainer();
    // buildServer() already registers the CSRF plugin — csrfProtection decorator is available
    app = await buildServer({ prisma: testContext.client });

    // Register auth routes inside a CSRF-enforcing scope
    await app.register(async function csrfScopedAuthRoutes(scopedApp: FastifyInstance) {
      scopedApp.addHook('onRequest', scopedApp.csrfProtection);
      await scopedApp.register(loginRoute);
      await scopedApp.register(registerRoute);
      await scopedApp.register(logoutRoute);
    });

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await stopTestContainer(testContext);
  });

  test('POST /auth/login returns 403 without CSRF token', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'test@example.com', password: 'ValidP@ssw0rd123!' },
    });
    expect(response.statusCode).toBe(403);
  });

  test('POST /auth/register returns 403 without CSRF token', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'test@example.com', password: 'ValidP@ssw0rd123!', displayName: 'Test' },
    });
    expect(response.statusCode).toBe(403);
  });

  test('POST /auth/logout returns 403 without CSRF token', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      payload: {},
    });
    expect(response.statusCode).toBe(403);
  });
});
