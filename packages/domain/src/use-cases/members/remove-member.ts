import { UserId } from '../../value-objects/ids/user-id';
import { ProjectId } from '../../value-objects/ids/project-id';
import { ProjectRepository } from '../../ports/project/project.repository';
import { ProjectMemberRepository } from '../../ports/project/project-member.repository';
import { AuditLogRepository } from '../../ports/admin/audit-log.repository';
import { Logger } from '../../ports/observability/logger';
import { PermissionDeniedError } from '../../errors/common/permission-denied';
import { ProjectNotFoundError } from '../../errors/project/project-not-found';
import { CannotRemoveLastOwnerError } from '../../errors/members/cannot-remove-last-owner';
import { MemberNotFoundError } from '../../errors/members/member-not-found';
import { DomainError } from '../../errors/domain-error';
import { Result } from '../../types/result';
import { RequestContext } from '../../types/request-context';
import { recordAuthorizationDenial, recordAuditSuccess } from '../audit-recording';

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
    private readonly logger?: Logger,
  ) {}

  /** Removes a member from the project after verifying owner authorization. */
  async execute(
    actorId: UserId,
    projectId: ProjectId,
    targetUserId: UserId,
    context?: RequestContext,
  ): Promise<Result<void, DomainError>> {
    const callerMembership = await this.projectMemberRepo.findByCompositeKey(projectId, actorId);
    if (callerMembership?.role.value !== 'owner') {
      await recordAuthorizationDenial(
        this.auditLogRepo,
        {
          actorId,
          projectId,
          resourceType: 'ProjectMember',
          resourceId: targetUserId.value,
          reason: 'not_an_owner',
          context,
        },
        this.logger,
      );
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
        await recordAuthorizationDenial(
          this.auditLogRepo,
          {
            actorId,
            projectId,
            resourceType: 'ProjectMember',
            resourceId: targetUserId.value,
            reason: 'last_owner',
            context,
          },
          this.logger,
        );
        return { success: false, error: new CannotRemoveLastOwnerError(projectId.value) };
      }
    }

    await this.projectMemberRepo.removeMember(projectId, targetUserId);

    await recordAuditSuccess(
      this.auditLogRepo,
      {
        actorId,
        projectId,
        action: 'member.removed',
        resourceType: 'ProjectMember',
        resourceId: targetUserId.value,
        context,
      },
      this.logger,
    );

    return { success: true, value: undefined };
  }
}
