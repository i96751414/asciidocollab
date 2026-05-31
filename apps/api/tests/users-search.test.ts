import { randomUUID } from 'node:crypto';
import { buildServer } from '../src/index';
import { registerRoute } from '../src/routes/register';
import { loginRoute } from '../src/routes/login';
import { projectRoutes } from '../src/routes/projects';
import { memberRoutes } from '../src/routes/projects/members';
import { usersSearchRoute } from '../src/routes/projects/users-search';
import { requireAuth } from '../src/plugins/require-auth';
import { startTestContainer, stopTestContainer } from '@asciidocollab/testing';
import { setupTestEnvironment } from './helpers/test-environment';

const TEST_PASSWORD = 'ValidP@ssw0rd123!';

describe('GET /api/users/search', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  let testContext: Awaited<ReturnType<typeof startTestContainer>>;
  let passwordHash: string;
  let sessionCookie: string;
  let projectId: string;

  beforeAll(async () => {
    setupTestEnvironment();
    testContext = await startTestContainer();
    app = await buildServer({ prisma: testContext.client });
    await app.register(registerRoute);
    await app.register(loginRoute);
    await app.register(async (scopedApp) => {
      scopedApp.addHook('preHandler', requireAuth);
      await scopedApp.register(projectRoutes);
      await scopedApp.register(memberRoutes);
      await scopedApp.register(usersSearchRoute);
    });
    await app.ready();

    const firstEmail = `search-first-${Date.now()}@example.com`;
    const registrationResponse = await app.inject({
      method: 'POST', url: '/auth/register',
      payload: { email: firstEmail, password: TEST_PASSWORD, displayName: 'SearchOwner' },
    });
    sessionCookie = registrationResponse.headers['set-cookie'] as string;
    passwordHash = await app.services.passwordHasher.hash(TEST_PASSWORD);

    const projectResponse = await app.inject({
      method: 'POST', url: '/api/projects',
      headers: { cookie: sessionCookie },
      payload: { name: 'Search Test Project' },
    });
    projectId = projectResponse.json().data.id;

    const userId = randomUUID();
    await testContext.client.user.create({
      data: {
        id: userId, email: 'searchable@example.com',
        displayName: 'Findable User', passwordHash,
        passwordHistory: [], samlSubject: null, mfaSecret: null,
        createdAt: new Date(), updatedAt: new Date(),
      },
    });
  });

  afterAll(async () => {
    await app.close();
    await stopTestContainer(testContext);
  });

  test('returns 401 without session', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/users/search?q=find' });
    expect(response.statusCode).toBe(401);
  });

  test('returns 400 when q is missing', async () => {
    const response = await app.inject({
      method: 'GET', url: '/api/users/search',
      headers: { cookie: sessionCookie },
    });
    expect(response.statusCode).toBe(400);
  });

  test('returns 400 when q is too short (1 char)', async () => {
    const response = await app.inject({
      method: 'GET', url: '/api/users/search?q=a',
      headers: { cookie: sessionCookie },
    });
    expect(response.statusCode).toBe(400);
  });

  test('returns matching users by display name', async () => {
    const response = await app.inject({
      method: 'GET', url: '/api/users/search?q=Findable',
      headers: { cookie: sessionCookie },
    });
    expect(response.statusCode).toBe(200);
    const { users } = response.json().data;
    expect(users.some((u: { displayName: string }) => u.displayName === 'Findable User')).toBe(true);
  });

  test('excludes members of excludeProjectId', async () => {
    await app.inject({
      method: 'POST', url: `/api/projects/${projectId}/members`,
      headers: { cookie: sessionCookie },
      payload: { email: 'searchable@example.com', role: 'viewer' },
    });

    const response = await app.inject({
      method: 'GET', url: `/api/users/search?q=Findable&excludeProjectId=${projectId}`,
      headers: { cookie: sessionCookie },
    });
    expect(response.statusCode).toBe(200);
    const { users } = response.json().data;
    expect(users.some((u: { email: string }) => u.email === 'searchable@example.com')).toBe(false);
  });

  test('returns at most 10 results', async () => {
    const response = await app.inject({
      method: 'GET', url: '/api/users/search?q=example',
      headers: { cookie: sessionCookie },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data.users.length).toBeLessThanOrEqual(10);
  });
});
