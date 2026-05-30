import { UpdateProjectUseCase, UpdateProjectInput } from '../../src/use-cases/update-project';
import { InMemoryProjectRepository } from '../repositories/in-memory-project.repository';
import { InMemoryProjectMemberRepository } from '../repositories/in-memory-project-member.repository';
import { InMemoryAuditLogRepository } from '../repositories/in-memory-audit-log.repository';
import { Project } from '../../src/entities/project';
import { ProjectMember } from '../../src/entities/project-member';
import { ProjectId } from '../../src/value-objects/project-id';
import { UserId } from '../../src/value-objects/user-id';
import { ProjectName } from '../../src/value-objects/project-name';
import { Role } from '../../src/value-objects/role';
import { PermissionDeniedError } from '../../src/errors/permission-denied';
import { ProjectNotFoundError } from '../../src/errors/project-not-found';

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
      ownerId,
      ['tag1'],
      null,
    );
    await projectRepo.save(project);

    const ownerMember = new ProjectMember(projectId, ownerId, Role.create('administrator'), new Date());
    await memberRepo.addMember(ownerMember);

    const adminMember = new ProjectMember(projectId, adminId, Role.create('administrator'), new Date());
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

  test('returns error when user is not administrator', async () => {
    expect.assertions(2);
    const input: UpdateProjectInput = { name: 'New Name' };
    const result = await useCase.execute(viewerId, projectId, input);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(PermissionDeniedError);
    }
  });

  test('allows administrator to update project', async () => {
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
});
