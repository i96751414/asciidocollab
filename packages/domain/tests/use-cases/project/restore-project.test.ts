import { RestoreProjectUseCase } from '../../../src/use-cases/project/restore-project';
import { ArchiveProjectUseCase } from '../../../src/use-cases/project/archive-project';
import { InMemoryProjectRepository } from '../../ports/project/in-memory-project.repository';
import { InMemoryProjectMemberRepository } from '../../ports/project/in-memory-project-member.repository';
import { InMemoryAuditLogRepository } from '../../ports/admin/in-memory-audit-log.repository';
import { Project } from '../../../src/entities/project';
import { ProjectMember } from '../../../src/entities/project-member';
import { ProjectId } from '../../../src/value-objects/project-id';
import { UserId } from '../../../src/value-objects/user-id';
import { ProjectName } from '../../../src/value-objects/project-name';
import { Role } from '../../../src/value-objects/role';
import { PermissionDeniedError } from '../../../src/errors/permission-denied';
import { ProjectNotFoundError } from '../../../src/errors/project-not-found';
import { ProjectNotArchivedError } from '../../../src/errors/project-not-archived';

describe('RestoreProjectUseCase', () => {
  let restoreUseCase: RestoreProjectUseCase;
  let archiveUseCase: ArchiveProjectUseCase;
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
    restoreUseCase = new RestoreProjectUseCase(projectRepo, memberRepo, auditLogRepo);
    archiveUseCase = new ArchiveProjectUseCase(projectRepo, memberRepo, auditLogRepo);

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

  test('restores archived project successfully', async () => {
    expect.assertions(2);
    await archiveUseCase.execute(ownerId, projectId);

    const result = await restoreUseCase.execute(ownerId, projectId);

    expect(result.success).toBe(true);

    const project = await projectRepo.findById(projectId);
    expect(project?.archivedAt).toBeNull();
  });

  test('returns error when project not found', async () => {
    expect.assertions(2);
    const nonExistentId = ProjectId.create('550e8400-e29b-41d4-a716-446655440099');
    const result = await restoreUseCase.execute(ownerId, nonExistentId);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(ProjectNotFoundError);
    }
  });

  test('returns error when user is not a member', async () => {
    expect.assertions(2);
    await archiveUseCase.execute(ownerId, projectId);

    const result = await restoreUseCase.execute(nonMemberId, projectId);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(PermissionDeniedError);
    }
  });

  test('returns error when project is not archived', async () => {
    expect.assertions(2);
    const result = await restoreUseCase.execute(ownerId, projectId);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(ProjectNotArchivedError);
    }
  });

  test('creates audit log entry with correct fields', async () => {
    expect.assertions(4);
    await archiveUseCase.execute(ownerId, projectId);
    await restoreUseCase.execute(ownerId, projectId);

    const auditLogs = await auditLogRepo.findByProjectId(projectId);
    expect(auditLogs).toHaveLength(2);
    expect(auditLogs[0].action).toBe('project.archived');
    expect(auditLogs[1].action).toBe('project.restored');
    expect(auditLogs[1].userId).toBe(ownerId);
  });

  test('supports full archive → restore → archive cycle', async () => {
    expect.assertions(5);
    // Archive
    await archiveUseCase.execute(ownerId, projectId);
    let project = await projectRepo.findById(projectId);
    expect(project?.archivedAt).toBeInstanceOf(Date);

    // Restore
    await restoreUseCase.execute(ownerId, projectId);
    project = await projectRepo.findById(projectId);
    expect(project?.archivedAt).toBeNull();

    // Archive again
    await archiveUseCase.execute(ownerId, projectId);
    project = await projectRepo.findById(projectId);
    expect(project?.archivedAt).toBeInstanceOf(Date);

    // Verify 3 audit log entries
    const auditLogs = await auditLogRepo.findByProjectId(projectId);
    expect(auditLogs).toHaveLength(3);
    expect(auditLogs[2].action).toBe('project.archived');
  });
});
