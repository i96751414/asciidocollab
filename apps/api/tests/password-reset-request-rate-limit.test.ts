// T013a: Rate limit test for POST /auth/password/reset/request
// Separate file so env vars are set before the config singleton is created.
import { buildServer } from '../src/index';
import { registerRoute } from '../src/routes/register';
import { passwordResetRequestRoute } from '../src/routes/password-reset-request';
import { startTestContainer, stopTestContainer } from '@asciidocollab/testing';

const TEST_EMAIL = 'pwreset-rl@example.com';
const TEST_PASSWORD = 'ValidP@ssw0rd123!';

describe('Password Reset Request Rate Limiting', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  let testContext: Awaited<ReturnType<typeof startTestContainer>>;

  beforeAll(async () => {
    process.env.ASCIIDOCOLLAB_AUTH_SESSION_SECRET = 'test-secret-32-chars-minimum-for-hs256';
    process.env.ASCIIDOCOLLAB_AUTH_EMAIL_FROM = 'test@example.com';
    process.env.ASCIIDOCOLLAB_AUTH_EMAIL_ENABLED = 'false';
    process.env.ASCIIDOCOLLAB_AUTH_SESSION_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    process.env.ASCIIDOCOLLAB_AUTH_COOKIE_SECURE = 'false';
    process.env.ASCIIDOCOLLAB_AUTH_REGISTRATION_RATE_LIMIT_MAX = '100';
    process.env.ASCIIDOCOLLAB_AUTH_REGISTRATION_RATE_LIMIT_WINDOW = '60000';
    process.env.ASCIIDOCOLLAB_AUTH_LOGIN_RATE_LIMIT_MAX = '100';
    process.env.ASCIIDOCOLLAB_AUTH_LOGIN_RATE_LIMIT_WINDOW = '60000';
    // Set rate limit to 1 BEFORE buildServer is called
    process.env.ASCIIDOCOLLAB_AUTH_PASSWORD_RESET_RATE_LIMIT_MAX = '1';
    process.env.ASCIIDOCOLLAB_AUTH_PASSWORD_RESET_RATE_LIMIT_WINDOW = '60000';
    process.env.ASCIIDOCOLLAB_AUTH_PASSWORD_CHANGE_RATE_LIMIT_MAX = '100';
    process.env.ASCIIDOCOLLAB_AUTH_PASSWORD_CHANGE_RATE_LIMIT_WINDOW = '60000';

    testContext = await startTestContainer();
    app = await buildServer({ prisma: testContext.client });
    await app.register(registerRoute);
    await app.register(passwordResetRequestRoute);
    await app.ready();

    await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: TEST_EMAIL, password: TEST_PASSWORD, displayName: 'RL User' },
    });
  });

  afterAll(async () => {
    await app.close();
    await stopTestContainer(testContext);
  });

  test('second request returns 429 with retryAfter when rate limit is 1', async () => {
    await app.inject({
      method: 'POST',
      url: '/auth/password/reset/request',
      payload: { email: TEST_EMAIL },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/auth/password/reset/request',
      payload: { email: TEST_EMAIL },
    });

    expect(response.statusCode).toBe(429);
    const body = response.json();
    expect(body.error.code).toBe('RATE_LIMITED');
    expect(typeof body.error.retryAfter).toBe('number');
  });
});
