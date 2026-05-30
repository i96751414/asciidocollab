import { buildServer } from '../src/index';
import { loginRoute } from '../src/routes/login';
import { registerRoute } from '../src/routes/register';
import { startTestContainer, stopTestContainer } from '@asciidocollab/testing';
import { setupTestEnvironment } from './helpers/test-environment';

const TEST_EMAIL = 'login-user@example.com';
const TEST_PASSWORD = 'ValidP@ssw0rd123!';

describe('Login', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  let testContext: Awaited<ReturnType<typeof startTestContainer>>;

  beforeAll(async () => {
    setupTestEnvironment();

    testContext = await startTestContainer();
    app = await buildServer({ prisma: testContext.client });
    await app.register(registerRoute);
    await app.register(loginRoute);
    await app.ready();

    // Register the single test user
    await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: TEST_EMAIL, password: TEST_PASSWORD, displayName: 'Test User' },
    });
  });

  afterAll(async () => {
    await app.close();
    await stopTestContainer(testContext);
  });

  test('login with valid credentials returns 200', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: TEST_EMAIL, password: TEST_PASSWORD },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ message: 'Authenticated' });
  });

  test('wrong password returns 401', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: TEST_EMAIL, password: 'WrongP@ssw0rd!' },
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
});
