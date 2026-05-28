import { buildServer } from '../src/index';
import { loginRoute } from '../src/routes/login';
import { registerRoute } from '../src/routes/register';
import { logoutRoute } from '../src/routes/logout';
import { meRoute } from '../src/routes/me';
import { passwordChangeRoute } from '../src/routes/password-change';
import { startTestContainer, stopTestContainer } from '@asciidocollab/testing';
import { setupTestEnvironment } from './helpers/test-environment';

describe('Password Change', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  let testContext: Awaited<ReturnType<typeof startTestContainer>>;

  beforeAll(async () => {
    setupTestEnvironment();

    testContext = await startTestContainer();
    app = await buildServer({ prisma: testContext.client });
    await app.register(registerRoute);
    await app.register(loginRoute);
    await app.register(logoutRoute);
    await app.register(meRoute);
    await app.register(passwordChangeRoute);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await stopTestContainer(testContext);
  });

  async function loginAndGetCookie(email: string, password: string): Promise<string> {
    const loginResponse = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email, password },
    });
    const cookie = loginResponse.cookies[0];
    return cookie ? `${cookie.name}=${cookie.value}` : '';
  }

  test('successful password change returns 200', async () => {
    const email = `pw-change-${Date.now()}@example.com`;
    await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email, password: 'ValidP@ssw0rd123!', displayName: 'Test User' },
    });

    const cookie = await loginAndGetCookie(email, 'ValidP@ssw0rd123!');

    const response = await app.inject({
      method: 'POST',
      url: '/auth/password/change',
      headers: { cookie },
      payload: { currentPassword: 'ValidP@ssw0rd123!', newPassword: 'NewP@ssw0rd456!' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ message: 'Password changed' });

    const loginWithOld = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email, password: 'ValidP@ssw0rd123!' },
    });
    expect(loginWithOld.statusCode).toBe(401);

    const loginWithNew = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email, password: 'NewP@ssw0rd456!' },
    });
    expect(loginWithNew.statusCode).toBe(200);
  });

  test('wrong current password returns 400', async () => {
    const email = `pw-wrong-${Date.now()}@example.com`;
    await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email, password: 'ValidP@ssw0rd123!', displayName: 'Test User' },
    });

    const cookie = await loginAndGetCookie(email, 'ValidP@ssw0rd123!');

    const response = await app.inject({
      method: 'POST',
      url: '/auth/password/change',
      headers: { cookie },
      payload: { currentPassword: 'WrongP@ssw0rd!', newPassword: 'NewP@ssw0rd456!' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('INVALID_PASSWORD');
  });

  test('password history enforcement prevents reuse', async () => {
    const email = `pw-history-${Date.now()}@example.com`;
    await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email, password: 'ValidP@ssw0rd123!', displayName: 'Test User' },
    });

    const cookie = await loginAndGetCookie(email, 'ValidP@ssw0rd123!');

    await app.inject({
      method: 'POST',
      url: '/auth/password/change',
      headers: { cookie },
      payload: { currentPassword: 'ValidP@ssw0rd123!', newPassword: 'NewP@ssw0rd456!' },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/auth/password/change',
      headers: { cookie },
      payload: { currentPassword: 'NewP@ssw0rd456!', newPassword: 'ValidP@ssw0rd123!' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('PASSWORD_REUSE');
  });

  test('unauthorized request returns 401', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/password/change',
      payload: { currentPassword: 'ValidP@ssw0rd123!', newPassword: 'NewP@ssw0rd456!' },
    });
    expect(response.statusCode).toBe(401);
  });
});
