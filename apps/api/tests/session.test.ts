import { buildServer } from '../src/index';
import { loginRoute } from '../src/routes/auth/login';
import { registerRoute } from '../src/routes/auth/register';
import { logoutRoute } from '../src/routes/auth/logout';
import { meRoute } from '../src/routes/auth/me';
import { startTestContainer, stopTestContainer } from '@asciidocollab/testing';
import { setupTestEnvironment } from './helpers/test-environment';

const TEST_EMAIL = 'session-user@example.com';
const TEST_PASSWORD = 'ValidP@ssw0rd123!';

describe('Session', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  let testContext: Awaited<ReturnType<typeof startTestContainer>>;

  beforeAll(async () => {
    setupTestEnvironment();

    testContext = await startTestContainer();
    app = await buildServer({ prisma: testContext.client });
    await app.register(registerRoute);
    await app.register(loginRoute);
    await app.register(logoutRoute);
    await app.register(meRoute);
    await app.ready();

    // Register the single test user once
    await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: TEST_EMAIL, password: TEST_PASSWORD, displayName: 'Test User' },
    });
  });

  afterAll(async () => {
    await app.close();
    await stopTestContainer(testContext);
  });

  test('authenticated user can access protected route', async () => {
    const loginResponse = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: TEST_EMAIL, password: TEST_PASSWORD },
    });
    expect(loginResponse.statusCode).toBe(200);

    const sessionCookie = loginResponse.cookies[0]?.name + '=' + loginResponse.cookies[0]?.value;

    const meResponse = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { cookie: sessionCookie },
    });
    expect(meResponse.statusCode).toBe(200);
    expect(meResponse.json()).toHaveProperty('userId');
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
    const loginResponse = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: TEST_EMAIL, password: TEST_PASSWORD },
    });
    expect(loginResponse.statusCode).toBe(200);

    const sessionCookie = loginResponse.cookies[0]?.name + '=' + loginResponse.cookies[0]?.value;

    const meResponse = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { cookie: sessionCookie },
    });
    expect(meResponse.statusCode).toBe(200);

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
