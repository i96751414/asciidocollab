// T013a: Integration tests for POST /auth/password/reset/request
import { buildServer } from '../src/index';
import { registerRoute } from '../src/routes/register';
import { passwordResetRequestRoute } from '../src/routes/password-reset-request';
import { startTestContainer, stopTestContainer } from '@asciidocollab/testing';
import { setupTestEnvironment } from './helpers/test-environment';

const TEST_EMAIL = 'pwreset-req@example.com';
const TEST_PASSWORD = 'ValidP@ssw0rd123!';

describe('POST /auth/password/reset/request', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  let testContext: Awaited<ReturnType<typeof startTestContainer>>;

  beforeAll(async () => {
    setupTestEnvironment();
    process.env.ASCIIDOCOLLAB_AUTH_PASSWORD_RESET_RATE_LIMIT_MAX = '5';
    process.env.ASCIIDOCOLLAB_AUTH_PASSWORD_RESET_RATE_LIMIT_WINDOW = '60000';

    testContext = await startTestContainer();
    app = await buildServer({ prisma: testContext.client });
    await app.register(registerRoute);
    await app.register(passwordResetRequestRoute);
    await app.ready();

    await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: TEST_EMAIL, password: TEST_PASSWORD, displayName: 'Reset Req User' },
    });
  });

  afterAll(async () => {
    await app.close();
    await stopTestContainer(testContext);
  });

  test('returns 200 for a registered email (enumeration prevention)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/password/reset/request',
      payload: { email: TEST_EMAIL },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ message: 'If the email exists, a reset link has been sent' });
  });

  test('returns same 200 for an unknown email (enumeration prevention)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/password/reset/request',
      payload: { email: `unknown-${Date.now()}@nowhere.com` },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ message: 'If the email exists, a reset link has been sent' });
  });

});
