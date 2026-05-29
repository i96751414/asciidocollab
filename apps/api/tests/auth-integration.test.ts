import { buildServer } from '../src/index';
import { registerRoute } from '../src/routes/register';
import { loginRoute } from '../src/routes/login';
import { logoutRoute } from '../src/routes/logout';
import { meRoute } from '../src/routes/me';
import { passwordChangeRoute } from '../src/routes/password-change';
import { passwordResetRequestRoute } from '../src/routes/password-reset-request';
import { passwordResetRoute } from '../src/routes/password-reset';
import { startTestContainer, stopTestContainer } from '@asciidocollab/testing';
import { setupTestEnvironment } from './helpers/test-environment';
import { LOGIN_DELAY_MS } from '@asciidocollab/domain';

describe('Auth Integration Tests', () => {
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
    await app.register(passwordResetRequestRoute);
    await app.register(passwordResetRoute);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await stopTestContainer(testContext);
  });

  describe('Registration', () => {
    test('successful registration returns 201', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { email: `reg-${Date.now()}@example.com`, password: 'ValidP@ssw0rd123!', displayName: 'Test' },
      });
      expect(response.statusCode).toBe(201);
      expect(response.json()).toEqual({ message: 'Account created' });
    });

    test('duplicate email returns 200 (no enumeration)', async () => {
      const email = `dup-${Date.now()}@example.com`;
      await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { email, password: 'ValidP@ssw0rd123!', displayName: 'Test' },
      });
      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { email, password: 'OtherP@ssw0rd456!', displayName: 'Test 2' },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ message: 'Account created' });
    });

    test('invalid email returns 400', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { email: 'not-an-email', password: 'ValidP@ssw0rd123!', displayName: 'Test' },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION_ERROR');
    });

    test('weak password returns 400', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { email: `weak-${Date.now()}@example.com`, password: 'short', displayName: 'Test' },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION_ERROR');
    });

    test('common password returns 400', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { email: `common-${Date.now()}@example.com`, password: 'password123', displayName: 'Test' },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION_ERROR');
    });

    test('missing required fields returns 400', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { email: `missing-${Date.now()}@example.com` },
      });
      expect(response.statusCode).toBe(400);
    });

    test('email too long returns 400', async () => {
      const longEmail = 'a'.repeat(250) + '@example.com';
      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { email: longEmail, password: 'ValidP@ssw0rd123!', displayName: 'Test' },
      });
      expect(response.statusCode).toBe(400);
    });

    test('displayName too long returns 400', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { email: `long-${Date.now()}@example.com`, password: 'ValidP@ssw0rd123!', displayName: 'a'.repeat(101) },
      });
      expect(response.statusCode).toBe(400);
    });
  });

  describe('Login', () => {
    test('successful login returns 200', async () => {
      const email = `login-${Date.now()}@example.com`;
      await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { email, password: 'ValidP@ssw0rd123!', displayName: 'Test' },
      });
      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email, password: 'ValidP@ssw0rd123!' },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ message: 'Authenticated' });
    });

    test('wrong password returns 401', async () => {
      const email = `wrong-${Date.now()}@example.com`;
      await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { email, password: 'ValidP@ssw0rd123!', displayName: 'Test' },
      });
      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email, password: 'WrongP@ssw0rd!' },
      });
      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe('INVALID_CREDENTIALS');
    });

    test('unknown email returns 401 with same message', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: `unknown-${Date.now()}@example.com`, password: 'AnyP@ssw0rd123!' },
      });
      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe('INVALID_CREDENTIALS');
    });

    test('login timing is consistent (prevents enumeration)', async () => {
      const email = `timing-${Date.now()}@example.com`;
      await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { email, password: 'ValidP@ssw0rd123!', displayName: 'Test' },
      });

      // All login attempts should take at least LOGIN_DELAY_MS
      // regardless of whether email exists or password is correct
      const start1 = Date.now();
      await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email, password: 'WrongP@ssw0rd!' },
      });
      const time1 = Date.now() - start1;

      const start2 = Date.now();
      await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: `nonexistent-${Date.now()}@example.com`, password: 'AnyP@ssw0rd123!' },
      });
      const time2 = Date.now() - start2;

      // Both should take at least LOGIN_DELAY_MS due to constant-time implementation
      expect(time1).toBeGreaterThanOrEqual(LOGIN_DELAY_MS - 100);
      expect(time2).toBeGreaterThanOrEqual(LOGIN_DELAY_MS - 100);
    });
  });

  describe('Session Management', () => {
    test('authenticated user can access /auth/me', async () => {
      const email = `me-${Date.now()}@example.com`;
      await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { email, password: 'ValidP@ssw0rd123!', displayName: 'Test' },
      });
      const loginResponse = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email, password: 'ValidP@ssw0rd123!' },
      });
      const cookie = loginResponse.cookies[0];
      expect(cookie).toBeDefined();

      const meResponse = await app.inject({
        method: 'GET',
        url: '/auth/me',
        headers: { cookie: `${cookie!.name}=${cookie!.value}` },
      });
      expect(meResponse.statusCode).toBe(200);
      expect(meResponse.json()).toHaveProperty('userId');
    });

    test('unauthenticated user gets 401 on /auth/me', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/auth/me',
      });
      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe('UNAUTHORIZED');
    });

    test('invalid session cookie gets 401', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/auth/me',
        headers: { cookie: 'sessionId=invalid-session-id' },
      });
      expect(response.statusCode).toBe(401);
    });

    test('logout destroys session', async () => {
      const email = `logout-${Date.now()}@example.com`;
      await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { email, password: 'ValidP@ssw0rd123!', displayName: 'Test' },
      });
      const loginResponse = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email, password: 'ValidP@ssw0rd123!' },
      });
      const cookie = loginResponse.cookies[0];
      expect(cookie).toBeDefined();

      const logoutResponse = await app.inject({
        method: 'POST',
        url: '/auth/logout',
        headers: { cookie: `${cookie!.name}=${cookie!.value}` },
      });
      expect(logoutResponse.statusCode).toBe(200);

      const meResponse = await app.inject({
        method: 'GET',
        url: '/auth/me',
        headers: { cookie: `${cookie!.name}=${cookie!.value}` },
      });
      expect(meResponse.statusCode).toBe(401);
    });

    test('logout without session returns 200', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/logout',
      });
      expect(response.statusCode).toBe(200);
    });
  });

  describe('Password Change', () => {
    test('successful password change returns 200', async () => {
      const email = `pw-change-${Date.now()}@example.com`;
      await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { email, password: 'ValidP@ssw0rd123!', displayName: 'Test' },
      });
      const loginResponse = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email, password: 'ValidP@ssw0rd123!' },
      });
      const cookie = loginResponse.cookies[0];

      const response = await app.inject({
        method: 'POST',
        url: '/auth/password/change',
        headers: { cookie: `${cookie!.name}=${cookie!.value}` },
        payload: { currentPassword: 'ValidP@ssw0rd123!', newPassword: 'NewP@ssw0rd456!' },
      });
      expect(response.statusCode).toBe(200);

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
        payload: { email, password: 'ValidP@ssw0rd123!', displayName: 'Test' },
      });
      const loginResponse = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email, password: 'ValidP@ssw0rd123!' },
      });
      const cookie = loginResponse.cookies[0];

      const response = await app.inject({
        method: 'POST',
        url: '/auth/password/change',
        headers: { cookie: `${cookie!.name}=${cookie!.value}` },
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
        payload: { email, password: 'ValidP@ssw0rd123!', displayName: 'Test' },
      });
      const loginResponse = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email, password: 'ValidP@ssw0rd123!' },
      });
      const cookie = loginResponse.cookies[0];

      await app.inject({
        method: 'POST',
        url: '/auth/password/change',
        headers: { cookie: `${cookie!.name}=${cookie!.value}` },
        payload: { currentPassword: 'ValidP@ssw0rd123!', newPassword: 'NewP@ssw0rd456!' },
      });

      const response = await app.inject({
        method: 'POST',
        url: '/auth/password/change',
        headers: { cookie: `${cookie!.name}=${cookie!.value}` },
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

    test('weak new password returns 400', async () => {
      const email = `pw-weak-${Date.now()}@example.com`;
      await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { email, password: 'ValidP@ssw0rd123!', displayName: 'Test' },
      });
      const loginResponse = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email, password: 'ValidP@ssw0rd123!' },
      });
      const cookie = loginResponse.cookies[0];
      expect(cookie).toBeDefined();

      const response = await app.inject({
        method: 'POST',
        url: '/auth/password/change',
        headers: { cookie: `${cookie!.name}=${cookie!.value}` },
        payload: { currentPassword: 'ValidP@ssw0rd123!', newPassword: 'short' },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Password Reset', () => {
    test('reset request returns 200 for valid email', async () => {
      const email = `reset-${Date.now()}@example.com`;
      await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { email, password: 'ValidP@ssw0rd123!', displayName: 'Test' },
      });
      const response = await app.inject({
        method: 'POST',
        url: '/auth/password/reset/request',
        payload: { email },
      });
      expect(response.statusCode).toBe(200);
    });

    test('reset request returns same 200 for unknown email', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/password/reset/request',
        payload: { email: `unknown-${Date.now()}@example.com` },
      });
      expect(response.statusCode).toBe(200);
    });

    test('invalid token returns 400', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/password/reset',
        payload: { token: 'invalid-token', newPassword: 'NewP@ssw0rd456!' },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('INVALID_TOKEN');
    });

    test('expired token returns 400', async () => {
      const email = `reset-expired-${Date.now()}@example.com`;
      await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { email, password: 'ValidP@ssw0rd123!', displayName: 'Test' },
      });
      const user = await app.prisma.user.findUnique({ where: { email } });
      const crypto = await import('node:crypto');
      const hashedToken = crypto.createHash('sha256').update('expired-token').digest('hex');
      await app.prisma.passwordResetToken.create({
        data: {
          userId: user!.id,
          tokenHash: hashedToken,
          expiresAt: new Date(Date.now() - 1000),
        },
      });
      const response = await app.inject({
        method: 'POST',
        url: '/auth/password/reset',
        payload: { token: 'expired-token', newPassword: 'NewP@ssw0rd456!' },
      });
      expect(response.statusCode).toBe(400);
    });
  });

  describe('Protected Routes', () => {
    test('health endpoint is accessible without auth', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });
      expect(response.statusCode).toBe(200);
    });

    test('non-existent route returns 404', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/nonexistent',
      });
      expect(response.statusCode).toBe(404);
      expect(response.json().error.code).toBe('NOT_FOUND');
    });
  });
});
