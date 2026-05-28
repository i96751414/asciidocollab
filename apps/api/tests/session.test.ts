import { buildServer } from '../src/index';
import { loginRoute } from '../src/routes/login';
import { registerRoute } from '../src/routes/register';
import { logoutRoute } from '../src/routes/logout';
import { meRoute } from '../src/routes/me';
import { startTestContainer, stopTestContainer } from '@asciidocollab/testing';
import { setupTestEnv } from './helpers/test-env';

describe('Session', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  let testContext: Awaited<ReturnType<typeof startTestContainer>>;

  beforeAll(async () => {
    setupTestEnv();

    testContext = await startTestContainer();
    app = await buildServer({ prisma: testContext.client });
    await app.register(registerRoute);
    await app.register(loginRoute);
    await app.register(logoutRoute);
    await app.register(meRoute);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await stopTestContainer(testContext);
  });

  test('authenticated user can access protected route', async () => {
    const email = `session-${Date.now()}@example.com`;
    await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email, password: 'ValidP@ssw0rd123!', displayName: 'Test User' },
    });

    const loginRes = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email, password: 'ValidP@ssw0rd123!' },
    });
    expect(loginRes.statusCode).toBe(200);

    const sessionCookie = loginRes.cookies[0]?.name + '=' + loginRes.cookies[0]?.value;

    const meRes = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { cookie: sessionCookie },
    });
    expect(meRes.statusCode).toBe(200);
    expect(meRes.json()).toHaveProperty('userId');
  });

  test('unauthenticated user gets 401 on protected route', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/auth/me',
    });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('UNAUTHORIZED');
  });

  test('invalid session cookie gets 401 on protected route', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { cookie: 'sessionId=invalid-session-id' },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('UNAUTHORIZED');
  });

  test('logout invalidates session', async () => {
    const email = `logout-session-${Date.now()}@example.com`;
    await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email, password: 'ValidP@ssw0rd123!', displayName: 'Test User' },
    });

    const loginRes = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email, password: 'ValidP@ssw0rd123!' },
    });
    expect(loginRes.statusCode).toBe(200);

    const sessionCookie = loginRes.cookies[0]?.name + '=' + loginRes.cookies[0]?.value;

    const meRes = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { cookie: sessionCookie },
    });
    expect(meRes.statusCode).toBe(200);

    await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: { cookie: sessionCookie },
    });

    const meAfterLogout = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { cookie: sessionCookie },
    });
    expect(meAfterLogout.statusCode).toBe(401);
  });
});
