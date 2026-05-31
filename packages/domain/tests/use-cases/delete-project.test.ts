import { DeleteProjectUseCase } from '../../src/use-cases/delete-project';
import { InMemoryProjectRepository } from '../repositories/in-memory-project.repository';
import { InMemoryProjectMemberRepository } from '../repositories/in-memory-project-member.repository';
import { InMemoryAuditLogRepository } from '../repositories/in-memory-audit-log.repository';
import { Project } from '../../src/entities/project';
import { ProjectMember } from '../../src/entities/project-member';
import { UserId } from '../../src/value-objects/user-id';
import { ProjectId } from '../../src/value-objects/project-id';
import { ProjectName } from '../../src/value-objects/project-name';
import { Role } from '../../src/value-objects/role';
import { PermissionDeniedError } from '../../src/errors/permission-denied';
import { ProjectNotFoundError } from '../../src/errors/project-not-found';

describe('DeleteProjectUseCase', () => {
  let projectRepo: InMemoryProjectRepository;
  let projectMemberRepo: InMemoryProjectMemberRepository;
  let auditLogRepo: InMemoryAuditLogRepository;
  let useCase: DeleteProjectUseCase;

  const ownerId = UserId.create('550e8400-e29b-41d4-a716-446655440000');
  const adminId = UserId.create('550e8400-e29b-41d4-a716-446655440001');
  const projectId = ProjectId.create('660e8400-e29b-41d4-a716-446655440001');

  beforeEach(async () => {
    projectRepo = new InMemoryProjectRepository();
    projectMemberRepo = new InMemoryProjectMemberRepository();
    auditLogRepo = new InMemoryAuditLogRepository();
    useCase = new DeleteProjectUseCase(projectRepo, projectMemberRepo, auditLogRepo);

    const project = new Project(
      projectId, ProjectName.create('To Delete'), null, [], null,
    );
    await projectRepo.save(project);
    await projectMemberRepo.addMember(new ProjectMember(projectId, ownerId, Role.create('owner')));
    await projectMemberRepo.addMember(new ProjectMember(projectId, adminId, Role.create('editor')));
  });

  test('owner deletes project - project removed, audit log created', async () => {
    const result = await useCase.execute(ownerId, projectId);
    expect(result.success).toBe(true);
    const project = await projectRepo.findById(projectId);
    expect(project).toBeNull();
    const logs = await auditLogRepo.findByProjectId(projectId);
    expect(logs.some((l) => l.action === 'project.deleted')).toBe(true);
  });

  test('non-owner (admin) cannot delete - returns PermissionDeniedError', async () => {
    const result = await useCase.execute(adminId, projectId);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBeInstanceOf(PermissionDeniedError);
  });

  test('unknown project returns ProjectNotFoundError', async () => {
    const unknownId = ProjectId.create('660e8400-e29b-41d4-a716-000000000000');
    const result = await useCase.execute(ownerId, unknownId);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBeInstanceOf(ProjectNotFoundError);
  });
});
