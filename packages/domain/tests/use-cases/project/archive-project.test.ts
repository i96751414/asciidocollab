import { ArchiveProjectUseCase } from '../../../src/use-cases/project/archive-project';
import { InMemoryProjectRepository } from '../../ports/project/in-memory-project.repository';
import { InMemoryProjectMemberRepository } from '../../ports/project/in-memory-project-member.repository';
import { InMemoryAuditLogRepository } from '../../ports/admin/in-memory-audit-log.repository';
import { Project } from '../../../src/entities/project';
import { ProjectMember } from '../../../src/entities/project-member';
import { ProjectId } from '../../../src/value-objects/ids/project-id';
import { UserId } from '../../../src/value-objects/ids/user-id';
import { ProjectName } from '../../../src/value-objects/project/project-name';
import { Role } from '../../../src/value-objects/identity/role';
import { PermissionDeniedError } from '../../../src/errors/common/permission-denied';
import { ProjectNotFoundError } from '../../../src/errors/project/project-not-found';
import { ProjectAlreadyArchivedError } from '../../../src/errors/project/project-already-archived';

describe('ArchiveProjectUseCase', () => {
  let useCase: ArchiveProjectUseCase;
  let projectRepo: InMemoryProjectRepository;
  let memberRepo: InMemoryProjectMemberRepository;
  let auditLogRepo: InMemoryAuditLogRepository;

  const ownerId = UserId.create('550e8400-e29b-41d4-a716-446655440001');
  const nonMemberId = UserId.create('550e8400-e29b-41d4-a716-446655440002');
  const projectId = ProjectId.create('550e8400-e29b-41d4-a716-446655440003');

  beforeEach(async () => {
    projectRepo = new InMemoryProjectRepository();
    memberRepo = new InMemoryProjectMemberRepository();
    auditLogRepo = new InMemoryAuditLogRepository();
    useCase = new ArchiveProjectUseCase(projectRepo, memberRepo, auditLogRepo);

    const project = new Project(
      projectId,
      ProjectName.create('Test Project'),
      null,
      [],
      null,
    );
    await projectRepo.save(project);

    const ownerMember = new ProjectMember(projectId, ownerId, Role.create('owner'), new Date());
    await memberRepo.addMember(ownerMember);
  });

  test('archives project successfully', async () => {
    expect.assertions(2);
    const result = await useCase.execute(ownerId, projectId);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.archivedAt).toBeInstanceOf(Date);
    }
  });

  test('returns error when project not found', async () => {
    expect.assertions(2);
    const nonExistentId = ProjectId.create('550e8400-e29b-41d4-a716-446655440099');
    const result = await useCase.execute(ownerId, nonExistentId);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(ProjectNotFoundError);
    }
  });

  test('returns error when user is not a member', async () => {
    expect.assertions(2);
    const result = await useCase.execute(nonMemberId, projectId);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(PermissionDeniedError);
    }
  });

  test('records an authz.denied audit when actor is not authorized', async () => {
    await useCase.execute(nonMemberId, projectId);

    const auditLogs = await auditLogRepo.findAll();
    const denial = auditLogs.find((log) => log.action === 'authz.denied');
    expect(denial).toBeDefined();
    expect(denial!.resourceType).toBe('Project');
    expect(denial!.resourceId).toBe(projectId.value);
    expect(denial!.metadata.reason).toBe('not_authorized');
  });

  test('returns error when project is already archived', async () => {
    expect.assertions(2);
    await useCase.execute(ownerId, projectId);

    const result = await useCase.execute(ownerId, projectId);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(ProjectAlreadyArchivedError);
    }
  });

  test('creates audit log entry with correct fields', async () => {
    expect.assertions(4);
    await useCase.execute(ownerId, projectId);

    const auditLogs = await auditLogRepo.findByProjectId(projectId);
    expect(auditLogs).toHaveLength(1);
    expect(auditLogs[0].action).toBe('project.archived');
    expect(auditLogs[0].userId).toBe(ownerId);
    expect(auditLogs[0].resourceId).toBe(projectId.value);
  });

  test('success event carries request origin when context is provided', async () => {
    await useCase.execute(ownerId, projectId, {
      ipAddress: '203.0.113.7',
      userAgent: 'jest-agent',
    });

    const auditLogs = await auditLogRepo.findByProjectId(projectId);
    const archived = auditLogs.find((log) => log.action === 'project.archived');
    expect(archived).toBeDefined();
    expect(archived!.metadata.origin).toEqual({
      ipAddress: '203.0.113.7',
      userAgent: 'jest-agent',
    });
  });

  test('a failed audit write does NOT fail the operation and is logged', async () => {
    const throwingAudit = { save: jest.fn().mockRejectedValue(new Error('audit db down')) } as never;
    const logger = { warn: jest.fn() };
    useCase = new ArchiveProjectUseCase(projectRepo, memberRepo, throwingAudit, logger as never);

    const result = await useCase.execute(ownerId, projectId);

    expect(result.success).toBe(true);
    expect(logger.warn).toHaveBeenCalled();
  });
});
