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

  test('allows up to 3 registrations per IP', async () => {
    for (let index = 0; index < 3; index++) {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: `rate-${index}-${Date.now()}@example.com`,
          password: 'ValidP@ssw0rd123!',
          displayName: 'Test User',
        },
      });
      expect(response.statusCode).toBe(201);
    }
  });

  test('rejects 4th registration with 429', async () => {
    for (let index = 0; index < 3; index++) {
      await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: `rate-block-${index}-${Date.now()}@example.com`,
          password: 'ValidP@ssw0rd123!',
          displayName: 'Test User',
        },
      });
    }

    const response = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `rate-block-overflow-${Date.now()}@example.com`,
        password: 'ValidP@ssw0rd123!',
        displayName: 'Test User',
      },
    });
    expect(response.statusCode).toBe(429);
  });
});
