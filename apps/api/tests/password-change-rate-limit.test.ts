// T019: Rate limit test for POST /auth/password/change
// Must be in a separate file so env vars are set before the config singleton is created.
import { buildServer } from '../src/index';
import { registerRoute } from '../src/routes/register';
import { loginRoute } from '../src/routes/login';
import { passwordChangeRoute } from '../src/routes/password-change';
import { startTestContainer, stopTestContainer } from '@asciidocollab/testing';

const TEST_EMAIL = 'pwchange-rl@example.com';
const TEST_PASSWORD = 'InitialP@ssw0rd123!';

describe('Password Change Rate Limiting', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  let testContext: Awaited<ReturnType<typeof startTestContainer>>;
  let sessionCookie = '';

  beforeAll(async () => {
    process.env.ASCIIDOCOLLAB_AUTH_SESSION_SECRET = 'test-secret-32-chars-minimum-for-hs256';
    process.env.ASCIIDOCOLLAB_AUTH_EMAIL_FROM = 'test@example.com';
    process.env.ASCIIDOCOLLAB_AUTH_EMAIL_ENABLED = 'false';
    process.env.ASCIIDOCOLLAB_AUTH_SESSION_ENCRYPTION_KEY = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
    process.env.ASCIIDOCOLLAB_AUTH_COOKIE_SECURE = 'false';
    process.env.ASCIIDOCOLLAB_AUTH_REGISTRATION_RATE_LIMIT_MAX = '100';
    process.env.ASCIIDOCOLLAB_AUTH_REGISTRATION_RATE_LIMIT_WINDOW = '60000';
    process.env.ASCIIDOCOLLAB_AUTH_LOGIN_RATE_LIMIT_MAX = '100';
    process.env.ASCIIDOCOLLAB_AUTH_LOGIN_RATE_LIMIT_WINDOW = '60000';
    process.env.ASCIIDOCOLLAB_AUTH_PASSWORD_RESET_RATE_LIMIT_MAX = '100';
    process.env.ASCIIDOCOLLAB_AUTH_PASSWORD_RESET_RATE_LIMIT_WINDOW = '60000';
    // Set rate limit to 1 BEFORE buildServer is called
    process.env.ASCIIDOCOLLAB_AUTH_PASSWORD_CHANGE_RATE_LIMIT_MAX = '1';
    process.env.ASCIIDOCOLLAB_AUTH_PASSWORD_CHANGE_RATE_LIMIT_WINDOW = '60000';

    testContext = await startTestContainer();
    app = await buildServer({ prisma: testContext.client });
    await app.register(registerRoute);
    await app.register(loginRoute);
    await app.register(passwordChangeRoute);
    await app.ready();

    await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: TEST_EMAIL, password: TEST_PASSWORD, displayName: 'RL User' },
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

  test('first request passes, second returns 429 with retryAfter', async () => {
    // First request counts against rate limit (may succeed or fail, doesn't matter)
    await app.inject({
      method: 'POST',
      url: '/auth/password/change',
      headers: { cookie: sessionCookie },
      payload: { currentPassword: TEST_PASSWORD, newPassword: 'NewP@ssw0rd999!' },
    });

    // Second request should be rate limited
    const response = await app.inject({
      method: 'POST',
      url: '/auth/password/change',
      headers: { cookie: sessionCookie },
      payload: { currentPassword: TEST_PASSWORD, newPassword: 'NewP@ssw0rd999!' },
    });
    expect(response.statusCode).toBe(429);
    const body = response.json();
    expect(body.error.code).toBe('RATE_LIMITED');
    expect(typeof body.error.retryAfter).toBe('number');
  });
});
