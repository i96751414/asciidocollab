import { buildServer } from '../src/index';
import { loginRoute } from '../src/routes/auth/login';
import { registerRoute } from '../src/routes/auth/register';
import { logoutRoute } from '../src/routes/auth/logout';
import { startTestContainer, stopTestContainer } from '@asciidocollab/testing';
import { setupTestEnvironment } from './helpers/test-environment';

const TEST_EMAIL = 'logout-user@example.com';
const TEST_PASSWORD = 'ValidP@ssw0rd123!';

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

    // Register the single test user
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

  test('logout destroys session', async () => {
    const loginResponse = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: TEST_EMAIL, password: TEST_PASSWORD },
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
