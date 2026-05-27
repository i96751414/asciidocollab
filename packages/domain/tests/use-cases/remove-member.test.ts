import { RemoveMemberUseCase } from '../../src/use-cases/remove-member';
import { InMemoryProjectMemberRepository } from '../repositories/in-memory-project-member.repository';
import { InMemoryAuditLogRepository } from '../repositories/in-memory-audit-log.repository';
import { InMemoryProjectRepository } from '../repositories/in-memory-project.repository';
import { Project } from '../../src/entities/project';
import { ProjectMember } from '../../src/entities/project-member';
import { UserId } from '../../src/value-objects/user-id';
import { ProjectId } from '../../src/value-objects/project-id';
import { ProjectName } from '../../src/value-objects/project-name';
import { Role } from '../../src/value-objects/role';
import { CannotRemoveOwnerError } from '../../src/errors/cannot-remove-owner';
import { CannotRemoveLastAdminError } from '../../src/errors/cannot-remove-last-admin';
import { PermissionDeniedError } from '../../src/errors/permission-denied';

describe('RemoveMemberUseCase', () => {
  let projectRepo: InMemoryProjectRepository;
  let projectMemberRepo: InMemoryProjectMemberRepository;
  let auditLogRepo: InMemoryAuditLogRepository;
  let useCase: RemoveMemberUseCase;

  const adminId = UserId.create('550e8400-e29b-41d4-a716-446655440001');
  const viewerId = UserId.create('550e8400-e29b-41d4-a716-446655440002');
  const ownerId = UserId.create('550e8400-e29b-41d4-a716-446655440003');
  const projectId = ProjectId.create('660e8400-e29b-41d4-a716-446655440001');

  beforeEach(async () => {
    projectRepo = new InMemoryProjectRepository();
    projectMemberRepo = new InMemoryProjectMemberRepository();
    auditLogRepo = new InMemoryAuditLogRepository();
    useCase = new RemoveMemberUseCase(
      projectRepo,
      projectMemberRepo,
      auditLogRepo,
    );

    const project = new Project(
      projectId,
      ProjectName.create('Test Project'),
      'A test project',
      ownerId,
      [],
      null,
    );
    await projectRepo.save(project);

    await projectMemberRepo.addMember(
      new ProjectMember(projectId, adminId, Role.create('administrator')),
    );
    await projectMemberRepo.addMember(
      new ProjectMember(projectId, viewerId, Role.create('viewer')),
    );
  });

  test('admin removes a non-owner member - member removed, audit log created', async () => {
    const result = await useCase.execute(adminId, projectId, viewerId);
    expect(result.success).toBe(true);

    const member = await projectMemberRepo.findByCompositeKey(projectId, viewerId);
    expect(member).toBeNull();

    const logs = await auditLogRepo.findByProjectId(projectId);
    const removeLog = logs.find((l) => l.action === 'member.removed');
    expect(removeLog).toBeDefined();
    expect(removeLog!.userId.value).toBe(adminId.value);
    expect(removeLog!.projectId!.value).toBe(projectId.value);
    expect(removeLog!.resourceType).toBe('ProjectMember');
    expect(removeLog!.resourceId).toBe(viewerId.value);
  });

  test('owner cannot be removed - returns CannotRemoveOwnerError', async () => {
    const result = await useCase.execute(adminId, projectId, ownerId);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(CannotRemoveOwnerError);
    }
  });

  test('last admin cannot be removed - returns CannotRemoveLastAdminError', async () => {
    const result = await useCase.execute(adminId, projectId, adminId);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(CannotRemoveLastAdminError);
    }
  });

  test('non-admin caller cannot remove - returns PermissionDeniedError', async () => {
    const result = await useCase.execute(viewerId, projectId, viewerId);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(PermissionDeniedError);
    }
  });
});
