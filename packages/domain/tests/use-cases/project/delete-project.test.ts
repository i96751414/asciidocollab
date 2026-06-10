import { DeleteProjectUseCase } from '../../../src/use-cases/project/delete-project';
import { InMemoryProjectRepository } from '../../ports/project/in-memory-project.repository';
import { InMemoryProjectMemberRepository } from '../../ports/project/in-memory-project-member.repository';
import { InMemoryAuditLogRepository } from '../../ports/admin/in-memory-audit-log.repository';
import { InMemoryProjectFileStore } from '../../ports/storage/in-memory-project-file-store';
import { InMemoryYjsStateStore } from '../../ports/storage/in-memory-yjs-state-store';
import { FilePath } from '../../../src/value-objects/file-path';
import { YjsStateId } from '../../../src/value-objects/yjs-state-id';
import { Project } from '../../../src/entities/project';
import { ProjectMember } from '../../../src/entities/project-member';
import { UserId } from '../../../src/value-objects/user-id';
import { ProjectId } from '../../../src/value-objects/project-id';
import { ProjectName } from '../../../src/value-objects/project-name';
import { Role } from '../../../src/value-objects/role';
import { PermissionDeniedError } from '../../../src/errors/permission-denied';
import { ProjectNotFoundError } from '../../../src/errors/project-not-found';

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

  test('records an authz.denied audit when actor is not authorized', async () => {
    await useCase.execute(adminId, projectId);

    const auditLogs = await auditLogRepo.findAll();
    const denial = auditLogs.find((l) => l.action === 'authz.denied');
    expect(denial).toBeDefined();
    expect(denial!.resourceType).toBe('Project');
    expect(denial!.resourceId).toBe(projectId.value);
    expect(denial!.metadata.reason).toBe('not_authorized');
  });

  test('unknown project returns ProjectNotFoundError', async () => {
    const unknownId = ProjectId.create('660e8400-e29b-41d4-a716-000000000000');
    const result = await useCase.execute(ownerId, unknownId);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBeInstanceOf(ProjectNotFoundError);
  });

  test('success event carries request origin when context is provided', async () => {
    await useCase.execute(ownerId, projectId, {
      ipAddress: '203.0.113.7',
      userAgent: 'jest-agent',
    });

    const logs = await auditLogRepo.findAll();
    const deleted = logs.find((l) => l.action === 'project.deleted');
    expect(deleted).toBeDefined();
    expect(deleted!.metadata.origin).toEqual({
      ipAddress: '203.0.113.7',
      userAgent: 'jest-agent',
    });
  });

  test('a failed audit write does NOT fail the operation and is logged', async () => {
    const throwingAudit = { save: jest.fn().mockRejectedValue(new Error('audit db down')) } as never;
    const logger = { warn: jest.fn() };
    useCase = new DeleteProjectUseCase(
      projectRepo, projectMemberRepo, throwingAudit, undefined, undefined, logger as never,
    );

    const result = await useCase.execute(ownerId, projectId);

    expect(result.success).toBe(true);
    expect(logger.warn).toHaveBeenCalled();
  });
});

describe('DeleteProjectUseCase with storage cleanup', () => {
  let projectRepo: InMemoryProjectRepository;
  let projectMemberRepo: InMemoryProjectMemberRepository;
  let auditLogRepo: InMemoryAuditLogRepository;
  let fileStore: InMemoryProjectFileStore;
  let yjsStateStore: InMemoryYjsStateStore;
  let useCase: DeleteProjectUseCase;

  const ownerId = UserId.create('550e8400-e29b-41d4-a716-446655440000');
  const projectId = ProjectId.create('660e8400-e29b-41d4-a716-446655440001');
  const yjsId = YjsStateId.create('770e8400-e29b-41d4-a716-446655440002');

  beforeEach(async () => {
    projectRepo = new InMemoryProjectRepository();
    projectMemberRepo = new InMemoryProjectMemberRepository();
    auditLogRepo = new InMemoryAuditLogRepository();
    fileStore = new InMemoryProjectFileStore();
    yjsStateStore = new InMemoryYjsStateStore();
    useCase = new DeleteProjectUseCase(projectRepo, projectMemberRepo, auditLogRepo, fileStore, yjsStateStore);

    const project = new Project(projectId, ProjectName.create('To Delete'), null, [], null);
    await projectRepo.save(project);
    await projectMemberRepo.addMember(new ProjectMember(projectId, ownerId, Role.create('owner')));

    await fileStore.write(projectId, FilePath.create('/file.txt'), Buffer.from('hello'));
    await yjsStateStore.save(projectId, yjsId, Buffer.from([1, 2, 3]));
  });

  test('fileStore.removeProject called on deletion', async () => {
    await useCase.execute(ownerId, projectId);
    const content = await fileStore.read(projectId, FilePath.create('/file.txt'));
    expect(content).toBeNull();
  });

  test('yjsStateStore.deleteAllForProject called on deletion', async () => {
    await useCase.execute(ownerId, projectId);
    const state = await yjsStateStore.load(projectId, yjsId);
    expect(state).toBeNull();
  });
});
