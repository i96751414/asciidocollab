import { UpdateProjectUseCase, UpdateProjectInput } from '../../../src/use-cases/project/update-project';
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

describe('UpdateProjectUseCase', () => {
  let useCase: UpdateProjectUseCase;
  let projectRepo: InMemoryProjectRepository;
  let memberRepo: InMemoryProjectMemberRepository;
  let auditLogRepo: InMemoryAuditLogRepository;

  const ownerId = UserId.create('550e8400-e29b-41d4-a716-446655440001');
  const adminId = UserId.create('550e8400-e29b-41d4-a716-446655440002');
  const viewerId = UserId.create('550e8400-e29b-41d4-a716-446655440003');
  const projectId = ProjectId.create('550e8400-e29b-41d4-a716-446655440004');

  beforeEach(async () => {
    projectRepo = new InMemoryProjectRepository();
    memberRepo = new InMemoryProjectMemberRepository();
    auditLogRepo = new InMemoryAuditLogRepository();
    useCase = new UpdateProjectUseCase(projectRepo, memberRepo, auditLogRepo);

    const project = new Project(
      projectId,
      ProjectName.create('Test Project'),
      'Initial description',
      ['tag1'],
      null,
    );
    await projectRepo.save(project);

    const ownerMember = new ProjectMember(projectId, ownerId, Role.create('owner'), new Date());
    await memberRepo.addMember(ownerMember);

    const adminMember = new ProjectMember(projectId, adminId, Role.create('owner'), new Date());
    await memberRepo.addMember(adminMember);

    const viewerMember = new ProjectMember(projectId, viewerId, Role.create('viewer'), new Date());
    await memberRepo.addMember(viewerMember);
  });

  test('updates project name successfully', async () => {
    expect.assertions(2);
    const input: UpdateProjectInput = { name: 'Updated Project Name' };
    const result = await useCase.execute(ownerId, projectId, input);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.name.value).toBe('Updated Project Name');
    }
  });

  test('updates project description successfully', async () => {
    expect.assertions(2);
    const input: UpdateProjectInput = { description: 'Updated description' };
    const result = await useCase.execute(ownerId, projectId, input);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.description).toBe('Updated description');
    }
  });

  test('updates project tags successfully', async () => {
    expect.assertions(2);
    const input: UpdateProjectInput = { tags: ['new-tag1', 'new-tag2'] };
    const result = await useCase.execute(ownerId, projectId, input);

    expect(result.success).toBe(true);
    if (result.success) {
      expect([...result.value.tags]).toEqual(['new-tag1', 'new-tag2']);
    }
  });

  test('updates all fields at once', async () => {
    expect.assertions(4);
    const input: UpdateProjectInput = {
      name: 'All Updated',
      description: 'New description',
      tags: ['new'],
    };
    const result = await useCase.execute(ownerId, projectId, input);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.name.value).toBe('All Updated');
      expect(result.value.description).toBe('New description');
      expect([...result.value.tags]).toEqual(['new']);
    }
  });

  test('sets description to null', async () => {
    expect.assertions(2);
    const input: UpdateProjectInput = { description: null };
    const result = await useCase.execute(ownerId, projectId, input);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.description).toBeNull();
    }
  });

  test('sets tags to empty array', async () => {
    expect.assertions(2);
    const input: UpdateProjectInput = { tags: [] };
    const result = await useCase.execute(ownerId, projectId, input);

    expect(result.success).toBe(true);
    if (result.success) {
      expect([...result.value.tags]).toEqual([]);
    }
  });

  test('returns error when project not found', async () => {
    expect.assertions(2);
    const nonExistentId = ProjectId.create('550e8400-e29b-41d4-a716-446655440099');
    const input: UpdateProjectInput = { name: 'New Name' };
    const result = await useCase.execute(ownerId, nonExistentId, input);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(ProjectNotFoundError);
    }
  });

  test('returns error when user is not owner', async () => {
    expect.assertions(2);
    const input: UpdateProjectInput = { name: 'New Name' };
    const result = await useCase.execute(viewerId, projectId, input);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(PermissionDeniedError);
    }
  });

  test('records an authz.denied audit when actor is not authorized', async () => {
    const input: UpdateProjectInput = { name: 'New Name' };
    await useCase.execute(viewerId, projectId, input);

    const auditLogs = await auditLogRepo.findAll();
    const denial = auditLogs.find((log) => log.action === 'authz.denied');
    expect(denial).toBeDefined();
    expect(denial!.resourceType).toBe('Project');
    expect(denial!.resourceId).toBe(projectId.value);
    expect(denial!.metadata.reason).toBe('not_authorized');
  });

  test('allows another owner to update project', async () => {
    expect.assertions(2);
    const input: UpdateProjectInput = { name: 'Admin Updated Name' };
    const result = await useCase.execute(adminId, projectId, input);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.name.value).toBe('Admin Updated Name');
    }
  });

  test('creates audit log entry on update', async () => {
    expect.assertions(2);
    const input: UpdateProjectInput = { name: 'Audited Update' };
    await useCase.execute(ownerId, projectId, input);

    const auditLogs = await auditLogRepo.findByProjectId(projectId);
    expect(auditLogs).toHaveLength(1);
    expect(auditLogs[0].action).toBe('project.updated');
  });

  test('records before/after values for changed fields in audit metadata', async () => {
    const input: UpdateProjectInput = { name: 'Renamed Project' };
    await useCase.execute(ownerId, projectId, input);

    const auditLogs = await auditLogRepo.findByProjectId(projectId);
    const changes = auditLogs[0].metadata.changes as Record<
      string,
      { from: unknown; to: unknown }
    >;
    expect(changes.name).toEqual({ from: 'Test Project', to: 'Renamed Project' });
    // Unchanged fields are not recorded.
    expect(changes.description).toBeUndefined();
    expect(changes.tags).toBeUndefined();
  });

  test('records before/after for multiple changed fields', async () => {
    const input: UpdateProjectInput = { description: 'Updated description', tags: ['x'] };
    await useCase.execute(ownerId, projectId, input);

    const auditLogs = await auditLogRepo.findByProjectId(projectId);
    const changes = auditLogs[0].metadata.changes as Record<
      string,
      { from: unknown; to: unknown }
    >;
    expect(changes.description).toEqual({ from: 'Initial description', to: 'Updated description' });
    expect(changes.tags).toEqual({ from: ['tag1'], to: ['x'] });
    expect(changes.name).toBeUndefined();
  });

  test('records request origin in audit metadata when context is provided', async () => {
    const input: UpdateProjectInput = { name: 'Origin Project' };
    await useCase.execute(ownerId, projectId, input, {
      ipAddress: '203.0.113.9',
      userAgent: 'jest-agent',
    });

    const auditLogs = await auditLogRepo.findByProjectId(projectId);
    expect(auditLogs[0].metadata.origin).toEqual({
      ipAddress: '203.0.113.9',
      userAgent: 'jest-agent',
    });
  });

  test('a failed audit write does NOT fail the operation and is logged', async () => {
    const throwingAudit = { save: jest.fn().mockRejectedValue(new Error('audit db down')) } as never;
    const logger = { warn: jest.fn() };
    useCase = new UpdateProjectUseCase(projectRepo, memberRepo, throwingAudit, logger as never);

    const result = await useCase.execute(ownerId, projectId, { name: 'New Name' });

    expect(result.success).toBe(true);
    expect(logger.warn).toHaveBeenCalled();
  });
});
