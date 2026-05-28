import { buildServer } from '../src/index';
import { loginRoute } from '../src/routes/login';
import { registerRoute } from '../src/routes/register';
import { logoutRoute } from '../src/routes/logout';
import { startTestContainer, stopTestContainer } from '@asciidocollab/testing';
import { setupTestEnvironment } from './helpers/test-environment';

describe('Logout', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  let testContext: Awaited<ReturnType<typeof startTestContainer>>;

  beforeAll(async () => {
    setupTestEnvironment();

    testContext = await startTestContainer();
    app = await buildServer({ prisma: testContext.client });
    await app.register(registerRoute);
    await app.register(loginRoute);
    await app.register(logoutRoute);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await stopTestContainer(testContext);
  });

  test('logout destroys session', async () => {
    const email = `logout-${Date.now()}@example.com`;
    await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email, password: 'ValidP@ssw0rd123!', displayName: 'Test User' },
    });

    const loginResponse = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email, password: 'ValidP@ssw0rd123!' },
    });
    expect(loginResponse.statusCode).toBe(200);

    const sessionCookie = loginResponse.cookies[0]?.name + '=' + loginResponse.cookies[0]?.value;

    const logoutResponse = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: { cookie: sessionCookie },
    });
    expect(logoutResponse.statusCode).toBe(200);
    expect(logoutResponse.json()).toEqual({ message: 'Logged out' });
  });

  test('logout without session returns 200', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/logout',
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ message: 'Logged out' });
  });
});
