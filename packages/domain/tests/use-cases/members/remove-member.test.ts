import { RemoveMemberUseCase } from '../../../src/use-cases/members/remove-member';
import { InMemoryProjectMemberRepository } from '../../ports/project/in-memory-project-member.repository';
import { InMemoryAuditLogRepository } from '../../ports/admin/in-memory-audit-log.repository';
import { InMemoryProjectRepository } from '../../ports/project/in-memory-project.repository';
import { Project } from '../../../src/entities/project';
import { ProjectMember } from '../../../src/entities/project-member';
import { UserId } from '../../../src/value-objects/user-id';
import { ProjectId } from '../../../src/value-objects/project-id';
import { ProjectName } from '../../../src/value-objects/project-name';
import { Role } from '../../../src/value-objects/role';
import { CannotRemoveLastOwnerError } from '../../../src/errors/cannot-remove-last-owner';
import { PermissionDeniedError } from '../../../src/errors/permission-denied';
import { MemberNotFoundError } from '../../../src/errors/member-not-found';

describe('RemoveMemberUseCase', () => {
  let projectRepo: InMemoryProjectRepository;
  let projectMemberRepo: InMemoryProjectMemberRepository;
  let auditLogRepo: InMemoryAuditLogRepository;
  let useCase: RemoveMemberUseCase;

  const ownerId = UserId.create('550e8400-e29b-41d4-a716-446655440000');
  const editorId = UserId.create('550e8400-e29b-41d4-a716-446655440001');
  const viewerId = UserId.create('550e8400-e29b-41d4-a716-446655440002');
  const secondOwnerId = UserId.create('550e8400-e29b-41d4-a716-446655440003');
  const nonMemberId = UserId.create('550e8400-e29b-41d4-a716-446655440004');
  const projectId = ProjectId.create('660e8400-e29b-41d4-a716-446655440001');

  beforeEach(async () => {
    projectRepo = new InMemoryProjectRepository();
    projectMemberRepo = new InMemoryProjectMemberRepository();
    auditLogRepo = new InMemoryAuditLogRepository();
    useCase = new RemoveMemberUseCase(projectRepo, projectMemberRepo, auditLogRepo);

    const project = new Project(
      projectId, ProjectName.create('Test Project'), null, [], null,
    );
    await projectRepo.save(project);

    await projectMemberRepo.addMember(new ProjectMember(projectId, ownerId, Role.create('owner')));
    await projectMemberRepo.addMember(new ProjectMember(projectId, editorId, Role.create('editor')));
    await projectMemberRepo.addMember(new ProjectMember(projectId, viewerId, Role.create('viewer')));
  });

  test('owner removes an editor - member removed, audit log created', async () => {
    const result = await useCase.execute(ownerId, projectId, editorId);
    expect(result.success).toBe(true);
    const member = await projectMemberRepo.findByCompositeKey(projectId, editorId);
    expect(member).toBeNull();
    const logs = await auditLogRepo.findByProjectId(projectId);
    expect(logs.some((l) => l.action === 'member.removed')).toBe(true);
  });

  test('member.removed records request origin in audit metadata when context is provided', async () => {
    await useCase.execute(ownerId, projectId, editorId, {
      ipAddress: '203.0.113.7',
      userAgent: 'jest-agent',
    });
    const logs = await auditLogRepo.findByProjectId(projectId);
    const log = logs.find((l) => l.action === 'member.removed');
    expect(log!.metadata.origin).toEqual({ ipAddress: '203.0.113.7', userAgent: 'jest-agent' });
  });

  test('removing last owner records an authz.denied audit log with reason last_owner', async () => {
    const result = await useCase.execute(ownerId, projectId, ownerId, {
      ipAddress: '203.0.113.7',
      userAgent: 'jest-agent',
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBeInstanceOf(CannotRemoveLastOwnerError);
    const logs = await auditLogRepo.findByProjectId(projectId);
    const log = logs.find((l) => l.action === 'authz.denied');
    expect(log).toBeDefined();
    expect(log!.resourceType).toBe('ProjectMember');
    expect(log!.resourceId).toBe(ownerId.value);
    expect(log!.metadata.reason).toBe('last_owner');
  });

  test('owner removes a viewer - succeeds', async () => {
    const result = await useCase.execute(ownerId, projectId, viewerId);
    expect(result.success).toBe(true);
    const member = await projectMemberRepo.findByCompositeKey(projectId, viewerId);
    expect(member).toBeNull();
  });

  test('removing last owner returns CannotRemoveLastOwnerError', async () => {
    const result = await useCase.execute(ownerId, projectId, ownerId);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBeInstanceOf(CannotRemoveLastOwnerError);
  });

  test('owner can remove themselves when another owner exists', async () => {
    await projectMemberRepo.addMember(new ProjectMember(projectId, secondOwnerId, Role.create('owner')));
    const result = await useCase.execute(ownerId, projectId, ownerId);
    expect(result.success).toBe(true);
  });

  test('non-owner (editor) cannot remove members - returns PermissionDeniedError', async () => {
    const result = await useCase.execute(editorId, projectId, viewerId);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBeInstanceOf(PermissionDeniedError);
  });

  test('viewer cannot remove members - returns PermissionDeniedError', async () => {
    const result = await useCase.execute(viewerId, projectId, viewerId);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBeInstanceOf(PermissionDeniedError);
  });

  test('non-member cannot remove members - returns PermissionDeniedError', async () => {
    const result = await useCase.execute(nonMemberId, projectId, viewerId);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBeInstanceOf(PermissionDeniedError);
  });

  test('non-owner denial records an authz.denied audit log', async () => {
    const result = await useCase.execute(editorId, projectId, viewerId, {
      ipAddress: '203.0.113.7',
      userAgent: 'jest-agent',
    });
    expect(result.success).toBe(false);
    const logs = await auditLogRepo.findByProjectId(projectId);
    const log = logs.find((l) => l.action === 'authz.denied');
    expect(log).toBeDefined();
    expect(log!.resourceType).toBe('ProjectMember');
    expect(log!.resourceId).toBe(viewerId.value);
    expect(log!.metadata.reason).toBe('not_an_owner');
  });

  test('target not a member returns MemberNotFoundError', async () => {
    const result = await useCase.execute(ownerId, projectId, nonMemberId);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBeInstanceOf(MemberNotFoundError);
  });

  test('a failed audit write does NOT fail the operation and is logged', async () => {
    const throwingAudit = { save: jest.fn().mockRejectedValue(new Error('audit db down')) } as never;
    const logger = { warn: jest.fn() };
    useCase = new RemoveMemberUseCase(projectRepo, projectMemberRepo, throwingAudit, logger);
    const result = await useCase.execute(ownerId, projectId, editorId);
    expect(result.success).toBe(true);
    expect(logger.warn).toHaveBeenCalled();
  });
});
