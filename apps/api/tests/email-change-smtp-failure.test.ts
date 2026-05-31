// Test that POST /auth/email/change-request returns 200 even when the notifier throws.
// Covers the case where the token is persisted but delivery fails.
import type { EmailChangeNotifier } from '@asciidocollab/domain';
import { buildServer } from '../src/index';
import { registerRoute } from '../src/routes/register';
import { loginRoute } from '../src/routes/login';
import { emailChangeRequestRoute } from '../src/routes/email-change-request';
import { startTestContainer, stopTestContainer } from '@asciidocollab/testing';
import { setupTestEnvironment } from './helpers/test-environment';

const TEST_EMAIL = 'smtp-failure@example.com';
const TEST_PASSWORD = 'ValidP@ssw0rd123!';

const throwingNotifier: EmailChangeNotifier = {
  async sendConfirmationEmail(): Promise<void> {
    throw new Error('SMTP connection refused');
  },
};

describe('Email Change Request — delivery failure', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  let testContext: Awaited<ReturnType<typeof startTestContainer>>;
  let sessionCookie = '';

  beforeAll(async () => {
    setupTestEnvironment();

    testContext = await startTestContainer();
    app = await buildServer({ prisma: testContext.client });
    app.services.emailChangeNotifier = throwingNotifier;

    await app.register(registerRoute);
    await app.register(loginRoute);
    await app.register(emailChangeRequestRoute);
    await app.ready();

    await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: TEST_EMAIL, password: TEST_PASSWORD, displayName: 'SMTP Failure User' },
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

  test('returns 200 even when notifier throws', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/email/change-request',
      headers: { cookie: sessionCookie },
      payload: { newEmail: 'new-address@example.com' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().message).toBeDefined();
  });
});
