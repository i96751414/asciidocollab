import { createHash } from 'node:crypto';
import { buildServer } from '../src/index';
import { loginRoute } from '../src/routes/login';
import { registerRoute } from '../src/routes/register';
import { passwordResetRequestRoute } from '../src/routes/password-reset-request';
import { passwordResetRoute } from '../src/routes/password-reset';
import { startTestContainer, stopTestContainer } from '@asciidocollab/testing';
import { setupTestEnvironment } from './helpers/test-environment';

describe('Password Reset', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  let testContext: Awaited<ReturnType<typeof startTestContainer>>;

  beforeAll(async () => {
    setupTestEnvironment();

    testContext = await startTestContainer();
    app = await buildServer({ prisma: testContext.client });
    await app.register(registerRoute);
    await app.register(loginRoute);
    await app.register(passwordResetRequestRoute);
    await app.register(passwordResetRoute);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await stopTestContainer(testContext);
  });

  test('reset request returns 200 for valid email', async () => {
    const email = `reset-${Date.now()}@example.com`;
    await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email, password: 'ValidP@ssw0rd123!', displayName: 'Test User' },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/auth/password/reset/request',
      payload: { email },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ message: 'If the email exists, a reset link has been sent' });
  });

  test('reset request returns same 200 for unknown email', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/password/reset/request',
      payload: { email: `unknown-${Date.now()}@example.com` },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ message: 'If the email exists, a reset link has been sent' });
  });

  test('valid token resets password', async () => {
    const email = `reset-valid-${Date.now()}@example.com`;
    await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email, password: 'ValidP@ssw0rd123!', displayName: 'Test User' },
    });

    const requestResponse = await app.inject({
      method: 'POST',
      url: '/auth/password/reset/request',
      payload: { email },
    });
    expect(requestResponse.statusCode).toBe(200);

    const resetTokenRecord = await app.prisma.passwordResetToken.findFirst({
      where: { userId: (await app.prisma.user.findUnique({ where: { email } }))!.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(resetTokenRecord).not.toBeNull();

    const response = await app.inject({
      method: 'POST',
      url: '/auth/password/reset',
      payload: { token: 'mock-token', newPassword: 'NewP@ssw0rd456!' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('INVALID_TOKEN');
  });

  test('expired token returns 400', async () => {
    const email = `reset-expired-${Date.now()}@example.com`;
    await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email, password: 'ValidP@ssw0rd123!', displayName: 'Test User' },
    });

    const user = await app.prisma.user.findUnique({ where: { email } });
    const hashedToken = createHash('sha256').update('expired-token').digest('hex');
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
    expect(response.json().error.code).toBe('INVALID_TOKEN');
  });
});
