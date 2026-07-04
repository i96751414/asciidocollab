// GET /auth/me returns displayName and email; 401 without session
import { buildServer } from '../src/index';
import { meRoute } from '../src/routes/auth/me';
import { registerRoute } from '../src/routes/auth/register';
import { loginRoute } from '../src/routes/auth/login';
import { startTestContainer, stopTestContainer } from '@asciidocollab/testing';
import { setupTestEnvironment } from './helpers/test-environment';

const TEST_EMAIL = 'me-route@example.com';
const TEST_PASSWORD = 'ValidP@ssw0rd123!';
const TEST_DISPLAY_NAME = 'Me Route User';

describe('GET /auth/me', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  let testContext: Awaited<ReturnType<typeof startTestContainer>>;
  let sessionCookie = '';

  beforeAll(async () => {
    setupTestEnvironment();

    testContext = await startTestContainer();
    app = await buildServer({ prisma: testContext.client });
    await app.register(registerRoute);
    await app.register(loginRoute);
    await app.register(meRoute);
    await app.ready();

    await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: TEST_EMAIL, password: TEST_PASSWORD, displayName: TEST_DISPLAY_NAME },
    });

    const loginResponse = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: TEST_EMAIL, password: TEST_PASSWORD },
    });
    const cookie = loginResponse.cookies[0];
    sessionCookie = cookie ? `${cookie.name}=${cookie.value}` : '';
  });

  afterAll(async () => {
    await app.close();
    await stopTestContainer(testContext);
  });

  test('returns userId, displayName, and email for authenticated user', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { cookie: sessionCookie },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.userId).toBeDefined();
    expect(body.displayName).toBe(TEST_DISPLAY_NAME);
    expect(body.email).toBe(TEST_EMAIL);
  });

  test('returns 401 when session is absent', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/auth/me',
    });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('UNAUTHORIZED');
  });
});
