import { AuditLogRepository, UserRepository, ProjectRepository, Email } from '@asciidocollab/domain';
import { PrismaClient } from '@prisma/client';
import { PrismaAuditLogRepository } from '../../../src/persistence/admin/prisma-audit-log.repository';
import { PrismaUserRepository } from '../../../src/persistence/user/prisma-user.repository';
import { PrismaProjectRepository } from '../../../src/persistence/project/prisma-project.repository';
import { startTestContainer, stopTestContainer, TestContainer } from '../../helpers/prisma-test-container';
import { createTestUser, createTestProject, createTestAuditLog } from '../../helpers/test-data';

describe('PrismaAuditLogRepository', () => {
  let container: TestContainer;
  let client: PrismaClient;
  let repo: AuditLogRepository;
  let userRepo: UserRepository;
  let projectRepo: ProjectRepository;

  beforeAll(async () => {
    container = await startTestContainer();
    client = container.client;
    repo = new PrismaAuditLogRepository(client);
    userRepo = new PrismaUserRepository(client);
    projectRepo = new PrismaProjectRepository(client);
  });

  afterAll(async () => {
    await stopTestContainer(container);
  });

  beforeEach(async () => {
    await client.auditLog.deleteMany();
    await client.project.deleteMany();
    await client.user.deleteMany();
  });

  it('should save and find audit log entries', async () => {
    const user = createTestUser();
    await userRepo.save(user);
    const entry = createTestAuditLog(user.id, { action: 'test.action' });
    await repo.save(entry);

    const all = await repo.findAll();
    expect(all).toHaveLength(1);
    expect(all[0].action).toBe('test.action');
  });

  it('SC-007: an audit record survives deletion of its actor (userId becomes null, still retrievable)', async () => {
    const user = createTestUser();
    await userRepo.save(user);
    const entry = createTestAuditLog(user.id, { action: 'project.deleted' });
    await repo.save(entry);

    await client.user.delete({ where: { id: user.id.value } });

    const all = await repo.findAll();
    expect(all).toHaveLength(1);
    expect(all[0].action).toBe('project.deleted');
    expect(all[0].userId).toBeNull();
  });

  it('should find audit logs by project id', async () => {
    const user = createTestUser();
    await userRepo.save(user);
    const project = createTestProject();
    await projectRepo.save(project);
    const entry = createTestAuditLog(user.id, { projectId: project.id });
    await repo.save(entry);

    const found = await repo.findByProjectId(project.id);
    expect(found).toHaveLength(1);
  });

  it('should find audit logs by user id', async () => {
    const user = createTestUser();
    await userRepo.save(user);
    const entry = createTestAuditLog(user.id);
    await repo.save(entry);

    const found = await repo.findByUserId(user.id);
    expect(found).toHaveLength(1);
  });

  it('should handle nullable projectId', async () => {
    const user = createTestUser();
    await userRepo.save(user);
    const entry = createTestAuditLog(user.id, { projectId: null });
    await repo.save(entry);

    const all = await repo.findAll();
    expect(all).toHaveLength(1);
    expect(all[0].projectId).toBeNull();
  });

  it('should handle JSON metadata edge cases: null and empty object', async () => {
    const user = createTestUser();
    await userRepo.save(user);

    const entryEmpty = createTestAuditLog(user.id, { metadata: {} });
    await repo.save(entryEmpty);

    const entryWithData = createTestAuditLog(user.id, { metadata: { key: 'value', count: 42 } });
    await repo.save(entryWithData);

    const all = await repo.findAll();
    expect(all).toHaveLength(2);
  });

  describe('findWithFilters', () => {
    it('returns all entries when no filters applied', async () => {
      const user = createTestUser();
      await userRepo.save(user);
      await repo.save(createTestAuditLog(user.id, { action: 'A' }));
      await repo.save(createTestAuditLog(user.id, { action: 'B' }));

      const result = await repo.findWithFilters({}, { page: 1, limit: 50 });
      expect(result.total).toBe(2);
      expect(result.items).toHaveLength(2);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(50);
    });

    it('filters by userId', async () => {
      const userA = createTestUser({ email: Email.create('filter-a@example.com') });
      const userB = createTestUser({ email: Email.create('filter-b@example.com') });
      await userRepo.save(userA);
      await userRepo.save(userB);
      await repo.save(createTestAuditLog(userA.id, { action: 'LOGIN' }));
      await repo.save(createTestAuditLog(userB.id, { action: 'LOGIN' }));

      const result = await repo.findWithFilters({ userId: userA.id.value }, { page: 1, limit: 50 });
      expect(result.total).toBe(1);
      expect(result.items[0].userId?.value).toBe(userA.id.value);
    });

    it('filters by actionType', async () => {
      const user = createTestUser();
      await userRepo.save(user);
      await repo.save(createTestAuditLog(user.id, { action: 'USER_LOGIN' }));
      await repo.save(createTestAuditLog(user.id, { action: 'FILE_CREATED' }));

      const result = await repo.findWithFilters({ actionType: 'USER_LOGIN' }, { page: 1, limit: 50 });
      expect(result.total).toBe(1);
      expect(result.items[0].action).toBe('USER_LOGIN');
    });

    it('filters by date range', async () => {
      const user = createTestUser();
      await userRepo.save(user);
      const past = new Date('2020-01-01T00:00:00Z');
      const recent = new Date('2024-06-01T00:00:00Z');
      await repo.save(createTestAuditLog(user.id, { action: 'OLD', timestamp: past }));
      await repo.save(createTestAuditLog(user.id, { action: 'RECENT', timestamp: recent }));

      const result = await repo.findWithFilters(
        { fromDate: new Date('2023-01-01T00:00:00Z') },
        { page: 1, limit: 50 },
      );
      expect(result.total).toBe(1);
      expect(result.items[0].action).toBe('RECENT');
    });

    it('paginates correctly', async () => {
      const user = createTestUser();
      await userRepo.save(user);
      for (let index = 0; index < 5; index++) {
        await repo.save(createTestAuditLog(user.id, { action: `ACTION_${index}` }));
      }

      const page1 = await repo.findWithFilters({}, { page: 1, limit: 2 });
      expect(page1.total).toBe(5);
      expect(page1.items).toHaveLength(2);

      const page3 = await repo.findWithFilters({}, { page: 3, limit: 2 });
      expect(page3.items).toHaveLength(1);
    });
  });

  describe('findDistinctActionTypes', () => {
    it('returns only action types present in the database', async () => {
      const user = createTestUser();
      await userRepo.save(user);
      await repo.save(createTestAuditLog(user.id, { action: 'USER_LOGIN' }));
      await repo.save(createTestAuditLog(user.id, { action: 'USER_LOGIN' }));
      await repo.save(createTestAuditLog(user.id, { action: 'FILE_CREATED' }));

      const types = await repo.findDistinctActionTypes();
      expect(types).toHaveLength(2);
      expect(types).toContain('USER_LOGIN');
      expect(types).toContain('FILE_CREATED');
    });

    it('returns empty array when no audit logs exist', async () => {
      const types = await repo.findDistinctActionTypes();
      expect(types).toHaveLength(0);
    });
  });
});
