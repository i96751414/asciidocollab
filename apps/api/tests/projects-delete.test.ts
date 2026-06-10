import { randomUUID } from 'node:crypto';
import { buildServer } from '../src/index';
import { registerRoute } from '../src/routes/auth/register';
import { loginRoute } from '../src/routes/auth/login';
import { projectRoutes } from '../src/routes/projects';
import { memberRoutes } from '../src/routes/projects/members';
import { requireAuth } from '../src/plugins/require-auth';
import { startTestContainer, stopTestContainer } from '@asciidocollab/testing';
import { setupTestEnvironment } from './helpers/test-environment';

const TEST_PASSWORD = 'ValidP@ssw0rd123!';

describe('DELETE /api/projects/:id', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  let testContext: Awaited<ReturnType<typeof startTestContainer>>;
  let passwordHash: string;

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
    });
    await app.ready();

    const firstEmail = `first-delete-${Date.now()}@example.com`;
    await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: firstEmail, password: TEST_PASSWORD, displayName: 'First User' },
    });
    passwordHash = await app.services.passwordHasher.hash(TEST_PASSWORD);
  });

  afterAll(async () => {
    await app.close();
    await stopTestContainer(testContext);
  });

  async function createUserAndLogin(email: string, displayName: string): Promise<string> {
    const userId = randomUUID();
    await testContext.client.user.create({
      data: {
        id: userId, email, displayName, passwordHash,
        passwordHistory: [], samlSubject: null, mfaSecret: null,
        createdAt: new Date(), updatedAt: new Date(),
      },
    });
    const loginResponse = await app.inject({
      method: 'POST', url: '/auth/login',
      payload: { email, password: TEST_PASSWORD },
    });
    return loginResponse.headers['set-cookie'] as string;
  }

  async function createProject(cookie: string, name: string): Promise<string> {
    const response = await app.inject({
      method: 'POST', url: '/api/projects',
      headers: { cookie },
      payload: { name },
    });
    return response.json().data.id;
  }

  test('returns 401 without session', async () => {
    const response = await app.inject({ method: 'DELETE', url: '/api/projects/some-id' });
    expect(response.statusCode).toBe(401);
  });

  test('owner can delete their project', async () => {
    const timestamp = Date.now();
    const cookie = await createUserAndLogin(`owner-del-${timestamp}@example.com`, 'Owner');
    const projectId = await createProject(cookie, `Delete Me ${timestamp}`);

    const deleteResponse = await app.inject({
      method: 'DELETE', url: `/api/projects/${projectId}`,
      headers: { cookie },
    });
    expect(deleteResponse.statusCode).toBe(200);
    expect(deleteResponse.json().data.id).toBe(projectId);

    const getResponse = await app.inject({
      method: 'GET', url: `/api/projects/${projectId}`,
      headers: { cookie },
    });
    expect(getResponse.statusCode).toBe(404);
  });

  test('non-owner (editor) cannot delete - returns 403', async () => {
    const timestamp = Date.now();
    const ownerCookie = await createUserAndLogin(`owner-nd-${timestamp}@example.com`, 'Owner');
    const editorCookie = await createUserAndLogin(`editor-nd-${timestamp}@example.com`, 'Editor');
    const projectId = await createProject(ownerCookie, `No Delete ${timestamp}`);

    const editorEmail = `editor-nd-${timestamp}@example.com`;
    await app.inject({
      method: 'POST', url: `/api/projects/${projectId}/members`,
      headers: { cookie: ownerCookie },
      payload: { email: editorEmail, role: 'editor' },
    });

    const response = await app.inject({
      method: 'DELETE', url: `/api/projects/${projectId}`,
      headers: { cookie: editorCookie },
    });
    expect(response.statusCode).toBe(403);
  });

  test('deleting non-existent project returns 404', async () => {
    const timestamp = Date.now();
    const cookie = await createUserAndLogin(`owner-nx-${timestamp}@example.com`, 'Owner');
    const fakeId = randomUUID();
    const response = await app.inject({
      method: 'DELETE', url: `/api/projects/${fakeId}`,
      headers: { cookie },
    });
    expect(response.statusCode).toBe(404);
  });
});
