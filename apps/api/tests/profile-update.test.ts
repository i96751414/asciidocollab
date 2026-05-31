// T024: Integration tests for PATCH /auth/profile
import { buildServer } from '../src/index';
import { registerRoute } from '../src/routes/register';
import { loginRoute } from '../src/routes/login';
import { profileUpdateRoute } from '../src/routes/profile-update';
import { startTestContainer, stopTestContainer } from '@asciidocollab/testing';
import { setupTestEnvironment } from './helpers/test-environment';

const TEST_EMAIL = 'profile-update@example.com';
const TEST_PASSWORD = 'ValidP@ssw0rd123!';

describe('PATCH /auth/profile', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  let testContext: Awaited<ReturnType<typeof startTestContainer>>;
  let sessionCookie = '';

  beforeAll(async () => {
    setupTestEnvironment();

    testContext = await startTestContainer();
    app = await buildServer({ prisma: testContext.client });
    await app.register(registerRoute);
    await app.register(loginRoute);
    await app.register(profileUpdateRoute);
    await app.ready();

    await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: TEST_EMAIL, password: TEST_PASSWORD, displayName: 'Original Name' },
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

  test('200 success — updates display name', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/auth/profile',
      headers: { cookie: sessionCookie },
      payload: { displayName: 'Updated Name' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ message: 'Profile updated' });
  });

  test('400 when displayName is empty', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/auth/profile',
      headers: { cookie: sessionCookie },
      payload: { displayName: '' },
    });
    expect(response.statusCode).toBe(400);
  });

  test('400 when displayName exceeds 100 characters', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/auth/profile',
      headers: { cookie: sessionCookie },
      payload: { displayName: 'a'.repeat(101) },
    });
    expect(response.statusCode).toBe(400);
  });

  test('401 when session is absent', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/auth/profile',
      payload: { displayName: 'Any Name' },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('UNAUTHORIZED');
  });
});
