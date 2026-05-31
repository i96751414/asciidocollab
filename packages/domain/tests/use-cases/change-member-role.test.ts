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
import { CannotRemoveLastOwnerError } from '../../src/errors/cannot-remove-last-owner';
import { PermissionDeniedError } from '../../src/errors/permission-denied';
import { MemberNotFoundError } from '../../src/errors/member-not-found';

describe('ChangeMemberRoleUseCase', () => {
  let projectRepo: InMemoryProjectRepository;
  let projectMemberRepo: InMemoryProjectMemberRepository;
  let auditLogRepo: InMemoryAuditLogRepository;
  let useCase: ChangeMemberRoleUseCase;

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
    useCase = new ChangeMemberRoleUseCase(projectRepo, projectMemberRepo, auditLogRepo);

    const project = new Project(
      projectId, ProjectName.create('Test Project'), null, [], null,
    );
    await projectRepo.save(project);

    await projectMemberRepo.addMember(new ProjectMember(projectId, ownerId, Role.create('owner')));
    await projectMemberRepo.addMember(new ProjectMember(projectId, editorId, Role.create('editor')));
    await projectMemberRepo.addMember(new ProjectMember(projectId, viewerId, Role.create('viewer')));
  });

  test('owner changes viewer to editor - succeeds and audit log created', async () => {
    const result = await useCase.execute(ownerId, projectId, viewerId, Role.create('editor'));
    expect(result.success).toBe(true);
    const member = await projectMemberRepo.findByCompositeKey(projectId, viewerId);
    expect(member!.role.value).toBe('editor');
    const logs = await auditLogRepo.findByProjectId(projectId);
    expect(logs.some((l) => l.action === 'member.roleChanged')).toBe(true);
  });

  test('owner changes editor to viewer - succeeds', async () => {
    const result = await useCase.execute(ownerId, projectId, editorId, Role.create('viewer'));
    expect(result.success).toBe(true);
    const member = await projectMemberRepo.findByCompositeKey(projectId, editorId);
    expect(member!.role.value).toBe('viewer');
  });

  test('owner can assign owner role to another member', async () => {
    const result = await useCase.execute(ownerId, projectId, viewerId, Role.create('owner'));
    expect(result.success).toBe(true);
    const member = await projectMemberRepo.findByCompositeKey(projectId, viewerId);
    expect(member!.role.value).toBe('owner');
  });

  test('owner can demote themselves when another owner exists', async () => {
    await projectMemberRepo.addMember(new ProjectMember(projectId, secondOwnerId, Role.create('owner')));
    const result = await useCase.execute(ownerId, projectId, ownerId, Role.create('editor'));
    expect(result.success).toBe(true);
  });

  test('demoting last owner returns CannotRemoveLastOwnerError', async () => {
    const result = await useCase.execute(ownerId, projectId, ownerId, Role.create('editor'));
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBeInstanceOf(CannotRemoveLastOwnerError);
  });

  test('non-owner (editor) cannot change roles - returns PermissionDeniedError', async () => {
    const result = await useCase.execute(editorId, projectId, viewerId, Role.create('editor'));
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBeInstanceOf(PermissionDeniedError);
  });

  test('viewer cannot change roles - returns PermissionDeniedError', async () => {
    const result = await useCase.execute(viewerId, projectId, viewerId, Role.create('editor'));
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBeInstanceOf(PermissionDeniedError);
  });

  test('non-member cannot change roles - returns PermissionDeniedError', async () => {
    const result = await useCase.execute(nonMemberId, projectId, viewerId, Role.create('editor'));
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBeInstanceOf(PermissionDeniedError);
  });

  test('target not a member returns MemberNotFoundError', async () => {
    const result = await useCase.execute(ownerId, projectId, nonMemberId, Role.create('editor'));
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBeInstanceOf(MemberNotFoundError);
  });
});
