// Rate limit test for GET /auth/email/confirm
// Separate file so env vars are set before the config singleton is created.
import { buildServer } from '../src/index';
import { emailConfirmRoute } from '../src/routes/email-confirm';
import { startTestContainer, stopTestContainer } from '@asciidocollab/testing';

describe('Email Confirm Rate Limiting', () => {
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
    process.env.ASCIIDOCOLLAB_AUTH_PASSWORD_RESET_RATE_LIMIT_MAX = '100';
    process.env.ASCIIDOCOLLAB_AUTH_PASSWORD_RESET_RATE_LIMIT_WINDOW = '60000';
    process.env.ASCIIDOCOLLAB_AUTH_PASSWORD_CHANGE_RATE_LIMIT_MAX = '100';
    process.env.ASCIIDOCOLLAB_AUTH_PASSWORD_CHANGE_RATE_LIMIT_WINDOW = '60000';
    // Set rate limit to 1 BEFORE buildServer is called
    process.env.ASCIIDOCOLLAB_AUTH_EMAIL_CONFIRM_RATE_LIMIT_MAX = '1';
    process.env.ASCIIDOCOLLAB_AUTH_EMAIL_CONFIRM_RATE_LIMIT_WINDOW = '60000';

    testContext = await startTestContainer();
    app = await buildServer({ prisma: testContext.client });
    await app.register(emailConfirmRoute);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await stopTestContainer(testContext);
  });

  test('second GET /auth/email/confirm request returns 429 with RATE_LIMITED when limit is 1', async () => {
    // First request — hits the endpoint, gets 400 (invalid token), but is not rate-limited yet
    await app.inject({
      method: 'GET',
      url: '/auth/email/confirm?token=first-token',
    });

    // Second request — should be rejected by the rate limiter
    const response = await app.inject({
      method: 'GET',
      url: '/auth/email/confirm?token=second-token',
    });

    expect(response.statusCode).toBe(429);
    const body = response.json();
    expect(body.error.code).toBe('RATE_LIMITED');
    expect(typeof body.error.retryAfter).toBe('number');
  });
});
