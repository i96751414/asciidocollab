import { AuditLog } from '../entities/audit-log';
import { UserId } from '../value-objects/user-id';
import { ProjectId } from '../value-objects/project-id';
import { Role } from '../value-objects/role';
import { AuditLogId } from '../value-objects/audit-log-id';
import { ProjectRepository } from '../repositories/project.repository';
import { ProjectMemberRepository } from '../repositories/project-member.repository';
import { AuditLogRepository } from '../repositories/audit-log.repository';
import { PermissionDeniedError } from '../errors/permission-denied';
import { ProjectNotFoundError } from '../errors/project-not-found';
import { CannotRemoveLastOwnerError } from '../errors/cannot-remove-last-owner';
import { MemberNotFoundError } from '../errors/member-not-found';
import { DomainError } from '../errors/domain-error';
import { Result } from '../types/result';
import { randomUUID } from 'crypto';

/**
 * Changes the role of a project member.
 *
 * Authorization rules:
 * - Only owners may change roles.
 * - The last owner cannot be demoted (CannotRemoveLastOwnerError).
 */
export class ChangeMemberRoleUseCase {
  /**
   *
   */
  constructor(
    private readonly projectRepo: ProjectRepository,
    private readonly projectMemberRepo: ProjectMemberRepository,
    private readonly auditLogRepo: AuditLogRepository,
  ) {}

  /**
   *
   */
  async execute(
    actorId: UserId,
    projectId: ProjectId,
    targetUserId: UserId,
    newRole: Role,
  ): Promise<Result<void, DomainError>> {
    const callerMembership = await this.projectMemberRepo.findByCompositeKey(projectId, actorId);
    if (callerMembership?.role.value !== 'owner') {
      return { success: false, error: new PermissionDeniedError() };
    }

    const project = await this.projectRepo.findById(projectId);
    if (!project) {
      return { success: false, error: new ProjectNotFoundError(projectId.value) };
    }

    const targetMembership = await this.projectMemberRepo.findByCompositeKey(projectId, targetUserId);
    if (!targetMembership) {
      return { success: false, error: new MemberNotFoundError(projectId.value, targetUserId.value) };
    }

    // Guard: cannot demote the last owner
    if (targetMembership.role.value === 'owner' && newRole.value !== 'owner') {
      const members = await this.projectMemberRepo.findByProjectId(projectId);
      const ownerCount = members.filter((m) => m.role.value === 'owner').length;
      if (ownerCount <= 1) {
        return { success: false, error: new CannotRemoveLastOwnerError(projectId.value) };
      }
    }

    await this.projectMemberRepo.updateRole(projectId, targetUserId, newRole);

    await this.auditLogRepo.save(
      new AuditLog(
        AuditLogId.create(randomUUID()),
        actorId,
        projectId,
        'member.roleChanged',
        'ProjectMember',
        targetUserId.value,
      ),
    );

    return { success: true, value: undefined };
  }
}
