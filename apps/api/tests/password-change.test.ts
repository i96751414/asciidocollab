import { buildServer } from '../src/index';
import { loginRoute } from '../src/routes/login';
import { registerRoute } from '../src/routes/register';
import { passwordChangeRoute } from '../src/routes/password-change';
import { startTestContainer, stopTestContainer } from '@asciidocollab/testing';
import { setupTestEnvironment } from './helpers/test-environment';

const TEST_EMAIL = 'pwchange@example.com';
const INITIAL_PASSWORD = 'InitialP@ssw0rd123!';

describe('Password Change', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  let testContext: Awaited<ReturnType<typeof startTestContainer>>;
  let currentPassword = INITIAL_PASSWORD;
  let sessionCookie = '';

  async function refreshSession(): Promise<string> {
    const loginResponse = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: TEST_EMAIL, password: currentPassword },
    });
    const cookie = loginResponse.cookies[0];
    return cookie ? `${cookie.name}=${cookie.value}` : '';
  }

  beforeAll(async () => {
    setupTestEnvironment();

    testContext = await startTestContainer();
    app = await buildServer({ prisma: testContext.client });
    await app.register(registerRoute);
    await app.register(loginRoute);
    await app.register(passwordChangeRoute);
    await app.ready();

    // Register the single test user
    await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: TEST_EMAIL, password: INITIAL_PASSWORD, displayName: 'Test User' },
    });

    sessionCookie = await refreshSession();
  });

  afterAll(async () => {
    await app.close();
    await stopTestContainer(testContext);
  });

  test('unauthorized request returns 401', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/password/change',
      payload: { currentPassword: INITIAL_PASSWORD, newPassword: 'NewP@ssw0rd456!' },
    });
    expect(response.statusCode).toBe(401);
  });

  test('wrong current password returns 400', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/password/change',
      headers: { cookie: sessionCookie },
      payload: { currentPassword: 'WrongP@ssw0rd!', newPassword: 'NewP@ssw0rd456!' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('INVALID_PASSWORD');
  });

  test('successful password change returns 200', async () => {
    const newPassword = 'ChangedP@ssw0rd456!';
    const response = await app.inject({
      method: 'POST',
      url: '/auth/password/change',
      headers: { cookie: sessionCookie },
      payload: { currentPassword, newPassword },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ message: 'Password changed' });

    currentPassword = newPassword;
    sessionCookie = await refreshSession();
  });

  test('password history enforcement prevents reuse', async () => {
    // Change to another new password first
    const anotherPassword = 'AnotherP@ssw0rd789!';
    await app.inject({
      method: 'POST',
      url: '/auth/password/change',
      headers: { cookie: sessionCookie },
      payload: { currentPassword, newPassword: anotherPassword },
    });
    currentPassword = anotherPassword;
    sessionCookie = await refreshSession();

    // Try to reuse initial password — should be in history
    const response = await app.inject({
      method: 'POST',
      url: '/auth/password/change',
      headers: { cookie: sessionCookie },
      payload: { currentPassword, newPassword: INITIAL_PASSWORD },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('PASSWORD_REUSE');
  });

  test('new password failing policy returns 400 VALIDATION_ERROR', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/password/change',
      headers: { cookie: sessionCookie },
      payload: { currentPassword, newPassword: 'weak' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('VALIDATION_ERROR');
  });
});
