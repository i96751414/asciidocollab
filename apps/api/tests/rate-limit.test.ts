import { buildServer } from '../src/index';
import { registerRoute } from '../src/routes/register';
import { startTestContainer, stopTestContainer } from '@asciidocollab/testing';
import { setupTestEnvironment } from './helpers/test-environment';

describe('Registration Rate Limiting', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  let testContext: Awaited<ReturnType<typeof startTestContainer>>;

  beforeAll(async () => {
    setupTestEnvironment();
    process.env.ASCIIDOCOLLAB_AUTH_REGISTRATION_RATE_LIMIT_MAX = '3';
    process.env.ASCIIDOCOLLAB_AUTH_REGISTRATION_RATE_LIMIT_WINDOW = '60000';

    testContext = await startTestContainer();
    app = await buildServer({ prisma: testContext.client });
    await app.register(registerRoute);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await stopTestContainer(testContext);
  });

  test('first registration attempt succeeds with 201', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `rate-first-${Date.now()}@example.com`,
        password: 'ValidP@ssw0rd123!',
        displayName: 'First User',
      },
    });
    expect(response.statusCode).toBe(201);
  });

  test('subsequent attempts return 403 REGISTRATION_CLOSED (not rate-limited yet)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `rate-second-${Date.now()}@example.com`,
        password: 'ValidP@ssw0rd123!',
        displayName: 'Second User',
      },
    });
    // Registration is closed (hasAny() = true), not rate-limited yet
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('REGISTRATION_CLOSED');
  });

  test('rejects 4th registration attempt with 429 (rate limit)', async () => {
    // Make 2 more attempts to hit the rate limit of 3 total requests
    await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `rate-block-2-${Date.now()}@example.com`,
        password: 'ValidP@ssw0rd123!',
        displayName: 'User',
      },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `rate-block-4-${Date.now()}@example.com`,
        password: 'ValidP@ssw0rd123!',
        displayName: 'User',
      },
    });
    expect(response.statusCode).toBe(429);
  });
});
