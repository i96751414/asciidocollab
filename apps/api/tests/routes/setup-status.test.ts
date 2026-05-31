import { buildServer } from '../../src/index';
import { setupStatusRoute } from '../../src/routes/setup-status';
import { registerRoute } from '../../src/routes/register';
import { startTestContainer, stopTestContainer } from '@asciidocollab/testing';
import { setupTestEnvironment } from '../helpers/test-environment';

describe('GET /auth/setup-status', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  let testContext: Awaited<ReturnType<typeof startTestContainer>>;

  beforeAll(async () => {
    setupTestEnvironment();

    testContext = await startTestContainer();
    app = await buildServer({ prisma: testContext.client });
    await app.register(setupStatusRoute);
    await app.register(registerRoute);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await stopTestContainer(testContext);
  });

  test('returns configured: false with empty database', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/auth/setup-status',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.configured).toBe(false);
    expect(body.passwordPolicy).toBeDefined();
  });

  test('returns configured: true after a user is created', async () => {
    await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `setup-${Date.now()}@example.com`,
        password: 'ValidP@ssw0rd123!',
        displayName: 'Admin User',
      },
    });

    const response = await app.inject({
      method: 'GET',
      url: '/auth/setup-status',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.configured).toBe(true);
    expect(body.passwordPolicy).toBeDefined();
  });
});
