import { AuditLog } from '../entities/audit-log';
import { UserId } from '../value-objects/user-id';
import { ProjectId } from '../value-objects/project-id';
import { AuditLogId } from '../value-objects/audit-log-id';
import { ProjectRepository } from '../repositories/project.repository';
import { ProjectMemberRepository } from '../repositories/project-member.repository';
import { AuditLogRepository } from '../repositories/audit-log.repository';
import { PermissionDeniedError } from '../errors/permission-denied';
import { ProjectNotFoundError } from '../errors/project-not-found';
import { CannotRemoveOwnerError } from '../errors/cannot-remove-owner';
import { CannotRemoveLastAdminError } from '../errors/cannot-remove-last-admin';
import { MemberNotFoundError } from '../errors/member-not-found';
import { DomainError } from '../errors/domain-error';
import { Result } from '../types/result';
import { randomUUID } from 'crypto';

/**
 * Removes a member from a project.
 * Requires the caller to be an administrator of the project.
 * The project owner cannot be removed, and the last administrator cannot be removed.
 */
export class RemoveMemberUseCase {
  /**
   *
   */
  constructor(
    private readonly projectRepo: ProjectRepository,
    private readonly projectMemberRepo: ProjectMemberRepository,
    private readonly auditLogRepo: AuditLogRepository,
  ) {}

  /**
   * Removes a member from a project.
   *
   * @param actorId - The administrator requesting the removal.
   * @param projectId - The project from which to remove the member.
   * @param targetUserId - The user to remove.
   * @returns Void on success.
   * On failure returns `PermissionDeniedError` if the caller is not an administrator,
   * `ProjectNotFoundError` if the project does not exist,
   * `CannotRemoveOwnerError` if the target is the project owner,
   * `MemberNotFoundError` if the target is not a member, or
   * `CannotRemoveLastAdminError` if the target is the last administrator.
   */
  async execute(
    actorId: UserId,
    projectId: ProjectId,
    targetUserId: UserId,
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
      return { success: false, error: new CannotRemoveOwnerError(projectId.value) };
    }

    const members = await this.projectMemberRepo.findByProjectId(projectId);

    const targetMember = members.find((m) => m.userId.equals(targetUserId));
    if (!targetMember) {
      return { success: false, error: new MemberNotFoundError(projectId.value, targetUserId.value) };
    }

    if (targetMember.role.value === 'administrator') {
      const adminCount = members.filter((m) => m.role.value === 'administrator').length;
      if (adminCount <= 1) {
        return { success: false, error: new CannotRemoveLastAdminError(projectId.value) };
      }
    }

    await this.projectMemberRepo.removeMember(projectId, targetUserId);

    const auditLog = new AuditLog(
      AuditLogId.create(randomUUID()),
      actorId,
      projectId,
      'member.removed',
      'ProjectMember',
      targetUserId.value,
    );

    await this.auditLogRepo.save(auditLog);

    return { success: true, value: undefined };
  }
}
