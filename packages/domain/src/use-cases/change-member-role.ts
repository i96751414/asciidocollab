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
import { CannotChangeOwnerRoleError } from '../errors/cannot-change-owner-role';
import { CannotRemoveLastAdminError } from '../errors/cannot-remove-last-admin';
import { DomainError } from '../errors/domain-error';
import { Result } from '@asciidocollab/shared';
import { randomUUID } from 'crypto';

/**
 * Changes the role of a member in a project.
 * Requires the caller to be an administrator.
 * The project owner's role cannot be changed, and the last administrator cannot be demoted.
 */
export class ChangeMemberRoleUseCase {
  constructor(
    private readonly projectRepo: ProjectRepository,
    private readonly projectMemberRepo: ProjectMemberRepository,
    private readonly auditLogRepo: AuditLogRepository,
  ) {}

  /**
   * @param actorId - The administrator requesting the role change.
   * @param projectId - The project containing the member.
   * @param targetUserId - The member whose role will change.
   * @param newRole - The new role to assign.
   * @returns void on success.
   * @throws PermissionDeniedError if the caller is not an administrator.
   * @throws ProjectNotFoundError if the project does not exist.
   * @throws CannotChangeOwnerRoleError if the target is the project owner.
   * @throws CannotRemoveLastAdminError if the target is the last administrator and the new role is not administrator.
   */
  async execute(
    actorId: UserId,
    projectId: ProjectId,
    targetUserId: UserId,
    newRole: Role,
  ): Promise<Result<void, DomainError>> {
    const callerMembership = await this.projectMemberRepo.findByCompositeKey(projectId, actorId);
    if (!callerMembership || callerMembership.role.value !== 'administrator') {
      return { success: false, error: new PermissionDeniedError() };
    }

    const project = await this.projectRepo.findById(projectId);
    if (!project) {
      return { success: false, error: new ProjectNotFoundError(projectId.value) };
    }

    if (project.ownerId.equals(targetUserId)) {
      return { success: false, error: new CannotChangeOwnerRoleError(projectId.value) };
    }

    if (newRole.value !== 'administrator') {
      const members = await this.projectMemberRepo.findByProjectId(projectId);
      const targetMember = members.find((m) => m.userId.equals(targetUserId));
      if (targetMember && targetMember.role.value === 'administrator') {
        const adminCount = members.filter((m) => m.role.value === 'administrator').length;
        if (adminCount <= 1) {
          return { success: false, error: new CannotRemoveLastAdminError(projectId.value) };
        }
      }
    }

    await this.projectMemberRepo.updateRole(projectId, targetUserId, newRole);

    const auditLog = new AuditLog(
      AuditLogId.create(randomUUID()),
      actorId,
      projectId,
      'member.roleChanged',
      'ProjectMember',
      targetUserId.value,
    );

    await this.auditLogRepo.save(auditLog);

    return { success: true, value: undefined };
  }
}
