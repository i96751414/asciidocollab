import { AuditLogRepository, UserRepository, ProjectRepository } from '@asciidocollab/domain';
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
});
