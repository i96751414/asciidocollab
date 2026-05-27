import { ChangeMemberRoleUseCase } from '../../src/use-cases/change-member-role';
import { InMemoryProjectMemberRepository } from '../repositories/in-memory-project-member.repository';
import { InMemoryAuditLogRepository } from '../repositories/in-memory-audit-log.repository';
import { InMemoryProjectRepository } from '../repositories/in-memory-project.repository';
import { Project } from '../../src/entities/project';
import { ProjectMember } from '../../src/entities/project-member';
import { UserId } from '../../src/value-objects/user-id';
import { ProjectId } from '../../src/value-objects/project-id';
import { ProjectName } from '../../src/value-objects/project-name';
import { Role } from '../../src/value-objects/role';
import { CannotChangeOwnerRoleError } from '../../src/errors/cannot-change-owner-role';
import { CannotRemoveLastAdminError } from '../../src/errors/cannot-remove-last-admin';
import { PermissionDeniedError } from '../../src/errors/permission-denied';

describe('ChangeMemberRoleUseCase', () => {
  let projectRepo: InMemoryProjectRepository;
  let projectMemberRepo: InMemoryProjectMemberRepository;
  let auditLogRepo: InMemoryAuditLogRepository;
  let useCase: ChangeMemberRoleUseCase;

  const adminId = UserId.create('550e8400-e29b-41d4-a716-446655440001');
  const viewerId = UserId.create('550e8400-e29b-41d4-a716-446655440002');
  const ownerId = UserId.create('550e8400-e29b-41d4-a716-446655440003');
  const projectId = ProjectId.create('660e8400-e29b-41d4-a716-446655440001');

  beforeEach(async () => {
    projectRepo = new InMemoryProjectRepository();
    projectMemberRepo = new InMemoryProjectMemberRepository();
    auditLogRepo = new InMemoryAuditLogRepository();
    useCase = new ChangeMemberRoleUseCase(
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

  test('admin changes viewer to editor - role updated, audit log created', async () => {
    const newRole = Role.create('editor');
    const result = await useCase.execute(adminId, projectId, viewerId, newRole);
    expect(result.success).toBe(true);

    const member = await projectMemberRepo.findByCompositeKey(projectId, viewerId);
    expect(member).not.toBeNull();
    expect(member!.role.value).toBe('editor');

    const logs = await auditLogRepo.findByProjectId(projectId);
    const changeLog = logs.find((l) => l.action === 'member.roleChanged');
    expect(changeLog).toBeDefined();
    expect(changeLog!.userId.value).toBe(adminId.value);
    expect(changeLog!.projectId!.value).toBe(projectId.value);
    expect(changeLog!.resourceType).toBe('ProjectMember');
    expect(changeLog!.resourceId).toBe(viewerId.value);
  });

  test("owner's role cannot be changed - returns CannotChangeOwnerRoleError", async () => {
    const newRole = Role.create('editor');
    const result = await useCase.execute(adminId, projectId, ownerId, newRole);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(CannotChangeOwnerRoleError);
    }
  });

  test('last admin cannot be demoted - returns CannotRemoveLastAdminError', async () => {
    const newRole = Role.create('editor');
    const result = await useCase.execute(adminId, projectId, adminId, newRole);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(CannotRemoveLastAdminError);
    }
  });

  test('non-admin caller cannot change role - returns PermissionDeniedError', async () => {
    const newRole = Role.create('editor');
    const result = await useCase.execute(viewerId, projectId, viewerId, newRole);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(PermissionDeniedError);
    }
  });
});
