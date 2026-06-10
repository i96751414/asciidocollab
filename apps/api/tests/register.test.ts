import { buildServer } from '../src/index';
import { registerRoute } from '../src/routes/auth/register';
import { startTestContainer, stopTestContainer } from '@asciidocollab/testing';
import { setupTestEnvironment } from './helpers/test-environment';

describe('Registration', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  let testContext: Awaited<ReturnType<typeof startTestContainer>>;

  beforeAll(async () => {
    setupTestEnvironment();
    process.env.ASCIIDOCOLLAB_AUTH_REGISTER_RATE_MAX = '100';
    process.env.ASCIIDOCOLLAB_AUTH_REGISTER_RATE_WINDOW = '60000';

    testContext = await startTestContainer();
    app = await buildServer({ prisma: testContext.client });
    await app.register(registerRoute);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await stopTestContainer(testContext);
  });

  // Validation tests run BEFORE any user is created (hasAny() returns false)
  test('invalid email returns 400', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'not-an-email', password: 'ValidP@ssw0rd123!', displayName: 'Test User' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('VALIDATION_ERROR');
  });

  test('weak password returns 400', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: `weak-${Date.now()}@example.com`, password: 'short', displayName: 'Test User' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('VALIDATION_ERROR');
  });

  test('register with valid data returns 201', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: `test-${Date.now()}@example.com`, password: 'ValidP@ssw0rd123!', displayName: 'Test User' },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ message: 'Account created' });
  });

  test('second registration attempt returns 403 REGISTRATION_CLOSED', async () => {
    const second = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: `new-${Date.now()}@example.com`, password: 'OtherP@ssw0rd456!', displayName: 'Test User 2' },
    });
    expect(second.statusCode).toBe(403);
    expect(second.json().error.code).toBe('REGISTRATION_CLOSED');
  });
});
