// Integration tests for email change endpoints
import { createHash } from 'node:crypto';
import { buildServer } from '../src/index';
import { registerRoute } from '../src/routes/auth/register';
import { loginRoute } from '../src/routes/auth/login';
import { emailChangeRequestRoute } from '../src/routes/auth/email/change-request';
import { emailConfirmRoute } from '../src/routes/auth/email/confirm';
import { startTestContainer, stopTestContainer } from '@asciidocollab/testing';
import { setupTestEnvironment } from './helpers/test-environment';

const TEST_EMAIL = 'emailchange@example.com';
const TEST_PASSWORD = 'ValidP@ssw0rd123!';

describe('Email Change', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  let testContext: Awaited<ReturnType<typeof startTestContainer>>;
  let sessionCookie = '';
  let userId = '';

  beforeAll(async () => {
    setupTestEnvironment();

    testContext = await startTestContainer();
    app = await buildServer({ prisma: testContext.client });
    await app.register(registerRoute);
    await app.register(loginRoute);
    await app.register(emailChangeRequestRoute);
    await app.register(emailConfirmRoute);
    await app.ready();

    await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: TEST_EMAIL, password: TEST_PASSWORD, displayName: 'Email Change User' },
    });

    const loginResponse = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: TEST_EMAIL, password: TEST_PASSWORD },
    });
    const cookie = loginResponse.cookies[0];
    sessionCookie = cookie ? `${cookie.name}=${cookie.value}` : '';

    const user = await app.prisma.user.findUnique({ where: { email: TEST_EMAIL } });
    userId = user!.id;
  });

  afterAll(async () => {
    await app.close();
    await stopTestContainer(testContext);
  });

  test('401 on POST /auth/email/change-request without session', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/email/change-request',
      payload: { newEmail: 'any@example.com' },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('UNAUTHORIZED');
  });

  test('200 when newEmail is already registered (enumeration prevention)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/email/change-request',
      headers: { cookie: sessionCookie },
      payload: { newEmail: TEST_EMAIL },
    });
    expect(response.statusCode).toBe(200);
    // No token created
    const token = await app.prisma.emailChangeToken.findFirst({ where: { userId } });
    expect(token).toBeNull();
  });

  test('200 when newEmail equals current email (noop)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/email/change-request',
      headers: { cookie: sessionCookie },
      payload: { newEmail: TEST_EMAIL },
    });
    expect(response.statusCode).toBe(200);
  });

  test('200 for valid new email — creates token', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/email/change-request',
      headers: { cookie: sessionCookie },
      payload: { newEmail: 'newvalid@example.com' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().message).toBeDefined();

    const token = await app.prisma.emailChangeToken.findFirst({ where: { userId } });
    expect(token).not.toBeNull();
    expect(token?.pendingEmail).toBe('newvalid@example.com');
  });

  test('400 INVALID_TOKEN on GET /auth/email/confirm with expired token', async () => {
    const hashedToken = createHash('sha256').update('expired-change-token').digest('hex');
    await app.prisma.emailChangeToken.create({
      data: {
        userId,
        tokenHash: hashedToken,
        pendingEmail: 'expired@example.com',
        expiresAt: new Date(Date.now() - 1000),
      },
    });

    const response = await app.inject({
      method: 'GET',
      url: '/auth/email/confirm?token=expired-change-token',
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('INVALID_TOKEN');
  });

  test('400 INVALID_TOKEN on GET /auth/email/confirm with already-used token', async () => {
    const hashedToken = createHash('sha256').update('used-change-token').digest('hex');
    await app.prisma.emailChangeToken.create({
      data: {
        userId,
        tokenHash: hashedToken,
        pendingEmail: 'used@example.com',
        expiresAt: new Date(Date.now() + 3_600_000),
        usedAt: new Date(),
      },
    });

    const response = await app.inject({
      method: 'GET',
      url: '/auth/email/confirm?token=used-change-token',
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('INVALID_TOKEN');
  });

  test('400 VALIDATION_ERROR when token query param absent', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/auth/email/confirm',
    });
    expect(response.statusCode).toBe(400);
  });

  test('happy path: confirm with known token updates email in database', async () => {
    const targetEmail = `confirmed-${Date.now()}@example.com`;
    const rawToken = `happy-path-token-${Date.now()}`;
    const hashedToken = createHash('sha256').update(rawToken).digest('hex');

    await app.prisma.emailChangeToken.create({
      data: {
        userId,
        tokenHash: hashedToken,
        pendingEmail: targetEmail,
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    });

    const response = await app.inject({
      method: 'GET',
      url: `/auth/email/confirm?token=${rawToken}`,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().message).toBeDefined();

    const updatedUser = await app.prisma.user.findUnique({ where: { id: userId } });
    expect(updatedUser?.email).toBe(targetEmail);

    const usedToken = await app.prisma.emailChangeToken.findFirst({ where: { tokenHash: hashedToken } });
    expect(usedToken?.usedAt).not.toBeNull();
  });
});
