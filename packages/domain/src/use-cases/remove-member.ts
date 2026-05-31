import { AuditLog } from '../entities/audit-log';
import { UserId } from '../value-objects/user-id';
import { ProjectId } from '../value-objects/project-id';
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
 * Removes a member from a project.
 *
 * Authorization rules:
 * - Only owners may remove members.
 * - The last owner cannot be removed (CannotRemoveLastOwnerError).
 */
export class RemoveMemberUseCase {
  /** Creates a new RemoveMemberUseCase instance. */
  constructor(
    private readonly projectRepo: ProjectRepository,
    private readonly projectMemberRepo: ProjectMemberRepository,
    private readonly auditLogRepo: AuditLogRepository,
  ) {}

  /** Removes a member from the project after verifying owner authorization. */
  async execute(
    actorId: UserId,
    projectId: ProjectId,
    targetUserId: UserId,
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

    // Guard: cannot remove the last owner
    if (targetMembership.role.value === 'owner') {
      const members = await this.projectMemberRepo.findByProjectId(projectId);
      const ownerCount = members.filter((m) => m.role.value === 'owner').length;
      if (ownerCount <= 1) {
        return { success: false, error: new CannotRemoveLastOwnerError(projectId.value) };
      }
    }

    await this.projectMemberRepo.removeMember(projectId, targetUserId);

    await this.auditLogRepo.save(
      new AuditLog(
        AuditLogId.create(randomUUID()),
        actorId,
        projectId,
        'member.removed',
        'ProjectMember',
        targetUserId.value,
      ),
    );

    return { success: true, value: undefined };
  }
}
