import { randomUUID } from 'node:crypto';
import { buildServer } from '../src/index';
import { registerRoute } from '../src/routes/register';
import { loginRoute } from '../src/routes/login';
import { projectRoutes } from '../src/routes/projects';
import { memberRoutes } from '../src/routes/projects/members';
import { startTestContainer, stopTestContainer } from '@asciidocollab/testing';
import { setupTestEnvironment } from './helpers/test-environment';

const TEST_PASSWORD = 'ValidP@ssw0rd123!';

describe('Project Members', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  let testContext: Awaited<ReturnType<typeof startTestContainer>>;
  let passwordHash: string;

  beforeAll(async () => {
    setupTestEnvironment();
    testContext = await startTestContainer();
    app = await buildServer({ prisma: testContext.client });
    await app.register(registerRoute);
    await app.register(loginRoute);
    await app.register(projectRoutes);
    await app.register(memberRoutes);
    await app.ready();

    // Register the first (and only) user via API
    const firstEmail = `first-user-${Date.now()}@example.com`;
    await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: firstEmail, password: TEST_PASSWORD, displayName: 'First User' },
    });

    // Compute password hash for subsequent direct user creation
    passwordHash = await app.services.passwordHasher.hash(TEST_PASSWORD);
  });

  afterAll(async () => {
    await app.close();
    await stopTestContainer(testContext);
  });

  // Creates a user directly in the DB (bypassing single-registration constraint) and returns their session cookie
  async function createUserAndLogin(email: string, displayName: string): Promise<string> {
    const userId = randomUUID();
    await testContext.client.user.create({
      data: {
        id: userId,
        email,
        displayName,
        passwordHash,
        passwordHistory: [],
        samlSubject: null,
        mfaSecret: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    const loginResponse = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email, password: TEST_PASSWORD },
    });
    const cookie = loginResponse.cookies[0];
    return cookie ? `${cookie.name}=${cookie.value}` : '';
  }

  async function createProject(cookie: string, name: string): Promise<string> {
    const response = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: { cookie },
      payload: { name },
    });
    return response.json().data.id;
  }

  describe('GET /api/projects/:id/members', () => {
    test('returns 401 without session', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/projects/some-id/members',
      });
      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe('UNAUTHORIZED');
    });

    test('returns 403 when caller is not a member of the project', async () => {
      const ts = Date.now();
      const ownerCookie = await createUserAndLogin(`owner-auth-${ts}@example.com`, 'Owner');
      const outsiderCookie = await createUserAndLogin(`outsider-${ts}@example.com`, 'Outsider');
      const projectId = await createProject(ownerCookie, 'Auth Test Project');

      const response = await app.inject({
        method: 'GET',
        url: `/api/projects/${projectId}/members`,
        headers: { cookie: outsiderCookie },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json().error.code).toBe('FORBIDDEN');
    });

    test('returns real email and displayName from user repository', async () => {
      const ts = Date.now();
      const adminEmail = `admin-get-${ts}@example.com`;
      const adminCookie = await createUserAndLogin(adminEmail, 'Admin User');
      const projectId = await createProject(adminCookie, 'Get Members Project');

      const response = await app.inject({
        method: 'GET',
        url: `/api/projects/${projectId}/members`,
        headers: { cookie: adminCookie },
      });

      expect(response.statusCode).toBe(200);
      const { members } = response.json().data;
      expect(members).toHaveLength(1);
      expect(members[0].email).toBe(adminEmail);
      expect(members[0].displayName).toBe('Admin User');
      expect(members[0].userId).toBeDefined();
      expect(members[0].role).toBeDefined();
      expect(members[0].joinedAt).toBeDefined();
    });
  });

  describe('POST /api/projects/:id/members', () => {
    test('returns 401 without session', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/projects/some-id/members',
        payload: { email: 'someone@example.com', role: 'viewer' },
      });
      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe('UNAUTHORIZED');
    });

    test('returns actual userId and displayName after invite', async () => {
      const ts = Date.now();
      const adminEmail = `admin-invite-${ts}@example.com`;
      const memberEmail = `member-invite-${ts}@example.com`;

      const adminCookie = await createUserAndLogin(adminEmail, 'Admin Inviter');
      await createUserAndLogin(memberEmail, 'Invited Member');
      const projectId = await createProject(adminCookie, 'Invite Test Project');

      const response = await app.inject({
        method: 'POST',
        url: `/api/projects/${projectId}/members`,
        headers: { cookie: adminCookie },
        payload: { email: memberEmail, role: 'viewer' },
      });

      expect(response.statusCode).toBe(201);
      const { data } = response.json();
      expect(data.email).toBe(memberEmail);
      expect(data.displayName).toBe('Invited Member');
      expect(data.userId).not.toBe('new-user-id');
      expect(data.userId).toMatch(/^[0-9a-f-]{36}$/);
      expect(data.role).toBe('viewer');
      expect(data.joinedAt).toBeDefined();

      const listResponse = await app.inject({
        method: 'GET',
        url: `/api/projects/${projectId}/members`,
        headers: { cookie: adminCookie },
      });
      const listedMember = listResponse.json().data.members.find(
        (m: { userId: string }) => m.userId === data.userId
      );
      expect(listedMember).toBeDefined();
      expect(listedMember.joinedAt).toBe(data.joinedAt);
    });

    test('returns 400 when inviting non-existent user', async () => {
      const ts = Date.now();
      const adminEmail = `admin-nouser-${ts}@example.com`;
      const adminCookie = await createUserAndLogin(adminEmail, 'Admin');
      const projectId = await createProject(adminCookie, 'No User Project');

      const response = await app.inject({
        method: 'POST',
        url: `/api/projects/${projectId}/members`,
        headers: { cookie: adminCookie },
        payload: { email: `nonexistent-${ts}@example.com`, role: 'viewer' },
      });

      expect(response.statusCode).toBe(400);
    });

    test('returns 400 when non-admin tries to invite', async () => {
      const ts = Date.now();
      const adminEmail = `admin-perm-${ts}@example.com`;
      const viewerEmail = `viewer-perm-${ts}@example.com`;
      const targetEmail = `target-perm-${ts}@example.com`;

      const adminCookie = await createUserAndLogin(adminEmail, 'Admin');
      const viewerCookie = await createUserAndLogin(viewerEmail, 'Viewer');
      await createUserAndLogin(targetEmail, 'Target');

      const projectId = await createProject(adminCookie, 'Permission Test Project');
      await app.inject({
        method: 'POST',
        url: `/api/projects/${projectId}/members`,
        headers: { cookie: adminCookie },
        payload: { email: viewerEmail, role: 'viewer' },
      });

      const response = await app.inject({
        method: 'POST',
        url: `/api/projects/${projectId}/members`,
        headers: { cookie: viewerCookie },
        payload: { email: targetEmail, role: 'viewer' },
      });

      expect(response.statusCode).toBe(400);
    });

    test('invited member appears in list with correct data', async () => {
      const ts = Date.now();
      const adminEmail = `admin-list-${ts}@example.com`;
      const memberEmail = `member-list-${ts}@example.com`;

      const adminCookie = await createUserAndLogin(adminEmail, 'List Admin');
      await createUserAndLogin(memberEmail, 'List Member');
      const projectId = await createProject(adminCookie, 'List Test Project');

      await app.inject({
        method: 'POST',
        url: `/api/projects/${projectId}/members`,
        headers: { cookie: adminCookie },
        payload: { email: memberEmail, role: 'editor' },
      });

      const listResponse = await app.inject({
        method: 'GET',
        url: `/api/projects/${projectId}/members`,
        headers: { cookie: adminCookie },
      });

      expect(listResponse.statusCode).toBe(200);
      const { members } = listResponse.json().data;
      expect(members).toHaveLength(2);

      const invitedMember = members.find((m: { email: string }) => m.email === memberEmail);
      expect(invitedMember).toBeDefined();
      expect(invitedMember.displayName).toBe('List Member');
      expect(invitedMember.role).toBe('editor');
    });
  });

  describe('PATCH /api/projects/:id/members/:userId', () => {
    test('returns 401 without session', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/projects/some-id/members/some-user-id',
        payload: { role: 'editor' },
      });
      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe('UNAUTHORIZED');
    });

    test('admin can change member role', async () => {
      const ts = Date.now();
      const adminEmail = `admin-role-${ts}@example.com`;
      const memberEmail = `member-role-${ts}@example.com`;

      const adminCookie = await createUserAndLogin(adminEmail, 'Admin');
      await createUserAndLogin(memberEmail, 'Member');
      const projectId = await createProject(adminCookie, 'Role Change Project');

      const inviteResponse = await app.inject({
        method: 'POST',
        url: `/api/projects/${projectId}/members`,
        headers: { cookie: adminCookie },
        payload: { email: memberEmail, role: 'viewer' },
      });
      const memberId = inviteResponse.json().data.userId;

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/projects/${projectId}/members/${memberId}`,
        headers: { cookie: adminCookie },
        payload: { role: 'editor' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data.role).toBe('editor');
      expect(response.json().data.userId).toBe(memberId);
    });
  });

  describe('DELETE /api/projects/:id/members/:userId', () => {
    test('returns 401 without session', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/projects/some-id/members/some-user-id',
      });
      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe('UNAUTHORIZED');
    });

    test('admin can remove member and member no longer appears in list', async () => {
      const ts = Date.now();
      const adminEmail = `admin-remove-${ts}@example.com`;
      const memberEmail = `member-remove-${ts}@example.com`;

      const adminCookie = await createUserAndLogin(adminEmail, 'Admin');
      await createUserAndLogin(memberEmail, 'Member');
      const projectId = await createProject(adminCookie, 'Remove Member Project');

      const inviteResponse = await app.inject({
        method: 'POST',
        url: `/api/projects/${projectId}/members`,
        headers: { cookie: adminCookie },
        payload: { email: memberEmail, role: 'viewer' },
      });
      const memberId = inviteResponse.json().data.userId;

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/projects/${projectId}/members/${memberId}`,
        headers: { cookie: adminCookie },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data.message).toBe('Member removed successfully');

      const listResponse = await app.inject({
        method: 'GET',
        url: `/api/projects/${projectId}/members`,
        headers: { cookie: adminCookie },
      });
      const { members } = listResponse.json().data;
      expect(members).toHaveLength(1);
      expect(members.find((m: { email: string }) => m.email === memberEmail)).toBeUndefined();
    });
  });
});
